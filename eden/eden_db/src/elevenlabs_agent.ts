/**
 * ElevenLabs Conversational AI - Register Call
 * Uses Twilio + our phone number. When shelter answers, we get TwiML from ElevenLabs
 * to connect the call to the agent via WebSocket.
 */

export interface RegisterCallInput {
  agentId: string;
  fromNumber: string;
  toNumber: string;
  direction?: "inbound" | "outbound";
  dynamicVariables?: Record<string, string | number | boolean>;
}

/**
 * Calls ElevenLabs register-call API. Returns TwiML to pass to Twilio.
 * Requires ELEVENLABS_API_KEY. Agent must be configured for mu-law 8kHz (Twilio).
 */
export async function registerTwilioCall(
  apiKey: string,
  input: RegisterCallInput
): Promise<string> {
  const body: Record<string, unknown> = {
    agent_id: input.agentId,
    from_number: input.fromNumber,
    to_number: input.toNumber,
    direction: input.direction ?? "outbound",
  };
  if (input.dynamicVariables && Object.keys(input.dynamicVariables).length > 0) {
    body.conversation_initiation_client_data = {
      dynamic_variables: input.dynamicVariables,
    };
  }

  const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/register-call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error("[ElevenLabs register-call]", response.status, text);
    throw new Error(`ElevenLabs register-call failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { twiml?: string; twiML?: string };
      return parsed.twiml || parsed.twiML || text;
    } catch {
      return text;
    }
  }
  return text;
}
