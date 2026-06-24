import { describe, expect, it, vi } from "vitest";
import { getVoiceStatusLabel } from "@/components/voice/VoiceControl";
import { defaultRealtimeVoiceModel } from "@/lib/voice-runtime/contracts";
import {
  buildOpenAIRealtimeSessionConfig,
  createOpenAIRealtimeClientSecret,
  normalizeOpenAIClientSecretResponse,
  voiceToolDefinitions,
} from "@/lib/voice-runtime/realtime2Session";
import {
  initialVoiceTranscriptState,
  normalizeVoiceTurnsForPersistence,
  reduceVoiceTranscriptEvent,
  selectVoiceTranscriptPreview,
} from "@/lib/voice-runtime/transcriptReducer";

describe("voice runtime contracts", () => {
  it("builds a Realtime 2 voice session with safe app-owned tools", () => {
    const config = buildOpenAIRealtimeSessionConfig();

    expect(config.session.model).toBe(defaultRealtimeVoiceModel);
    expect(config.session.type).toBe("realtime");
    expect(config.session.audio.input.transcription.model).toBe(
      "gpt-realtime-whisper",
    );
    expect(config.session.output_modalities).toEqual(["audio"]);
    expect(config.session.tools.map((tool) => tool.name)).toEqual([
      "create_spark",
      "open_lab",
      "handoff_to_text",
    ]);
    expect(
      voiceToolDefinitions.find((tool) => tool.name === "open_lab")
        ?.description,
    ).toContain("pending");
  });

  it("normalizes both documented and flattened client secret responses", () => {
    expect(
      normalizeOpenAIClientSecretResponse({
        client_secret: { value: "ek_test", expires_at: 123 },
      }),
    ).toEqual({ value: "ek_test", expiresAt: 123 });

    expect(
      normalizeOpenAIClientSecretResponse({
        value: "ek_flat",
      }),
    ).toEqual({ value: "ek_flat", expiresAt: undefined });
  });

  it("creates an OpenAI client secret through a mocked server-side request", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer sk-test",
      );
      expect(
        (init.headers as Record<string, string>)["OpenAI-Safety-Identifier"],
      ).toBe("hashed-user");
      expect(body.session.model).toBe(defaultRealtimeVoiceModel);

      return new Response(
        JSON.stringify({
          client_secret: { value: "ek_mock", expires_at: 999 },
        }),
        { status: 200 },
      );
    });

    const credentials = await createOpenAIRealtimeClientSecret({
      apiKey: "sk-test",
      safetyIdentifier: "hashed-user",
      fetchImpl,
      now: 10,
    });

    expect(credentials.provider).toBe("openai_realtime");
    expect(credentials.clientSecret).toEqual({
      value: "ek_mock",
      expiresAt: 999,
    });
    expect(credentials.createdAt).toBe(10);
  });
});

describe("voice transcript reducer", () => {
  it("streams user deltas and commits normalized turns", () => {
    let state = initialVoiceTranscriptState;
    state = reduceVoiceTranscriptEvent(
      state,
      {
        type: "conversation.item.input_audio_transcription.delta",
        item_id: "item_1",
        delta: "What is",
      },
      100,
    );
    state = reduceVoiceTranscriptEvent(
      state,
      {
        type: "conversation.item.input_audio_transcription.delta",
        item_id: "item_1",
        delta: " a derivative?",
      },
      110,
    );
    expect(selectVoiceTranscriptPreview(state).at(-1)?.text).toBe(
      "What is a derivative?",
    );

    state = reduceVoiceTranscriptEvent(
      state,
      {
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "item_1",
        transcript: "What is a derivative?",
      },
      120,
    );

    expect(normalizeVoiceTurnsForPersistence(state)).toEqual([
      {
        role: "user",
        text: "What is a derivative?",
        providerItemId: "item_1",
        providerEventId: undefined,
        startedAt: 100,
        committedAt: 120,
      },
    ]);
  });

  it("extracts assistant transcripts and pending lab tools from response.done", () => {
    const state = reduceVoiceTranscriptEvent(
      initialVoiceTranscriptState,
      {
        type: "response.done",
        event_id: "event_1",
        response: {
          output: [
            {
              id: "msg_1",
              type: "message",
              role: "assistant",
              content: [{ transcript: "Let's sketch the intuition first." }],
            },
            {
              id: "call_1",
              type: "function_call",
              name: "open_lab",
              call_id: "call_1",
            },
          ],
        },
      },
      200,
    );

    expect(normalizeVoiceTurnsForPersistence(state)[0]?.text).toBe(
      "Let's sketch the intuition first.",
    );
    expect(state.toolActivities[0]).toMatchObject({
      name: "open_lab",
      status: "pending_adapter",
    });
  });
});

describe("voice UI helpers", () => {
  it("labels compact voice statuses", () => {
    expect(getVoiceStatusLabel("connected")).toBe("Listening");
    expect(getVoiceStatusLabel("muted")).toBe("Muted");
    expect(getVoiceStatusLabel("requesting_credentials")).toBe(
      "Preparing voice",
    );
  });
});
