export const defaultRealtimeVoiceModel = "gpt-realtime-2";
export const realtimeCallsUrl = "https://api.openai.com/v1/realtime/calls";

export type VoiceProvider = "openai_realtime";

export type VoiceSessionStatus =
  | "idle"
  | "requesting_credentials"
  | "connecting"
  | "connected"
  | "muted"
  | "stopping"
  | "ended"
  | "error";

export type VoiceTranscriptRole = "user" | "assistant";

export type VoiceTranscriptTurn = {
  role: VoiceTranscriptRole;
  itemId: string;
  text: string;
  isFinal: boolean;
  startedAt: number;
  committedAt?: number;
  providerEventId?: string;
};

export type VoiceToolName = "create_spark" | "open_lab" | "handoff_to_text";

export type VoiceToolActivityStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "pending_adapter";

export type VoiceToolActivity = {
  id: string;
  name: VoiceToolName;
  label: string;
  status: VoiceToolActivityStatus;
  summary?: string;
  error?: string;
};

export type VoiceSessionError = {
  code: string;
  message: string;
  retriable: boolean;
  provider?: VoiceProvider;
  status?: number;
};

export type VoiceClientSecret = {
  value: string;
  expiresAt?: number;
};

export type VoiceSessionCredentials = {
  sessionId: string;
  provider: VoiceProvider;
  model: string;
  clientSecret: VoiceClientSecret;
  realtimeUrl: string;
  createdAt: number;
};

export type VoicePersistedTurn = {
  role: VoiceTranscriptRole;
  text: string;
  providerItemId?: string;
  providerEventId?: string;
  startedAt?: number;
  committedAt?: number;
};

export type VoiceSessionConfig = {
  session: {
    type: "realtime";
    model: string;
    instructions: string;
    audio: {
      input: {
        transcription: {
          model: "gpt-realtime-whisper";
        };
        turn_detection: {
          type: "server_vad";
          idle_timeout_ms: number;
        };
      };
      output: {
        voice: string;
      };
    };
    output_modalities: ["audio"];
    tools: VoiceToolDefinition[];
    tool_choice: "auto";
  };
};

export type VoiceToolDefinition = {
  type: "function";
  name: VoiceToolName;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
};

export function isVoiceTranscriptRole(
  value: unknown,
): value is VoiceTranscriptRole {
  return value === "user" || value === "assistant";
}

export function isVoiceToolName(value: unknown): value is VoiceToolName {
  return (
    value === "create_spark" ||
    value === "open_lab" ||
    value === "handoff_to_text"
  );
}
