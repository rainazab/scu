import { randomUUID } from "crypto";

export type RiskLevel = "low" | "high";

export interface RiskAssessment {
  level: RiskLevel;
  matched_keywords: string[];
  summary: string;
}

export interface EscalationEvent {
  escalation_id: string;
  created_at: string;
  source: "call_job" | "warm_transfer" | "transcript";
  reference_id: string;
  reason: string;
  details?: string;
}

export class SafetyControls {
  private readonly blockedNumbers = new Set<string>();
  private escalationEvents: EscalationEvent[] = [];
  private readonly requireEscalationForLive: boolean;
  private readonly riskKeywords: string[];

  constructor() {
    const configured = (process.env.EDEN_NO_CALLBACK_NUMBERS || "")
      .split(",")
      .map((v) => this.normalizePhone(v))
      .filter((v): v is string => !!v);
    configured.forEach((v) => this.blockedNumbers.add(v));

    this.requireEscalationForLive = (process.env.EDEN_REQUIRE_ESCALATION_FOR_LIVE || "true").toLowerCase() !== "false";
    this.riskKeywords = [
      "immediate danger",
      "weapon",
      "homicide",
      "suicide",
      "life threatening",
      "child in danger",
      "trafficking",
    ];
  }

  normalizePhone(raw: string): string | null {
    const digits = String(raw || "").replace(/[^\d+]/g, "");
    if (!digits) return null;
    if (digits.startsWith("+")) return digits;
    if (digits.length === 10) return `+1${digits}`;
    return `+${digits}`;
  }

  isBlockedNumber(raw: string | undefined | null): boolean {
    if (!raw) return false;
    const normalized = this.normalizePhone(raw);
    if (!normalized) return false;
    return this.blockedNumbers.has(normalized);
  }

  listBlockedNumbers(): string[] {
    return Array.from(this.blockedNumbers.values()).sort();
  }

  addBlockedNumber(raw: string): { added: boolean; normalized?: string } {
    const normalized = this.normalizePhone(raw);
    if (!normalized) return { added: false };
    const existing = this.blockedNumbers.has(normalized);
    this.blockedNumbers.add(normalized);
    return { added: !existing, normalized };
  }

  removeBlockedNumber(raw: string): { removed: boolean; normalized?: string } {
    const normalized = this.normalizePhone(raw);
    if (!normalized) return { removed: false };
    return { removed: this.blockedNumbers.delete(normalized), normalized };
  }

  assessRisk(text: string): RiskAssessment {
    const lower = String(text || "").toLowerCase();
    const matched = this.riskKeywords.filter((k) => lower.includes(k));
    if (matched.length > 0) {
      return {
        level: "high",
        matched_keywords: matched,
        summary: "High-risk language detected. Human escalation recommended.",
      };
    }
    return {
      level: "low",
      matched_keywords: [],
      summary: "No high-risk terms detected.",
    };
  }

  shouldBlockLiveAction(risk: RiskAssessment, escalationApproved: boolean): boolean {
    if (!this.requireEscalationForLive) return false;
    if (risk.level !== "high") return false;
    return !escalationApproved;
  }

  redactForAnonymousMode(text: string): string {
    let redacted = String(text || "");
    redacted = redacted.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
    redacted = redacted.replace(/\+?\d[\d\s().-]{7,}\d/g, "[REDACTED_PHONE]");
    redacted = redacted.replace(/\b\d{2,}\b/g, "[REDACTED_NUMBER]");
    return redacted;
  }

  recordEscalation(input: Omit<EscalationEvent, "escalation_id" | "created_at">): EscalationEvent {
    const event: EscalationEvent = {
      escalation_id: randomUUID(),
      created_at: new Date().toISOString(),
      ...input,
    };
    this.escalationEvents.unshift(event);
    return event;
  }

  listEscalations(limit = 100): EscalationEvent[] {
    return this.escalationEvents.slice(0, limit);
  }

  seedEscalations(events: EscalationEvent[]): void {
    this.escalationEvents = [...events, ...this.escalationEvents]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 1000);
  }

  config() {
    return {
      require_escalation_for_live: this.requireEscalationForLive,
      blocked_numbers_count: this.blockedNumbers.size,
      risk_keywords: this.riskKeywords,
    };
  }
}
