"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

function pickString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return "";
}

export function useVoiceSession({
  threadId,
  isActive,
  createClientSecret,
  onFinalTranscript,
  onUsage,
  onEvent,
}: {
  threadId: string;
  isActive: boolean;
  createClientSecret: (args: { threadId: string }) => Promise<SessionBootstrap>;
  onFinalTranscript: (text: string) => Promise<void>;
  onUsage: (args: VoiceUsageInput) => Promise<unknown>;
  onEvent: (args: VoiceEventInput) => Promise<unknown>;
}) {
  const [connectionState, setConnectionState] =
    useState<VoiceConnectionState>("idle");
  const [isSpeechActive, setIsSpeechActive] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const finalTranscriptQueueRef = useRef<Promise<void>>(Promise.resolve());
  const seenTranscriptIdsRef = useRef<Set<string>>(new Set());
  const sessionStartedAtRef = useRef<number>(0);
  const transcriptionModelRef = useRef<string>("gpt-4o-mini-transcribe");

  const sendSessionUpdate = useCallback(() => {
    const dataChannel = dataChannelRef.current;
    if (!dataChannel || dataChannel.readyState !== "open") {
      return;
    }

    dataChannel.send(
      JSON.stringify({
        type: "session.update",
        session: {
          turn_detection: {
            type: "server_vad",
            create_response: false,
          },
          input_audio_transcription: {
            model: transcriptionModelRef.current,
          },
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

  const teardown = useCallback(async () => {
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
    setLiveTranscript("");
  }, []);

  const stop = useCallback(
    async (reason: string) => {
      const wasConnected = connectionState === "connected";
      const durationMs =
        sessionStartedAtRef.current > 0
          ? Date.now() - sessionStartedAtRef.current
          : undefined;

      await teardown();
      setConnectionState("idle");

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
    [connectionState, onEvent, teardown],
  );

  const start = useCallback(async () => {
    if (!threadId) {
      return;
    }

    if (connectionState === "connecting" || connectionState === "connected") {
      return;
    }

    const startedAt = Date.now();
    setConnectionState("connecting");
    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const bootstrap = await createClientSecret({ threadId });
      transcriptionModelRef.current = bootstrap.transcriptionModel;

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      for (const track of stream.getAudioTracks()) {
        peerConnection.addTrack(track, stream);
      }

      const dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === "connected") {
          setConnectionState("connected");
          sessionStartedAtRef.current = Date.now();
        }

        if (
          peerConnection.connectionState === "closed" ||
          peerConnection.connectionState === "failed" ||
          peerConnection.connectionState === "disconnected"
        ) {
          void stop(`rtc_${peerConnection.connectionState}`);
        }
      };

      dataChannel.onopen = () => {
        sendSessionUpdate();
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
          return;
        }

        if (type === "input_audio_buffer.speech_stopped") {
          setIsSpeechActive(false);
          return;
        }

        if (type === "conversation.item.input_audio_transcription.delta") {
          const delta = pickString(data, ["delta", "text", "transcript_delta"]);
          if (delta) {
            setLiveTranscript((previous) => `${previous}${delta}`);
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

          setLiveTranscript("");

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
            setLiveTranscript((previous) => `${previous}${delta}`);
          }
          return;
        }

        if (type === "response.done") {
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
          const message = pickString(data, ["message", "error", "detail"]);
          setErrorMessage(message || "Voice session error");
          setConnectionState("error");
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
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setConnectionState("error");

      await onEvent({
        name: "voice_session_failed",
        status: "failed",
        durationMs: Date.now() - startedAt,
        metadata: {
          error: message,
        },
      }).catch((eventError) => {
        console.error("Failed to record voice failure event", eventError);
      });

      await teardown();
    }
  }, [
    connectionState,
    createClientSecret,
    onEvent,
    onFinalTranscript,
    onUsage,
    sendSessionUpdate,
    stop,
    teardown,
    threadId,
  ]);

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
      void teardown();
    };
  }, [teardown]);

  return {
    connectionState,
    isSpeechActive,
    liveTranscript,
    errorMessage,
    stop,
    retry: start,
  };
}
