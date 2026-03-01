export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
}

export async function synthesizeElevenLabsSpeech(
  config: ElevenLabsConfig,
  text: string
): Promise<Buffer> {
  const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "xi-api-key": config.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: config.modelId,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        speed: 1.2,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${body}`);
  }

  const audio = await response.arrayBuffer();
  return Buffer.from(audio);
}
