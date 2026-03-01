import https from "https";

export interface ScriptInput {
  shelterName: string;
  survivorContext: string;
  callbackNumber?: string;
}

export interface ParsedTranscript {
  availability_status: "available" | "waitlist" | "unknown";
  reported_available_beds?: number;
  intake_requirements: string[];
  needs_human_followup: boolean;
  summary: string;
}

const MAX_SCRIPT_CHARS = 600;

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

function postJson(url: string, body: string, apiKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`OpenAI error (${res.statusCode}): ${data}`));
            return;
          }
          resolve(data);
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function aiEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

function buildFallbackScript(input: ScriptInput): string {
  const lines = [
    `Hi, this is Eden. I'm calling on behalf of someone who needs shelter tonight. Is this intake for ${input.shelterName}?`,
    "Do you have any beds available? Or a waitlist?",
  ];
  if (input.callbackNumber) {
    lines.push(`If we get disconnected, please call back at ${input.callbackNumber}.`);
  }
  lines.push("Thanks.");
  return lines.join(" ");
}

function sanitizeScript(raw: string): string {
  return raw
    .replace(/\[(?:your|my)\s+name\]/gi, "Eden")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_SCRIPT_CHARS);
}

function normalizeParsed(input: Partial<ParsedTranscript>): ParsedTranscript {
  const availability =
    input.availability_status === "available" ||
    input.availability_status === "waitlist" ||
    input.availability_status === "unknown"
      ? input.availability_status
      : "unknown";

  return {
    availability_status: availability,
    reported_available_beds:
      typeof input.reported_available_beds === "number" ? input.reported_available_beds : undefined,
    intake_requirements: Array.isArray(input.intake_requirements)
      ? input.intake_requirements.map((x) => String(x)).slice(0, 10)
      : [],
    needs_human_followup: Boolean(input.needs_human_followup),
    summary: String(input.summary || "No structured summary available.").slice(0, 500),
  };
}

function parseTranscriptFallback(transcript: string): ParsedTranscript {
  const t = transcript.toLowerCase();
  let availability_status: ParsedTranscript["availability_status"] = "unknown";

  if (/(beds? available|have availability|can take today|can accept today)/.test(t)) {
    availability_status = "available";
  } else if (/(waitlist|no beds|full capacity|check back)/.test(t)) {
    availability_status = "waitlist";
  }

  const bedMatch = t.match(/(\d+)\s+(beds?|slots?)\s+(available|open)/);
  const reportedBeds = bedMatch ? Number(bedMatch[1]) : undefined;

  const requirements: string[] = [];
  if (/id|identification/.test(t)) requirements.push("ID required");
  if (/intake form|paperwork/.test(t)) requirements.push("Intake paperwork required");
  if (/call back|callback/.test(t)) requirements.push("Requested callback");
  if (/children/.test(t)) requirements.push("Discussed child placement");

  const needs_human_followup =
    /(immediate danger|urgent|crisis|supervisor|manager|law enforcement)/.test(t) ||
    availability_status === "waitlist";

  const summary =
    availability_status === "available"
      ? "Shelter indicated availability; confirm requirements and transport."
      : availability_status === "waitlist"
        ? "Shelter reported no immediate beds; follow-up required."
        : "Availability unclear from transcript; human review recommended.";

  return {
    availability_status,
    reported_available_beds: reportedBeds,
    intake_requirements: requirements,
    needs_human_followup,
    summary,
  };
}

