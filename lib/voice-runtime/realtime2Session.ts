import {
  defaultRealtimeVoiceModel,
  realtimeCallsUrl,
  type VoiceClientSecret,
  type VoiceSessionConfig,
  type VoiceSessionCredentials,
  type VoiceSessionError,
  type VoiceToolDefinition,
} from "./contracts";

const openAiClientSecretsUrl =
  "https://api.openai.com/v1/realtime/client_secrets";

type FetchLike = typeof fetch;

export const voiceToolDefinitions: VoiceToolDefinition[] = [
  {
    type: "function",
    name: "create_spark",
    description:
      "Create a Studi Spark when the learner asks for an interactive visual, graph, coding exercise, quiz, or flash card.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        sparkId: {
          type: "string",
          enum: [
            "scene",
            "desmos_graph",
            "code_playground",
            "web_playground",
            "quiz",
            "flash_card",
          ],
        },
        context: {
          type: "string",
          description:
            "The learner goal and exact concept the Spark should teach.",
        },
        title: { type: "string" },
        summary: { type: "string" },
      },
      required: ["sparkId", "context"],
    },
  },
  {
    type: "function",
    name: "open_lab",
    description:
      "Request a coding lab handoff. Labs are pending in this branch, so this returns an honest pending adapter state.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        goal: { type: "string" },
        language: { type: "string" },
      },
      required: ["goal"],
    },
  },
  {
    type: "function",
    name: "handoff_to_text",
    description:
      "Ask Studi to continue a complex or risky request in normal chat text instead of voice.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    },
  },
];

export function buildRealtimeVoiceInstructions(): string {
  return [
    "You are Studi speaking over voice. Keep the same single Studi identity as chat.",
    "Tutor through questions and short intuition-building prompts. Do not invent a separate voice persona.",
    "Use create_spark only for low-risk learning artifacts that would help more than spoken explanation.",
    "If the learner asks for code labs, track editing, account changes, or any complex durable action, call handoff_to_text or open_lab instead of pretending it is complete.",
    "Keep spoken replies concise. Let the learner feel they are discovering the idea.",
  ].join("\n");
}

export function buildOpenAIRealtimeSessionConfig({
  model = defaultRealtimeVoiceModel,
  voice = "marin",
  idleTimeoutMs = 6_000,
}: {
  model?: string;
  voice?: string;
  idleTimeoutMs?: number;
} = {}): VoiceSessionConfig {
  return {
    session: {
      type: "realtime",
      model,
      instructions: buildRealtimeVoiceInstructions(),
      audio: {
        input: {
          transcription: {
            model: "gpt-realtime-whisper",
          },
          turn_detection: {
            type: "server_vad",
            idle_timeout_ms: idleTimeoutMs,
          },
        },
        output: {
          voice,
        },
      },
      output_modalities: ["audio"],
      tools: voiceToolDefinitions,
      tool_choice: "auto",
    },
  };
}

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function normalizeOpenAIClientSecretResponse(
  payload: unknown,
): VoiceClientSecret {
  if (!payload || typeof payload !== "object") {
    throw new Error("OpenAI Realtime client secret response was empty.");
  }

  const root = payload as Record<string, unknown>;
  const nested =
    root.client_secret && typeof root.client_secret === "object"
      ? (root.client_secret as Record<string, unknown>)
      : root;

  const value = getString(nested, "value") ?? getString(root, "value");
  if (!value) {
    throw new Error("OpenAI Realtime client secret response omitted value.");
  }

  return {
    value,
    expiresAt:
      getNumber(nested, "expires_at") ?? getNumber(root, "expires_at"),
  };
}

export function toVoiceSessionError(error: unknown): VoiceSessionError {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message =
      getString(record, "message") ??
      (error instanceof Error ? error.message : undefined);
    const status = getNumber(record, "status");
    return {
      code: getString(record, "code") ?? "voice_session_error",
      message: message ?? "Voice session failed.",
      retriable: status === undefined || status >= 500,
      provider: "openai_realtime",
      status,
    };
  }

  return {
    code: "voice_session_error",
    message: error instanceof Error ? error.message : String(error),
    retriable: true,
    provider: "openai_realtime",
  };
}

export async function createOpenAIRealtimeClientSecret({
  apiKey,
  safetyIdentifier,
  fetchImpl = fetch,
  model = defaultRealtimeVoiceModel,
  now = Date.now(),
}: {
  apiKey: string;
  safetyIdentifier: string;
  fetchImpl?: FetchLike;
  model?: string;
  now?: number;
}): Promise<VoiceSessionCredentials> {
  if (!apiKey.trim()) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const response = await fetchImpl(openAiClientSecretsUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier,
    },
    body: JSON.stringify(buildOpenAIRealtimeSessionConfig({ model })),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object"
        ? JSON.stringify(payload)
        : response.statusText;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const clientSecret = normalizeOpenAIClientSecretResponse(payload);

  return {
    sessionId: crypto.randomUUID(),
    provider: "openai_realtime",
    model,
    clientSecret,
    realtimeUrl: realtimeCallsUrl,
    createdAt: now,
  };
}
