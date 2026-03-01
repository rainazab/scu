export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  statusCallbackUrl?: string;
}

export interface CreateCallInput {
  to: string;
  twiml?: string;
  /** When set, Twilio fetches this URL when the call is answered. Use for ElevenLabs agent connect. */
  url?: string;
  statusCallbackUrl?: string;
  record?: boolean;
  recordingCallbackUrl?: string;
}

export async function createTwilioCall(
  config: TwilioConfig,
  input: CreateCallInput
): Promise<{ sid: string }> {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`;
  const form = new URLSearchParams();
  form.append("To", input.to);
  form.append("From", config.fromNumber);
  if (input.url) {
    form.append("Url", input.url);
    form.append("Method", "POST");
  } else if (input.twiml) {
    form.append("Twiml", input.twiml);
  } else {
    throw new Error("CreateCallInput must have either url or twiml");
  }
  const callbackUrl = input.statusCallbackUrl || config.statusCallbackUrl;
  if (callbackUrl) {
    form.append("StatusCallback", callbackUrl);
    form.append("StatusCallbackMethod", "POST");
    form.append("StatusCallbackEvent", "initiated");
    form.append("StatusCallbackEvent", "ringing");
    form.append("StatusCallbackEvent", "answered");
    form.append("StatusCallbackEvent", "completed");
  }
  if (input.record) {
    form.append("Record", "true");
    form.append("RecordingChannels", "dual");
    if (input.recordingCallbackUrl) {
      form.append("RecordingStatusCallback", input.recordingCallbackUrl);
      form.append("RecordingStatusCallbackMethod", "POST");
    }
  }

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Twilio call create failed (${response.status}): ${body}`);
  }

  const json = (await response.json()) as { sid: string };
  if (!json.sid) {
    throw new Error("Twilio response did not include call SID");
  }
  return { sid: json.sid };
}

export async function sendSms(
  config: TwilioConfig,
  to: string,
  body: string
): Promise<{ sid: string }> {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const form = new URLSearchParams();
  form.append("To", to);
  form.append("From", config.fromNumber);
  form.append("Body", body);

  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio SMS failed (${response.status}): ${text}`);
  }
  const json = (await response.json()) as { sid: string };
  return { sid: json.sid };
}

export function buildShelterIntakeTwiml(context: {
  shelterName: string;
  survivorContext: string;
  callbackNumber?: string;
  scriptText?: string;
  audioUrl?: string;
  /** When set with audioUrl, wraps Play in Gather for speech input; enables real-time conversation */
  gatherActionUrl?: string;
}): string {
  const safeContext = context.survivorContext.replace(/[<>&'"]/g, "");
  const safeScript = context.scriptText?.replace(/[<>&'"]/g, "");
  const callbackLine = context.callbackNumber
    ? ` Please call back ${context.callbackNumber} if disconnected.`
    : "";

  const splitIntoSayBlocks = (text: string): string[] => {
    const chunks = text
      .split(/\n+/)
      .flatMap((line) => line.split(/(?<=[.!?])\s+/))
      .map((line) => line.trim())
      .filter(Boolean);
    return chunks.slice(0, 12);
  };

  if (context.audioUrl) {
    const safeAudioUrl = context.audioUrl.replace(/[<>&'"]/g, "");
    const safeGatherAction = context.gatherActionUrl?.replace(/[<>&'"]/g, "");
    if (safeGatherAction) {
      return [
        "<Response>",
        `<Gather input="dtmf speech" action="${safeGatherAction}" method="POST" timeout="20" speechTimeout="8" numDigits="1" speechModel="phone_call" enhanced="true" actionOnEmptyResult="true" language="en-US" hints="yes,no,yeah,nope,beds,available,waitlist,full,no beds,hold on,one moment,let me check,intake,requirements,callback">`,
        `<Play>${safeAudioUrl}</Play>`,
        "</Gather>",
        "<Say>We didn't catch your response. Trying to connect again shortly.</Say>",
        "</Response>",
      ].join("");
    }
    return ["<Response>", `<Play>${safeAudioUrl}</Play>`, "</Response>"].join("");
  }

  if (safeScript) {
    const blocks = splitIntoSayBlocks(safeScript);
    return ["<Response>", ...blocks.map((line) => `<Say>${line}</Say>`), "</Response>"].join("");
  }

  return [
    "<Response>",
    "<Say>Hello. This is Eden calling about urgent shelter intake availability.</Say>",
    `<Say>Is this intake staff for ${context.shelterName}?</Say>`,
    `<Say>Context: ${safeContext}.${callbackLine}</Say>`,
    "<Say>Please connect us with intake staff, or share voicemail instructions for immediate placement follow-up.</Say>",
    "</Response>",
  ].join("");
}

/** Builds TwiML for conversational follow-up. CRITICAL: <Play> must be INSIDE <Gather>
 * so Twilio listens during AND after audio — otherwise speech is cut off. */
export function buildConversationFollowUpTwiml(options: {
  replyAudioUrl: string;
  gatherActionUrl?: string;
  shouldEndCall: boolean;
}): string {
  const safeUrl = options.replyAudioUrl.replace(/[<>&'"]/g, "");
  const safeAction = options.gatherActionUrl?.replace(/[<>&'"]/g, "");
  const parts = ["<Response>"];
  if (options.shouldEndCall || !safeAction) {
    parts.push(`<Play>${safeUrl}</Play>`, "<Hangup/>");
  } else {
    parts.push(
      `<Gather input="dtmf speech" action="${safeAction}" method="POST" timeout="20" speechTimeout="8" numDigits="1" speechModel="phone_call" enhanced="true" actionOnEmptyResult="true" language="en-US" hints="yes,no,yeah,nope,beds,available,waitlist,full,no beds,hold on,one moment,let me check,intake">`,
      `<Play>${safeUrl}</Play>`,
      "</Gather>",
      "<Say>Still here. Could you say that again?</Say>"
    );
  }
  parts.push("</Response>");
  return parts.join("");
}

export function buildConferenceJoinTwiml(conferenceName: string): string {
  return [
    "<Response>",
    "<Say>Connecting you to an Eden assisted transfer line.</Say>",
    "<Dial>",
    `<Conference startConferenceOnEnter="true" endConferenceOnExit="false">${conferenceName}</Conference>`,
    "</Dial>",
    "</Response>",
  ].join("");
}
