"use client";

import { useAction, useMutation } from "convex/react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import {
  realtimeCallsUrl,
  type VoiceSessionCredentials,
  type VoiceSessionStatus,
  type VoiceToolActivity,
  type VoiceToolName,
} from "@/lib/voice-runtime/contracts";
import {
  initialVoiceTranscriptState,
  normalizeVoiceTurnsForPersistence,
  reduceVoiceTranscriptEvent,
  selectVoiceTranscriptPreview,
  type RealtimeTranscriptEvent,
  type VoiceTranscriptState,
} from "@/lib/voice-runtime/transcriptReducer";

type OpenAIRealtimeEvent = RealtimeTranscriptEvent & {
  response?: {
    output?: Array<{
      type?: string;
      name?: VoiceToolName;
      call_id?: string;
      arguments?: string;
    }>;
  };
};

type VoiceToolResult = {
  status: "succeeded" | "failed" | "pending_adapter";
  summary: string;
  output?: unknown;
  error?: string;
};

type VoiceTranscriptAction =
  | RealtimeTranscriptEvent
  | { type: "session.reset" };

function transcriptReducer(
  state: VoiceTranscriptState,
  event: VoiceTranscriptAction,
) {
  if (event.type === "session.reset") {
    return initialVoiceTranscriptState;
  }

  return reduceVoiceTranscriptEvent(state, event);
}

function parseToolArguments(value: string | undefined): unknown {
  if (!value?.trim()) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return { raw: value };
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    try {
      const parsed = JSON.parse(error.message) as { message?: unknown };
      if (typeof parsed.message === "string") {
        return parsed.message;
      }
    } catch {
      return error.message;
    }
  }

  return "Voice session failed.";
}

function makeFunctionCallOutput(callId: string, result: VoiceToolResult) {
  return {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(result),
    },
  };
}

