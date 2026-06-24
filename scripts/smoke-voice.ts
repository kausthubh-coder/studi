import { defaultRealtimeVoiceModel } from "../lib/voice-runtime/contracts";
import { createOpenAIRealtimeClientSecret } from "../lib/voice-runtime/realtime2Session";

if (process.env.RUN_LIVE_REALTIME !== "1") {
  console.log(
    "Skipped live Realtime smoke. Set RUN_LIVE_REALTIME=1 and OPENAI_API_KEY to run.",
  );
  process.exit(0);
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required for live Realtime smoke.");
}

const credentials = await createOpenAIRealtimeClientSecret({
  apiKey,
  safetyIdentifier: "studi-local-smoke",
});

console.log(
  JSON.stringify(
    {
      ok: true,
      provider: credentials.provider,
      model: credentials.model,
      expectedModel: defaultRealtimeVoiceModel,
      expiresAt: credentials.clientSecret.expiresAt ?? null,
    },
    null,
    2,
  ),
);
