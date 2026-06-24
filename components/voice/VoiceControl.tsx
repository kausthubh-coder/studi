"use client";

import { Mic, MicOff, Square, Volume2 } from "lucide-react";
import { useMemo } from "react";
import { useVoiceSession } from "@/components/voice/useVoiceSession";
import type {
  VoiceSessionStatus,
  VoiceToolActivity,
} from "@/lib/voice-runtime/contracts";

export function getVoiceStatusLabel(status: VoiceSessionStatus): string {
  switch (status) {
    case "requesting_credentials":
      return "Preparing voice";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Listening";
    case "muted":
      return "Muted";
    case "stopping":
      return "Saving";
    case "ended":
      return "Saved";
    case "error":
      return "Voice error";
    default:
      return "Voice";
  }
}

function toolSummary(tool: VoiceToolActivity): string {
  if (tool.status === "pending_adapter") {
    return `${tool.label}: pending`;
  }
  if (tool.status === "failed") {
    return `${tool.label}: failed`;
  }
  if (tool.status === "succeeded") {
    return `${tool.label}: done`;
  }
  return `${tool.label}: working`;
}

export function VoiceControl({
  threadId,
  disabled,
}: {
  threadId: string | null;
  disabled?: boolean;
}) {
  const voice = useVoiceSession(threadId);
  const statusLabel = getVoiceStatusLabel(voice.status);
  const active =
    voice.status === "connected" ||
    voice.status === "muted" ||
    voice.status === "connecting" ||
    voice.status === "requesting_credentials";
  const canStart = Boolean(threadId) && !disabled && !active;
  const transcriptLine = useMemo(() => {
    const latest = voice.transcriptPreview.at(-1);
    if (!latest) {
      return active ? "Say something to Studi." : "";
    }
    return latest.text;
  }, [active, voice.transcriptPreview]);

  if (!threadId) {
    return null;
  }

  return (
    <div className="voice-control mx-auto mb-2 flex w-full max-w-[var(--column-max)] items-center gap-2 rounded-xl border border-border-faint bg-bg-alt/80 px-3 py-2 text-xs text-fg-muted shadow-sm">
      <button
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-fg text-bg transition hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={active ? "Stop voice" : "Start voice"}
        disabled={!active && !canStart}
        onClick={() => {
          if (active) {
            void voice.stop();
          } else {
            void voice.start();
          }
        }}
      >
        {active ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
      </button>

      <button
        type="button"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-faint text-fg transition hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
        aria-label={voice.status === "muted" ? "Unmute voice" : "Mute voice"}
        disabled={voice.status !== "connected" && voice.status !== "muted"}
        onClick={voice.toggleMute}
      >
        {voice.status === "muted" ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em] text-fg">
            {statusLabel}
          </span>
          {voice.credentials ? (
            <span className="truncate text-[11px] text-fg-faint">
              {voice.credentials.model}
            </span>
          ) : null}
        </div>
        {voice.error ? (
          <p className="truncate text-[11px] text-red-700">{voice.error}</p>
        ) : transcriptLine ? (
          <p className="truncate text-[11px]">{transcriptLine}</p>
        ) : null}
      </div>

      {voice.toolActivities.length > 0 ? (
        <div className="hidden max-w-44 shrink-0 truncate text-[11px] text-fg-faint sm:block">
          {toolSummary(voice.toolActivities.at(-1)!)}
        </div>
      ) : null}
    </div>
  );
}