export function useVoiceSession(threadId: string | null) {
  const createSession = useAction(api.voiceActions.createOpenAIRealtimeSession);
  const runVoiceTool = useAction(api.voiceActions.runVoiceTool);
  const persistTranscript = useMutation(api.voice.persistVoiceTranscript);

  const [status, setStatus] = useState<VoiceSessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] =
    useState<VoiceSessionCredentials | null>(null);
  const [transcriptState, dispatchTranscript] = useReducer(
    transcriptReducer,
    initialVoiceTranscriptState,
  );

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const credentialsRef = useRef<VoiceSessionCredentials | null>(null);
  const transcriptStateRef = useRef<VoiceTranscriptState>(
    initialVoiceTranscriptState,
  );
  const persistingRef = useRef(false);
  const persistedSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    transcriptStateRef.current = transcriptState;
  }, [transcriptState]);

  useEffect(() => {
    credentialsRef.current = credentials;
  }, [credentials]);

  const cleanupTransport = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current.remove();
      audioRef.current = null;
    }
  }, []);

  const persistFinalTranscript = useCallback(async () => {
    const activeCredentials = credentialsRef.current;
    if (!threadId || !activeCredentials || persistingRef.current) {
      return;
    }

    if (persistedSessionIdRef.current === activeCredentials.sessionId) {
      return;
    }

    const turns = normalizeVoiceTurnsForPersistence(transcriptStateRef.current);

    persistingRef.current = true;
    try {
      await persistTranscript({
        threadId,
        sessionId: activeCredentials.sessionId,
        turns,
      });
      persistedSessionIdRef.current = activeCredentials.sessionId;
    } finally {
      persistingRef.current = false;
    }
  }, [persistTranscript, threadId]);

  const handleToolCall = useCallback(
    async (
      event: OpenAIRealtimeEvent,
      channel: RTCDataChannel,
      activeCredentials: VoiceSessionCredentials,
    ) => {
      for (const output of event.response?.output ?? []) {
        if (output.type !== "function_call" || !output.name) {
          continue;
        }

        const callId = output.call_id ?? crypto.randomUUID();
        const result = await runVoiceTool({
          threadId: threadId!,
          sessionId: activeCredentials.sessionId,
          toolCallId: callId,
          toolName: output.name,
          input: parseToolArguments(output.arguments),
        });

        channel.send(JSON.stringify(makeFunctionCallOutput(callId, result)));
        channel.send(JSON.stringify({ type: "response.create" }));
      }
    },
    [runVoiceTool, threadId],
  );

  const start = useCallback(async () => {
    if (!threadId || status === "connecting" || status === "connected") {
      return;
    }

    setError(null);
    setCredentials(null);
    credentialsRef.current = null;
    persistedSessionIdRef.current = null;
    transcriptStateRef.current = initialVoiceTranscriptState;
    dispatchTranscript({ type: "session.reset" });
    setStatus("requesting_credentials");

    try {
      const nextCredentials = await createSession({ threadId });
      setCredentials(nextCredentials);
      credentialsRef.current = nextCredentials;

      setStatus("connecting");
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaStreamRef.current = mediaStream;

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      const audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      audioRef.current = audioElement;
      peerConnection.ontrack = (event) => {
        audioElement.srcObject = event.streams[0] ?? null;
      };

      for (const track of mediaStream.getAudioTracks()) {
        peerConnection.addTrack(track, mediaStream);
      }

      const dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;
      dataChannel.addEventListener("open", () => setStatus("connected"));
      dataChannel.addEventListener("message", (messageEvent) => {
        let event: OpenAIRealtimeEvent;
        try {
          event = JSON.parse(String(messageEvent.data)) as OpenAIRealtimeEvent;
        } catch {
          return;
        }

        dispatchTranscript(event);
        if (event.type === "response.done") {
          void handleToolCall(event, dataChannel, nextCredentials).catch(
            (toolError) => {
              setError(toErrorMessage(toolError));
            },
          );
        }
      });
      dataChannel.addEventListener("error", () => {
        setError("Realtime data channel failed.");
        setStatus("error");
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      const sdpResponse = await fetch(
        nextCredentials.realtimeUrl || realtimeCallsUrl,
        {
          method: "POST",
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${nextCredentials.clientSecret.value}`,
            "Content-Type": "application/sdp",
          },
        },
      );

      if (!sdpResponse.ok) {
        throw new Error(`Realtime SDP exchange failed (${sdpResponse.status}).`);
      }

      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: await sdpResponse.text(),
      });
    } catch (startError) {
      cleanupTransport();
      setStatus("error");
      setError(toErrorMessage(startError));
    }
  }, [cleanupTransport, createSession, handleToolCall, status, threadId]);

  const stop = useCallback(async () => {
    if (status === "idle" || status === "ended") {
      return;
    }

    setStatus("stopping");
    cleanupTransport();
    try {
      await persistFinalTranscript();
      setStatus("ended");
    } catch (persistError) {
      setStatus("error");
      setError(toErrorMessage(persistError));
    }
  }, [cleanupTransport, persistFinalTranscript, status]);

  const toggleMute = useCallback(() => {
    const tracks = mediaStreamRef.current?.getAudioTracks() ?? [];
    const shouldMute = status !== "muted";
    for (const track of tracks) {
      track.enabled = !shouldMute;
    }
    setStatus(shouldMute ? "muted" : "connected");
  }, [status]);

  useEffect(() => {
    return () => {
      cleanupTransport();
      void persistFinalTranscript().catch(() => {
        // Component teardown cannot surface async persistence errors in the UI.
      });
    };
  }, [cleanupTransport, persistFinalTranscript]);

  return {
    status,
    error: error ?? transcriptState.error,
    credentials,
    transcriptPreview: selectVoiceTranscriptPreview(transcriptState),
    toolActivities: transcriptState.toolActivities as VoiceToolActivity[],
    start,
    stop,
    toggleMute,
  };
}
