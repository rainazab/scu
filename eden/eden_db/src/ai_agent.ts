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

interface OpenAIMessage {
  role: "system" | "user";
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
    : "If disconnected, we will follow up through official shelter channels.";

  return [
    `Hello, this is Eden. I am calling ${input.shelterName} to check domestic violence shelter intake availability.`,
    `Context: ${input.survivorContext}`,
    "Questions:",
    "1) Do you currently have available beds today?",
    "2) If not, do you have a waitlist or estimated callback time?",
    "3) What intake requirements should we prepare before arrival?",
    "4) Can you support urgent child-safe placement if needed?",
    callbackLine,
    "Safety note: this call is for shelter coordination support and does not replace emergency response. For immediate danger, call 911.",
  ].join("\n");
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
          "You draft trauma-informed shelter outreach call scripts. Keep concise and avoid legal/medical advice.",
      },
      {
        role: "user",
        content: `Draft a phone script for outreach to ${input.shelterName}. Context: ${input.survivorContext}. Callback: ${input.callbackNumber || "none"}. Include a brief safety disclaimer.`,
      },
    ]);
    return { script: text, source: "openai" };
  } catch {
    return { script: buildFallbackScript(input), source: "fallback" };
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