async function runOpenAI(messages: OpenAIMessage[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const payload = JSON.stringify({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    messages,
  });
  const raw = await postJson("https://api.openai.com/v1/chat/completions", payload, apiKey);
  const parsed = JSON.parse(raw) as OpenAIResponse;
  const content = parsed.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content from OpenAI");
  return content;
}

export async function generateCallScript(input: ScriptInput): Promise<{ script: string; source: "fallback" | "openai" }> {
  if (!aiEnabled()) {
    return { script: buildFallbackScript(input), source: "fallback" };
  }

  try {
    const text = await runOpenAI([
      {
        role: "system",
        content:
          [
            "Eden is a placement coordinator calling shelters on behalf of a survivor seeking housing.",
            "Draft a SHORT outbound call script: introduce yourself, ask if this is intake for [shelter], ask about beds and waitlist.",
            "STRICT: 3-4 short sentences maximum. Under 60 words total. Get straight to the point. No lengthy context dumps.",
            "No placeholders or brackets. Output plain script text only.",
          ].join(" "),
      },
      {
        role: "user",
        content: [
          `Draft script for Eden calling ${input.shelterName}.`,
          `Context: ${input.survivorContext.slice(0, 80)}.`,
          `Callback: ${input.callbackNumber || "none"}.`,
          "Keep it tight: who you are, intake line check, beds or waitlist. No long explanations.",
        ].join(" "),
      },
    ]);
    const cleaned = sanitizeScript(text);
    if (!cleaned) {
      return { script: buildFallbackScript(input), source: "fallback" };
    }
    return { script: cleaned, source: "openai" };
  } catch (error) {
    console.warn("OpenAI script generation failed; using fallback script", {
      message: error instanceof Error ? error.message : "unknown error",
      shelter: input.shelterName,
    });
    return { script: buildFallbackScript(input), source: "fallback" };
  }
}

export interface ConversationalReplyInput {
  shelterName: string;
  survivorContext: string;
  callbackNumber?: string;
  conversationHistory: Array<{ role: "assistant" | "user"; content: string }>;
}

export interface ConversationalReplyResult {
  reply: string;
  shouldEndCall: boolean;
}

/** Patterns for "no beds / full capacity" - match liberally to avoid repeating the availability question */
const NO_BEDS_PATTERNS =
  /(full capacity|we're full|we are full|were full|at capacity|at full|no beds|no bed|no availability|nothing available|all full|no room|no space|we're at full|we are at full|right now.*full|currently.*full|all booked|fully booked|fully occupied|all filled|we don't have|don't have any|no space|no rooms|sadly no|unfortunately no|not right now|nothing right now|not tonight|no beds tonight|no availability tonight)/i;

/** Patterns for "we have beds" */
const HAS_BEDS_PATTERNS =
  /(available|have beds|have a bed|can take|yes we have|we have \d+|couple of beds|we do have|we've got|a few beds|one or two)/i;

function buildContextualFallback(userSpeech: string): ConversationalReplyResult {
  const t = userSpeech.toLowerCase().trim();
  if (!t || t === "(no speech detected)") {
    return { reply: "I didn't catch that. Do you have any beds available tonight?", shouldEndCall: false };
  }
  if (NO_BEDS_PATTERNS.test(t)) {
    return { reply: "Got it, thanks. We'll try other shelters. Goodbye.", shouldEndCall: true };
  }
  if (/(waitlist|wait list|wait-list|on a wait)/i.test(t)) {
    return { reply: "Thanks, I'll note the waitlist. Goodbye.", shouldEndCall: true };
  }
  if (HAS_BEDS_PATTERNS.test(t)) {
    return { reply: "Thanks. What intake requirements do we need?", shouldEndCall: false };
  }
  if (/(hold on|one moment|let me check|give me a sec|just a sec|hang on|let me transfer|transfer you)/i.test(t)) {
    return { reply: "Sure, I'll hold.", shouldEndCall: false };
  }
  if (/(who is this|who are you|who's calling)\s*\.?$/i.test(t) || (t.length < 6 && /^(hello|hi|yes|yeah|ok)$/i.test(t))) {
    return { reply: "This is Eden. I'm calling about bed availability for someone who needs shelter tonight. Do you have any beds?", shouldEndCall: false };
  }
  // Don't loop: end call instead of asking again
  return { reply: "Thanks for your time. We'll try other shelters. Goodbye.", shouldEndCall: true };
}

export async function generateConversationalReply(
  input: ConversationalReplyInput
): Promise<{ result: ConversationalReplyResult; source: "fallback" | "openai" }> {
  const lastUser = input.conversationHistory.filter((t) => t.role === "user").pop()?.content || "";
  const hasClearUserSpeech = lastUser && lastUser !== "(no speech detected)" && lastUser.length > 3;

  // Prefer fast regex-based fallback for clear availability signals—avoids lag and repetition
  if (hasClearUserSpeech) {
    const contextual = buildContextualFallback(lastUser);
    const isAvailabilityRelated =
      NO_BEDS_PATTERNS.test(lastUser) ||
      HAS_BEDS_PATTERNS.test(lastUser) ||
      /(waitlist|wait list|hold on|one moment|let me check|who is this|who are you)/i.test(lastUser);
    if (isAvailabilityRelated) {
      return { result: contextual, source: "fallback" };
    }
  }

  if (!aiEnabled()) {
    const contextual = hasClearUserSpeech ? buildContextualFallback(lastUser) : { reply: "Thanks. We'll follow up. Goodbye.", shouldEndCall: true };
    return { result: contextual, source: "fallback" };
  }

  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content: [
        "You are Eden, a placement coordinator. You called a shelter to ask about bed availability on behalf of someone seeking housing.",
        `Shelter: ${input.shelterName}. Survivor context: ${input.survivorContext}.`,
        "Rules: Keep replies to 1-2 SHORT sentences. Get to the point.",
        "If they said NO beds / full capacity / waitlist only: thank them briefly and set shouldEndCall true. Do NOT ask about availability again.",
        "If they said they HAVE beds: ask about intake requirements, shouldEndCall false.",
        "If they asked to hold/transfer: say you'll hold, shouldEndCall false.",
        "Output JSON only: { reply: string, shouldEndCall: boolean }.",
      ].join(" "),
    },
    ...input.conversationHistory.map((t) => ({
      role: t.role,
      content: t.content,
    })),
  ];

  try {
    const text = await runOpenAI(messages);
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as { reply?: string; shouldEndCall?: boolean };
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, 500) : "";
    const shouldEndCall = Boolean(parsed.shouldEndCall);
    const lastUser = input.conversationHistory.filter((t) => t.role === "user").pop()?.content || "";
    const contextual = lastUser && lastUser !== "(no speech detected)" ? buildContextualFallback(lastUser) : { reply: "Thanks. We'll follow up. Goodbye.", shouldEndCall: true };
    if (!reply) return { result: contextual, source: "fallback" };
    return { result: { reply, shouldEndCall }, source: "openai" };
  } catch (error) {
    console.warn("OpenAI conversational reply failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    const lastUser = input.conversationHistory.filter((t) => t.role === "user").pop()?.content || "";
    const contextual = lastUser && lastUser !== "(no speech detected)" ? buildContextualFallback(lastUser) : { reply: "Thanks. We'll follow up. Goodbye.", shouldEndCall: true };
    return { result: contextual, source: "fallback" };
  }
}

export async function parseTranscript(
  transcript: string
): Promise<{ parsed: ParsedTranscript; source: "fallback" | "openai" }> {
  if (!aiEnabled()) {
    return { parsed: parseTranscriptFallback(transcript), source: "fallback" };
  }

  try {
    const content = await runOpenAI([
      {
        role: "system",
        content:
          "Extract structured shelter intake outcomes from call transcripts. Return JSON only with keys: availability_status, reported_available_beds, intake_requirements, needs_human_followup, summary.",
      },
      {
        role: "user",
        content: transcript,
      },
    ]);
    const parsed = normalizeParsed(JSON.parse(content) as Partial<ParsedTranscript>);
    return { parsed, source: "openai" };
  } catch {
    return { parsed: parseTranscriptFallback(transcript), source: "fallback" };
  }
}
