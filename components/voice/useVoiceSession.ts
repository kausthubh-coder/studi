"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildAudioInputConstraints,
  normalizeAudioInputDevices,
  resolveSelectedInputDevice,
  type AudioInputDeviceOption,
} from "@/components/voice/input-device-utils";
import {
  isCreateSparkToolResult,
  type SparkArtifact,
} from "@/lib/sparks/contracts";
import {
  isCreateWarningToolResult,
  type CreateWarningToolResult,
} from "@/lib/voice/contracts";

type VoiceConnectionState = "idle" | "connecting" | "connected" | "error";

type SessionBootstrap = {
  clientSecret: string;
  model: string;
  transcriptionModel: string;
};

type UsagePayload = {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  inputTokenDetails?: unknown;
  outputTokenDetails?: unknown;
  raw?: unknown;
};

type VoiceUsageInput = {
  usageType: "input_transcription" | "realtime_response";
  model: string;
  usage: UsagePayload;
  providerMetadata?: unknown;
};

type VoiceEventInput = {
  name: string;
  status: "success" | "failed";
  durationMs?: number;
  metadata?: unknown;
};

type VoiceRealtimeToolName = "create_spark" | "create_warning";

type VoiceRealtimeToolExecutionResult = {
  callId: string;
  toolName: VoiceRealtimeToolName;
  success: boolean;
  output: unknown;
};

type VoiceSparkResult = {
  artifact: SparkArtifact;
  sparkInstanceId: string;
};

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

function readRealtimeErrorMessage(payload: Record<string, unknown>): string {
  const topLevel = pickString(payload, ["message", "detail"]);
  if (topLevel) {
    return topLevel;
  }

  const errorValue = payload.error;
  if (typeof errorValue === "string") {
    return errorValue.trim();
  }

  if (!errorValue || typeof errorValue !== "object") {
    return "";
  }

  const errorRecord = errorValue as Record<string, unknown>;
  const message = pickString(errorRecord, ["message", "detail", "type"]);
  const code = pickString(errorRecord, ["code"]);
  const param = pickString(errorRecord, ["param"]);

  const suffix = [code ? `code: ${code}` : "", param ? `param: ${param}` : ""]
    .filter(Boolean)
    .join(", ");

  if (message && suffix) {
    return `${message} (${suffix})`;
  }
  return message || suffix;
}

function extractTranscriptFromResponseDone(
  payload: Record<string, unknown>,
): string {
  const response =
    payload.response && typeof payload.response === "object"
      ? (payload.response as Record<string, unknown>)
      : null;
  if (!response) {
    return "";
  }

  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const itemRecord = item as Record<string, unknown>;
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const partRecord = part as Record<string, unknown>;
      const transcript = pickString(partRecord, ["transcript", "text"]);
      if (transcript) {
        return transcript;
      }
    }
  }

  return "";
}

function makeSparkInstanceId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function extractRealtimeFunctionCalls(payload: Record<string, unknown>): Array<{
  callId: string;
  toolName: VoiceRealtimeToolName;
  argumentsJson: string;
}> {
  const response =
    payload.response && typeof payload.response === "object"
      ? (payload.response as Record<string, unknown>)
      : null;
  if (!response) {
    return [];
  }

  const output = Array.isArray(response.output) ? response.output : [];
  const calls: Array<{
    callId: string;
    toolName: VoiceRealtimeToolName;
    argumentsJson: string;
  }> = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const record = item as Record<string, unknown>;
    if (record.type !== "function_call") {
      continue;
    }

    const name = pickString(record, ["name"]);
    if (name !== "create_spark" && name !== "create_warning") {
      continue;
    }

    const callId = pickString(record, ["call_id", "callId", "id"]);
    if (!callId) {
      continue;
    }

    const argumentsJson =
      typeof record.arguments === "string"
        ? record.arguments
        : JSON.stringify(record.arguments ?? {});

    calls.push({
      callId,
      toolName: name,
      argumentsJson,
    });
  }

  return calls;
}

