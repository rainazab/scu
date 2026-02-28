import { randomUUID } from "crypto";

export type WarmTransferMode = "dry_run" | "live";
export type WarmTransferStatus = "queued" | "connecting" | "bridged" | "completed" | "failed";
export type WarmTransferLeg = "survivor" | "shelter";

export interface WarmTransferSession {
  transfer_id: string;
  mode: WarmTransferMode;
  status: WarmTransferStatus;
  created_at: string;
  updated_at: string;
  conference_name: string;
  job_id: string;
  attempt_id: string;
  shelter_name: string;
  shelter_phone: string;
  survivor_phone: string;
  survivor_name?: string;
  notes?: string;
  call_sids: {
    survivor?: string;
    shelter?: string;
  };
}

export class WarmTransferStore {
  private readonly sessions = new Map<string, WarmTransferSession>();
  private readonly sidToTransfer = new Map<string, { transfer_id: string; leg: WarmTransferLeg }>();

  createSession(input: {
    mode: WarmTransferMode;
    job_id: string;
    attempt_id: string;
    shelter_name: string;
    shelter_phone: string;
    survivor_phone: string;
    survivor_name?: string;
    notes?: string;
  }): WarmTransferSession {
    const now = new Date().toISOString();
    const transfer_id = randomUUID();
    const conference_name = `eden-transfer-${transfer_id.slice(0, 8)}`;

    const session: WarmTransferSession = {
      transfer_id,
      mode: input.mode,
      status: "queued",
      created_at: now,
      updated_at: now,
      conference_name,
      job_id: input.job_id,
      attempt_id: input.attempt_id,
      shelter_name: input.shelter_name,
      shelter_phone: input.shelter_phone,
      survivor_phone: input.survivor_phone,
      survivor_name: input.survivor_name,
      notes: input.notes,
      call_sids: {},
    };
    this.sessions.set(transfer_id, session);
    return session;
  }

  listSessions(): WarmTransferSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  getSession(transfer_id: string): WarmTransferSession | undefined {
    return this.sessions.get(transfer_id);
  }

  setStatus(transfer_id: string, status: WarmTransferStatus): void {
    const session = this.sessions.get(transfer_id);
    if (!session) return;
    session.status = status;
    session.updated_at = new Date().toISOString();
  }

  bindCallSid(transfer_id: string, leg: WarmTransferLeg, sid: string): void {
    const session = this.sessions.get(transfer_id);
    if (!session) return;
    session.call_sids[leg] = sid;
    session.updated_at = new Date().toISOString();
    this.sidToTransfer.set(sid, { transfer_id, leg });
  }

  findBySid(sid: string): { session: WarmTransferSession; leg: WarmTransferLeg } | undefined {
    const pointer = this.sidToTransfer.get(sid);
    if (!pointer) return undefined;
    const session = this.sessions.get(pointer.transfer_id);
    if (!session) return undefined;
    return { session, leg: pointer.leg };
  }

  reset(): void {
    this.sessions.clear();
    this.sidToTransfer.clear();
  }
}
