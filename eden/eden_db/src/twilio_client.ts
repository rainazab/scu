export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  statusCallbackUrl?: string;
}

export interface CreateCallInput {
  to: string;
  twiml: string;
}

export async function createTwilioCall(
  config: TwilioConfig,
  input: CreateCallInput
): Promise<{ sid: string }> {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`;
  const form = new URLSearchParams();
  form.append("To", input.to);
  form.append("From", config.fromNumber);
  form.append("Twiml", input.twiml);
  if (config.statusCallbackUrl) {
    form.append("StatusCallback", config.statusCallbackUrl);
    form.append("StatusCallbackMethod", "POST");
    form.append("StatusCallbackEvent", "initiated");
    form.append("StatusCallbackEvent", "ringing");
    form.append("StatusCallbackEvent", "answered");
    form.append("StatusCallbackEvent", "completed");
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

export function buildShelterIntakeTwiml(context: {
  shelterName: string;
  survivorContext: string;
  callbackNumber?: string;
}): string {
  const safeContext = context.survivorContext.replace(/[<>&'"]/g, "");
  const callbackLine = context.callbackNumber
    ? ` Please call back ${context.callbackNumber} if disconnected.`
    : "";

  return [
    "<Response>",
    `<Say voice="Polly.Joanna">Hello. This is Eden, coordinating domestic violence shelter availability checks.</Say>`,
    `<Say voice="Polly.Joanna">We are calling ${context.shelterName} to ask about current intake capacity and requirements.</Say>`,
    `<Say voice="Polly.Joanna">Context: ${safeContext}.${callbackLine}</Say>`,
    `<Say voice="Polly.Joanna">Please connect us with intake staff or leave a voicemail instruction.</Say>`,
    "</Response>",
  ].join("");
}