export function useVoiceSession({
  threadId,
  isActive,
  createClientSecret,
  onFinalTranscript,
  onAssistantFinalTranscript,
  onToolCall,
  onUsage,
  onEvent,
}: {
  threadId: string;
  isActive: boolean;
  createClientSecret: (args: { threadId: string }) => Promise<SessionBootstrap>;
  onFinalTranscript: (text: string) => Promise<void>;
  onAssistantFinalTranscript: (text: string) => Promise<void>;
  onToolCall: (args: {
    threadId: string;
    callId: string;
    toolName: VoiceRealtimeToolName;
    argumentsJson: string;
  }) => Promise<VoiceRealtimeToolExecutionResult>;
  onUsage: (args: VoiceUsageInput) => Promise<unknown>;
  onEvent: (args: VoiceEventInput) => Promise<unknown>;
}) {
  const [connectionState, setConnectionState] =
    useState<VoiceConnectionState>("idle");
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const [liveUserTranscript, setLiveUserTranscript] = useState("");
  const [liveAssistantTranscript, setLiveAssistantTranscript] = useState("");
  const [assistantTranscriptHistory, setAssistantTranscriptHistory] = useState<
    string[]
  >([]);
  const [activeSpark, setActiveSpark] = useState<VoiceSparkResult | null>(null);
  const [activeWarning, setActiveWarning] =
    useState<CreateWarningToolResult | null>(null);
  const [isSparkCreating, setIsSparkCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [inputDevices, setInputDevices] = useState<AudioInputDeviceOption[]>(
    [],
  );
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState<
    string | null
  >(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const finalTranscriptQueueRef = useRef<Promise<void>>(Promise.resolve());
  const seenTranscriptIdsRef = useRef<Set<string>>(new Set());
  const seenAssistantResponseIdsRef = useRef<Set<string>>(new Set());
  const seenToolCallIdsRef = useRef<Set<string>>(new Set());
  const toolCallQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionStartedAtRef = useRef<number>(0);
  const transcriptionModelRef = useRef<string>("gpt-4o-mini-transcribe");
  const connectionStateRef = useRef<VoiceConnectionState>("idle");
  const startAttemptRef = useRef(0);
  const isStartingRef = useRef(false);
  const isMutedRef = useRef(false);
  const selectedInputDeviceIdRef = useRef<string | null>(null);
  const liveAssistantTranscriptRef = useRef("");

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    selectedInputDeviceIdRef.current = selectedInputDeviceId;
  }, [selectedInputDeviceId]);

  useEffect(() => {
    liveAssistantTranscriptRef.current = liveAssistantTranscript;
  }, [liveAssistantTranscript]);

  const sendSessionUpdate = useCallback(() => {
    const dataChannel = dataChannelRef.current;
    if (!dataChannel || dataChannel.readyState !== "open") {
      return;
    }

    dataChannel.send(
      JSON.stringify({
        type: "session.update",
        session: {
          type: "realtime",
          output_modalities: ["audio"],
          audio: {
            input: {
              turn_detection: {
                type: "server_vad",
                create_response: true,
              },
              transcription: {
                model: transcriptionModelRef.current,
              },
            },
          },
          tools: [
            {
              type: "function",
              name: "create_spark",
              description:
                "Create an interactive spark artifact for the learner using the provided context.",
              parameters: {
                type: "object",
                properties: {
                  sparkId: {
                    type: "string",
                    enum: [
                      "scene",
                      "quiz",
                      "flash_card",
                      "desmos_graph",
                      "code_playground",
                      "web_playground",
                    ],
                    description:
                      "Spark type to create based on the learning objective.",
                  },
                  context: {
                    type: "string",
                    description:
                      "Short learner context describing what the spark should teach.",
                  },
                  title: {
                    type: "string",
                    description: "Optional display title for the spark.",
                  },
                  summary: {
                    type: "string",
                    description: "Optional one-line summary for the spark.",
                  },
                },
                required: ["sparkId", "context"],
                additionalProperties: false,
              },
            },
            {
              type: "function",
              name: "create_warning",
              description:
                "Show a warning that asks the learner to switch to text mode for unsupported voice workflows.",
              parameters: {
                type: "object",
                properties: {
                  reason: {
                    type: "string",
                    enum: [
                      "lab_required",
                      "plan_required",
                      "long_term",
                      "long_lesson",
                    ],
                  },
                  title: { type: "string" },
                  message: { type: "string" },
                  ctaLabel: { type: "string" },
                  suggestedPrompt: { type: "string" },
                },
                required: ["reason"],
                additionalProperties: false,
              },
            },
          ],
          tool_choice: "auto",
          truncation: {
            type: "retention_ratio",
            retention_ratio: 0.8,
            token_limits: {
              post_instructions: 6_000,
            },
          },
        },
      }),
    );
  }, []);

  const applyMuteState = useCallback(
    (stream: MediaStream | null, muted: boolean) => {
      if (!stream) {
        return;
      }

      for (const track of stream.getAudioTracks()) {
        track.enabled = !muted;
      }
    },
    [],
  );

  const refreshInputDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const normalized = normalizeAudioInputDevices(devices);
    setInputDevices(normalized);

    setSelectedInputDeviceId((previous) =>
      resolveSelectedInputDevice(previous, normalized),
    );
  }, []);

  const requestAudioStream = useCallback(
    async (deviceId: string | null) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access is not supported in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: buildAudioInputConstraints(deviceId),
      });
      applyMuteState(stream, isMutedRef.current);
      return stream;
    },
    [applyMuteState],
  );

  const teardown = useCallback(async () => {
    const remoteAudio = remoteAudioRef.current;
    remoteAudioRef.current = null;
    if (remoteAudio) {
      try {
        remoteAudio.pause();
      } catch {
        // no-op
      }
      remoteAudio.srcObject = null;
    }

    const remoteStream = remoteStreamRef.current;
    remoteStreamRef.current = null;
    if (remoteStream) {
      for (const track of remoteStream.getTracks()) {
        track.stop();
      }
    }

    const dataChannel = dataChannelRef.current;
    dataChannelRef.current = null;
    if (dataChannel) {
      try {
        dataChannel.close();
      } catch {
        // no-op
      }
    }

    const peerConnection = peerConnectionRef.current;
    peerConnectionRef.current = null;
    if (peerConnection) {
      try {
        peerConnection.close();
      } catch {
        // no-op
      }
    }

    const mediaStream = mediaStreamRef.current;
    mediaStreamRef.current = null;
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        track.stop();
      }
    }

    setIsSpeechActive(false);
    setLiveUserTranscript("");
    setLiveAssistantTranscript("");
    setAssistantTranscriptHistory([]);
    setActiveSpark(null);
    setActiveWarning(null);
    setIsSparkCreating(false);
    seenTranscriptIdsRef.current = new Set();
    seenAssistantResponseIdsRef.current = new Set();
    seenToolCallIdsRef.current = new Set();
    toolCallQueueRef.current = Promise.resolve();
  }, []);

  const stop = useCallback(
    async (reason: string) => {
      const wasConnected = connectionStateRef.current === "connected";
      const durationMs =
        sessionStartedAtRef.current > 0
          ? Date.now() - sessionStartedAtRef.current
          : undefined;

      startAttemptRef.current += 1;
      isStartingRef.current = false;

      await teardown();
      setConnectionState("idle");
      sessionStartedAtRef.current = 0;

      if (wasConnected) {
        await onEvent({
          name: "voice_session_closed",
          status: "success",
          durationMs,
          metadata: { reason },
        }).catch((error) => {
          console.error("Failed to record voice close event", error);
        });
      }
    },
    [onEvent, teardown],
  );

  const finalizeAssistantTranscript = useCallback(
    (rawText: string, responseId?: string) => {
      const text = rawText.trim();
      if (!text) {
        setLiveAssistantTranscript("");
        return;
      }

      if (responseId) {
        if (seenAssistantResponseIdsRef.current.has(responseId)) {
          setLiveAssistantTranscript("");
          return;
        }
        seenAssistantResponseIdsRef.current.add(responseId);
      }

      let shouldPersist = true;
      setAssistantTranscriptHistory((previous) => {
        if (previous[previous.length - 1] === text) {
          shouldPersist = false;
          return previous;
        }
        const next = [...previous, text];
        return next.slice(-10);
      });

      setLiveAssistantTranscript("");

      if (!shouldPersist) {
        return;
      }

      finalTranscriptQueueRef.current = finalTranscriptQueueRef.current
        .then(() => onAssistantFinalTranscript(text))
        .catch((error) => {
          console.error("Failed to queue assistant transcript turn", error);
        });
    },
    [onAssistantFinalTranscript],
  );

  const clearWarning = useCallback(() => {
    setActiveWarning(null);
  }, []);

  const executeRealtimeToolCall = useCallback(
    async (args: {
      callId: string;
      toolName: VoiceRealtimeToolName;
      argumentsJson: string;
    }) => {
      if (seenToolCallIdsRef.current.has(args.callId)) {
        return;
      }
      seenToolCallIdsRef.current.add(args.callId);

      const dataChannel = dataChannelRef.current;
      if (!dataChannel || dataChannel.readyState !== "open") {
        return;
      }

      const startedAt = Date.now();
      if (args.toolName === "create_spark") {
        setIsSparkCreating(true);
      }

      try {
        const result = await onToolCall({
          threadId,
          callId: args.callId,
          toolName: args.toolName,
          argumentsJson: args.argumentsJson,
        });

        if (
          args.toolName === "create_spark" &&
          isCreateSparkToolResult(result.output)
        ) {
          if (result.output.status === "success" && result.output.artifact) {
            setActiveSpark({
              artifact: result.output.artifact,
              sparkInstanceId:
                result.output.artifact.artifactId ?? makeSparkInstanceId(),
            });
          } else {
            setActiveSpark(null);
          }
        }

        if (
          args.toolName === "create_warning" &&
          isCreateWarningToolResult(result.output)
        ) {
          setActiveWarning(result.output);
        }

        dataChannel.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: args.callId,
              output: JSON.stringify(result.output),
            },
          }),
        );
        dataChannel.send(
          JSON.stringify({
            type: "response.create",
          }),
        );

        void onEvent({
          name: `voice_tool_${args.toolName}`,
          status: result.success ? "success" : "failed",
          durationMs: Date.now() - startedAt,
          metadata: {
            callId: args.callId,
          },
        }).catch((error) => {
          console.error("Failed to record realtime tool event", error);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        dataChannel.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: args.callId,
              output: JSON.stringify({
                status: "failed",
                error: message,
              }),
            },
          }),
        );
        dataChannel.send(JSON.stringify({ type: "response.create" }));

        void onEvent({
          name: `voice_tool_${args.toolName}`,
          status: "failed",
          durationMs: Date.now() - startedAt,
          metadata: {
            callId: args.callId,
            error: message,
          },
        }).catch((eventError) => {
          console.error("Failed to record realtime tool error", eventError);
        });
      } finally {
        if (args.toolName === "create_spark") {
          setIsSparkCreating(false);
        }
      }
    },
    [onEvent, onToolCall, threadId],
  );

  const start = useCallback(async () => {
    if (!threadId) {
      return;
    }

    if (isStartingRef.current) {
      return;
    }

    if (
      connectionStateRef.current === "connecting" ||
      connectionStateRef.current === "connected"
    ) {
      return;
    }

    isStartingRef.current = true;
    const attemptId = ++startAttemptRef.current;
    const isCurrentAttempt = () => attemptId === startAttemptRef.current;

    const startedAt = Date.now();
    setConnectionState("connecting");
    setErrorMessage(null);

    try {
      const stream = await requestAudioStream(selectedInputDeviceIdRef.current);

      if (!isCurrentAttempt()) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      const activeDeviceId = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (typeof activeDeviceId === "string" && activeDeviceId.length > 0) {
        setSelectedInputDeviceId(activeDeviceId);
      }

      void refreshInputDevices().catch((error) => {
        console.error("Failed to enumerate input devices", error);
      });

      mediaStreamRef.current = stream;

      const bootstrap = await createClientSecret({ threadId });

      if (!isCurrentAttempt()) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      transcriptionModelRef.current = bootstrap.transcriptionModel;

      const peerConnection = new RTCPeerConnection();

      if (!isCurrentAttempt()) {
        peerConnection.close();
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      peerConnectionRef.current = peerConnection;

      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      remoteAudioRef.current = remoteAudio;

      peerConnection.ontrack = (event) => {
        const streamFromEvent = event.streams[0];
        const remoteStream =
          streamFromEvent ?? remoteStreamRef.current ?? new MediaStream();

        if (!streamFromEvent) {
          remoteStream.addTrack(event.track);
        }
        remoteStreamRef.current = remoteStream;

        if (remoteAudio.srcObject !== remoteStream) {
          remoteAudio.srcObject = remoteStream;
        }

        void remoteAudio.play().catch((error) => {
          console.error("Failed to play remote audio", error);
        });
      };

      for (const track of stream.getAudioTracks()) {
        peerConnection.addTrack(track, stream);
      }

      const dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        if (peerConnection.connectionState === "connected") {
          setConnectionState("connected");
          sessionStartedAtRef.current = Date.now();
          setErrorMessage(null);
        }

        if (state === "failed") {
          const detail = `WebRTC connection failed (ice: ${peerConnection.iceConnectionState})`;
          setErrorMessage(detail);
          setConnectionState("error");
          void onEvent({
            name: "voice_session_failed",
            status: "failed",
            durationMs:
              sessionStartedAtRef.current > 0
                ? Date.now() - sessionStartedAtRef.current
                : Date.now() - startedAt,
            metadata: {
              phase: "rtc_connection_state",
              connectionState: state,
              iceConnectionState: peerConnection.iceConnectionState,
              signalingState: peerConnection.signalingState,
            },
          }).catch((error) => {
            console.error("Failed to record RTC failure event", error);
          });
          void teardown();
          return;
        }

        if (state === "closed") {
          void stop(`rtc_${state}`);
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === "failed") {
          const detail =
            "ICE negotiation failed. Check network/firewall rules.";
          setErrorMessage(detail);
          setConnectionState("error");
        }
      };

      dataChannel.onopen = () => {
        sendSessionUpdate();
      };

      dataChannel.onerror = () => {
        setErrorMessage("Realtime data channel error.");
      };

      dataChannel.onclose = () => {
        if (connectionStateRef.current === "connecting") {
          setConnectionState("error");
          setErrorMessage("Realtime data channel closed while connecting.");
        }
      };

      dataChannel.onmessage = (event) => {
        let payload: unknown;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (!payload || typeof payload !== "object") {
          return;
        }

        const data = payload as Record<string, unknown>;
        const type = data.type;
        if (typeof type !== "string") {
          return;
        }

        if (type === "input_audio_buffer.speech_started") {
          setIsSpeechActive(true);
          setActiveSpark(null);
          return;
        }

        if (type === "input_audio_buffer.speech_stopped") {
          setIsSpeechActive(false);
          return;
        }

        if (type === "conversation.item.input_audio_transcription.delta") {
          const delta = pickString(data, ["delta", "text", "transcript_delta"]);
          if (delta) {
            setLiveUserTranscript((previous) => `${previous}${delta}`);
          }
          return;
        }

        if (type === "conversation.item.input_audio_transcription.completed") {
          const transcript = pickString(data, ["transcript", "text"]);
          const itemId = pickString(data, ["item_id", "itemId", "id"]);

          if (itemId && seenTranscriptIdsRef.current.has(itemId)) {
            return;
          }
          if (itemId) {
            seenTranscriptIdsRef.current.add(itemId);
          }

          setLiveUserTranscript("");

          if (transcript) {
            finalTranscriptQueueRef.current = finalTranscriptQueueRef.current
              .then(() => onFinalTranscript(transcript))
              .catch((error) => {
                console.error("Failed to queue transcript turn", error);
              });
          }

          const usageRaw = data.usage;
          const usageObject =
            usageRaw && typeof usageRaw === "object"
              ? (usageRaw as Record<string, unknown>)
              : null;
          if (usageObject) {
            const inputTokenDetails =
              usageObject.input_token_details &&
              typeof usageObject.input_token_details === "object"
                ? (usageObject.input_token_details as Record<string, unknown>)
                : undefined;
            void onUsage({
              usageType: "input_transcription",
              model: transcriptionModelRef.current,
              usage: {
                totalTokens:
                  typeof usageObject.total_tokens === "number"
                    ? usageObject.total_tokens
                    : undefined,
                inputTokens:
                  typeof usageObject.input_tokens === "number"
                    ? usageObject.input_tokens
                    : undefined,
                outputTokens:
                  typeof usageObject.output_tokens === "number"
                    ? usageObject.output_tokens
                    : undefined,
                inputTokenDetails,
                raw: usageObject,
              },
              providerMetadata: {
                eventType: type,
              },
            }).catch((error) => {
              console.error(
                "Failed to record voice transcription usage",
                error,
              );
            });
          }
          return;
        }

        if (type === "response.output_audio_transcript.delta") {
          const delta = pickString(data, ["delta", "text"]);
          if (delta) {
            setLiveAssistantTranscript((previous) => `${previous}${delta}`);
          }
          return;
        }

        if (type === "response.output_audio_transcript.done") {
          const responseId = pickString(data, ["response_id", "responseId"]);
          const transcript =
            pickString(data, ["transcript", "text"]) ||
            liveAssistantTranscriptRef.current;
          finalizeAssistantTranscript(transcript, responseId || undefined);
          return;
        }

        if (type === "response.done") {
          const functionCalls = extractRealtimeFunctionCalls(data);

          if (functionCalls.length > 0) {
            toolCallQueueRef.current = toolCallQueueRef.current
              .then(async () => {
                for (const call of functionCalls) {
                  await executeRealtimeToolCall(call);
                }
              })
              .catch((error) => {
                console.error("Failed to run realtime tool calls", error);
              });
          }

          const responseId = pickString(data, ["response_id", "responseId"]);
          const doneTranscript = extractTranscriptFromResponseDone(data);
          if (doneTranscript || liveAssistantTranscriptRef.current) {
            finalizeAssistantTranscript(
              doneTranscript || liveAssistantTranscriptRef.current,
              responseId || undefined,
            );
          }

          const responseData =
            data.response && typeof data.response === "object"
              ? (data.response as Record<string, unknown>)
              : null;
          const usage =
            responseData?.usage && typeof responseData.usage === "object"
              ? (responseData.usage as Record<string, unknown>)
              : null;
          if (!usage) {
            return;
          }

          const inputTokenDetails =
            usage.input_token_details &&
            typeof usage.input_token_details === "object"
              ? (usage.input_token_details as Record<string, unknown>)
              : undefined;
          const outputTokenDetails =
            usage.output_token_details &&
            typeof usage.output_token_details === "object"
              ? (usage.output_token_details as Record<string, unknown>)
              : undefined;

          void onUsage({
            usageType: "realtime_response",
            model: pickString(data, ["model"]) || "gpt-realtime-mini",
            usage: {
              totalTokens:
                typeof usage.total_tokens === "number"
                  ? usage.total_tokens
                  : undefined,
              inputTokens:
                typeof usage.input_tokens === "number"
                  ? usage.input_tokens
                  : undefined,
              outputTokens:
                typeof usage.output_tokens === "number"
                  ? usage.output_tokens
                  : undefined,
              inputTokenDetails,
              outputTokenDetails,
              raw: usage,
            },
            providerMetadata: {
              eventType: type,
            },
          }).catch((error) => {
            console.error("Failed to record voice response usage", error);
          });
          return;
        }

        if (type === "error") {
          const message = readRealtimeErrorMessage(data);
          setErrorMessage(message || "Voice session error");

          if (connectionStateRef.current !== "connected") {
            setConnectionState("error");
          }

          void onEvent({
            name: "voice_session_failed",
            status: "failed",
            metadata: {
              phase: "realtime_server_event",
              message: message || "Voice session error",
              event: data,
            },
          }).catch((eventError) => {
            console.error("Failed to record realtime error event", eventError);
          });
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sdpResponse = await fetch(
        "https://api.openai.com/v1/realtime/calls",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${bootstrap.clientSecret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp ?? "",
        },
      );

      if (!sdpResponse.ok) {
        const detail = await sdpResponse.text();
        throw new Error(
          `Realtime call setup failed (${sdpResponse.status}): ${detail.slice(0, 180)}`,
        );
      }

      const answerSdp = await sdpResponse.text();
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      await onEvent({
        name: "voice_session_connected",
        status: "success",
        durationMs: Date.now() - startedAt,
        metadata: {
          model: bootstrap.model,
          transcriptionModel: bootstrap.transcriptionModel,
        },
      }).catch((error) => {
        console.error("Failed to record voice connect event", error);
      });
    } catch (error) {
      if (!isCurrentAttempt()) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setConnectionState("error");

      await onEvent({
        name: "voice_session_failed",
        status: "failed",
        durationMs: Date.now() - startedAt,
        metadata: {
          error: message,
          phase: "start",
          connectionState: peerConnectionRef.current?.connectionState,
          iceConnectionState: peerConnectionRef.current?.iceConnectionState,
          signalingState: peerConnectionRef.current?.signalingState,
        },
      }).catch((eventError) => {
        console.error("Failed to record voice failure event", eventError);
      });

      await teardown();
    } finally {
      if (isCurrentAttempt()) {
        isStartingRef.current = false;
      }
    }
  }, [
    createClientSecret,
    executeRealtimeToolCall,
    finalizeAssistantTranscript,
    onEvent,
    onFinalTranscript,
    onUsage,
    refreshInputDevices,
    requestAudioStream,
    sendSessionUpdate,
    stop,
    teardown,
    threadId,
  ]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    applyMuteState(mediaStreamRef.current, nextMuted);

    void onEvent({
      name: nextMuted ? "voice_mic_muted" : "voice_mic_unmuted",
      status: "success",
      metadata: {
        muted: nextMuted,
      },
    }).catch((error) => {
      console.error("Failed to record mic toggle event", error);
    });
  }, [applyMuteState, onEvent]);

  const selectInputDevice = useCallback(
    async (deviceId: string) => {
      const nextDeviceId = deviceId.trim().length > 0 ? deviceId : null;
      const previousDeviceId = selectedInputDeviceIdRef.current;

      if (previousDeviceId === nextDeviceId) {
        return;
      }

      setSelectedInputDeviceId(nextDeviceId);
      selectedInputDeviceIdRef.current = nextDeviceId;

      if (connectionStateRef.current !== "connected") {
        return;
      }

      const peerConnection = peerConnectionRef.current;
      if (!peerConnection) {
        return;
      }

      const previousStream = mediaStreamRef.current;
      const startedAt = Date.now();

      try {
        const nextStream = await requestAudioStream(nextDeviceId);
        const nextTrack = nextStream.getAudioTracks()[0];
        if (!nextTrack) {
          for (const track of nextStream.getTracks()) {
            track.stop();
          }
          throw new Error("Selected microphone has no audio track.");
        }

        const sender = peerConnection
          .getSenders()
          .find((candidate) => candidate.track?.kind === "audio");

        if (sender) {
          await sender.replaceTrack(nextTrack);
        } else {
          peerConnection.addTrack(nextTrack, nextStream);
        }

        mediaStreamRef.current = nextStream;
        if (previousStream) {
          for (const track of previousStream.getTracks()) {
            track.stop();
          }
        }

        const activeDeviceId = nextTrack.getSettings().deviceId;
        if (typeof activeDeviceId === "string" && activeDeviceId.length > 0) {
          setSelectedInputDeviceId(activeDeviceId);
          selectedInputDeviceIdRef.current = activeDeviceId;
        }

        await onEvent({
          name: "voice_input_device_changed",
          status: "success",
          durationMs: Date.now() - startedAt,
          metadata: {
            previousDeviceId,
            nextDeviceId: selectedInputDeviceIdRef.current,
          },
        });

        void refreshInputDevices().catch((error) => {
          console.error("Failed to refresh input devices", error);
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setErrorMessage(message);
        setSelectedInputDeviceId(previousDeviceId);
        selectedInputDeviceIdRef.current = previousDeviceId;

        await onEvent({
          name: "voice_input_device_change_failed",
          status: "failed",
          durationMs: Date.now() - startedAt,
          metadata: {
            error: message,
            previousDeviceId,
            requestedDeviceId: nextDeviceId,
          },
        }).catch((eventError) => {
          console.error(
            "Failed to record input device change failure",
            eventError,
          );
        });
      }
    },
    [onEvent, refreshInputDevices, requestAudioStream],
  );

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    void refreshInputDevices().catch((error) => {
      console.error("Failed to refresh audio inputs", error);
    });

    const onDeviceChange = () => {
      void refreshInputDevices().catch((error) => {
        console.error(
          "Failed to refresh audio inputs after device change",
          error,
        );
      });
    };

    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        onDeviceChange,
      );
    };
  }, [refreshInputDevices]);

  useEffect(() => {
    if (!isActive) {
      if (
        connectionState === "connected" ||
        connectionState === "connecting" ||
        connectionState === "error"
      ) {
        void stop("voice_overlay_closed");
      }
      return;
    }

    if (connectionState === "idle") {
      void start();
    }
  }, [connectionState, isActive, start, stop]);

  useEffect(() => {
    return () => {
      startAttemptRef.current += 1;
      isStartingRef.current = false;
      void teardown();
    };
  }, [teardown]);

  return {
    connectionState,
    isSpeechActive,
    liveTranscript: liveUserTranscript,
    liveUserTranscript,
    liveAssistantTranscript,
    assistantTranscriptHistory,
    activeSpark,
    activeWarning,
    isSparkCreating,
    errorMessage,
    isMuted,
    inputDevices,
    selectedInputDeviceId,
    toggleMute,
    selectInputDevice,
    clearWarning,
    stop,
    retry: start,
  };
}
