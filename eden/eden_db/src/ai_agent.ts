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

const MAX_SCRIPT_CHARS = 1400;

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
  const callbackLine = input.callbackNumber
    ? `If disconnected, please return the call at ${input.callbackNumber}.`
    : "If disconnected, we can call back through official shelter channels.";

  return [
    `Hi, I'm Eden. I'm calling on behalf of someone who needs emergency shelter. Is this the intake line for ${input.shelterName}?`,
    `I'm reaching out from a placement coordination service. We have a person seeking safe housing. Brief context: ${input.survivorContext}`,
    "Can you tell me: do you have any beds available tonight?",
    "If not, is there a waitlist or a good time for us to call back?",
    "What intake requirements should we have ready before they arrive?",
    callbackLine,
    "Thank you. For immediate danger, people are directed to 911.",
  ].join("\n");
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
            "Eden is a placement coordinator calling shelters ON BEHALF of a survivor seeking housing.",
            "The person answering is the SHELTER's intake staff. Eden does NOT work at the shelter.",
            "Draft a brief outbound call script: Eden introduces herself as calling on behalf of someone who needs shelter, asks if this is intake for [shelter], shares brief survivor context, and asks about availability and requirements.",
            "Write natural spoken language, 5-8 short lines. No placeholders like [your name] or brackets.",
            "Eden must never imply she works at or represents the shelter. She represents the survivor seeking help.",
            "Output plain script text only.",
          ].join(" "),
      },
      {
        role: "user",
        content: [
          `Draft script for Eden calling ${input.shelterName} on behalf of a survivor.`,
          `Survivor context: ${input.survivorContext}.`,
          `Callback: ${input.callbackNumber || "none"}.`,
          "Ask about bed availability, waitlist, and intake requirements. Include a brief safety line.",
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

function buildContextualFallback(userSpeech: string): ConversationalReplyResult {
  const t = userSpeech.toLowerCase().trim();
  if (!t || t === "(no speech detected)") {
    return { reply: "I didn't quite catch that. Could you repeat? Do you have any beds available tonight?", shouldEndCall: false };
  }
  if (/(full capacity|no beds|no availability|nothing available|all full|we're full|at capacity|no room)/.test(t)) {
    return { reply: "I understand you're at full capacity. Thank you for letting us know. We'll look for other options. Goodbye.", shouldEndCall: true };
  }
  if (/(waitlist|wait list|wait-list)/.test(t)) {
    return { reply: "Thanks, I'll note the waitlist. We'll follow up on next steps. Goodbye.", shouldEndCall: true };
  }
  if (/(available|have beds|can take|yes we have|we have \d+|couple of beds)/.test(t)) {
    return { reply: "Great, thank you. What are the intake requirements we should prepare? I'll share that with the caller.", shouldEndCall: false };
  }
  if (/(hold on|one moment|let me check|give me a sec)/.test(t)) {
    return { reply: "Sure, take your time. I'll hold.", shouldEndCall: false };
  }
  if (/(who is this|who are you|hello|hi|yes|yeah)\s*\.?$/.test(t) || t.length < 5) {
    return { reply: "This is Eden calling on behalf of someone who needs shelter. I'm reaching out to see if you have any beds available tonight. Could you let me know?", shouldEndCall: false };
  }
  return { reply: "Got it. Could you tell me more about availability or intake requirements? Or if you're full, I can look elsewhere.", shouldEndCall: false };
}

export async function generateConversationalReply(
  input: ConversationalReplyInput
): Promise<{ result: ConversationalReplyResult; source: "fallback" | "openai" }> {
  const genericFallback: ConversationalReplyResult = {
    reply: "Thanks for that information. We'll follow up through our usual channels. Goodbye.",
    shouldEndCall: true,
  };

  if (!aiEnabled()) {
    const lastUser = input.conversationHistory.filter((t) => t.role === "user").pop()?.content || "";
    const contextual = lastUser && lastUser !== "(no speech detected)" ? buildContextualFallback(lastUser) : genericFallback;
    return { result: contextual, source: "fallback" };
  }

  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content: [
        "You are Eden, a placement coordinator. You called the SHELTER (not the survivor) to ask about availability on behalf of someone seeking housing.",
        `You called ${input.shelterName}. The person on the phone is SHELTER intake staff. Survivor context: ${input.survivorContext}. Callback: ${input.callbackNumber || "none"}.`,
        "Respond naturally and briefly based on what the shelter staff just said. You represent the survivor, not the shelter.",
        "Goal: confirm bed availability, intake requirements, waitlist info, or next steps.",
        "Keep replies to 1-3 short sentences, conversational.",
        "If they gave availability (beds, waitlist, requirements), thank them and wrap up.",
        "If they asked you to repeat or seemed confused, briefly clarify.",
        "NEVER use the generic phrase 'Thanks for that information we'll follow up through our usual channels.' Always acknowledge specifically what they said.",
        "Output JSON only with keys: reply (string, what Eden says next), shouldEndCall (boolean, true if call is effectively complete).",
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
    const contextual = lastUser && lastUser !== "(no speech detected)" ? buildContextualFallback(lastUser) : genericFallback;
    if (!reply) return { result: contextual, source: "fallback" };
    return { result: { reply, shouldEndCall }, source: "openai" };
  } catch (error) {
    console.warn("OpenAI conversational reply failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    const lastUser = input.conversationHistory.filter((t) => t.role === "user").pop()?.content || "";
    const contextual = lastUser && lastUser !== "(no speech detected)" ? buildContextualFallback(lastUser) : genericFallback;
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
