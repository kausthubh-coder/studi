"use client";

import { useState } from "react";
import SparkSceneRenderer from "@/components/sparks/SparkSceneRenderer";
import { useVoiceSession } from "@/components/voice/useVoiceSession";
import type { CreateWarningToolResult } from "@/lib/voice/contracts";

function formatStateLabel(
  state: "idle" | "connecting" | "connected" | "error",
) {
  if (state === "connected") {
    return "Live";
  }
  if (state === "connecting") {
    return "Connecting";
  }
  if (state === "error") {
    return "Connection issue";
  }
  return "Idle";
}

function renderHighlightedAssistantText(text: string, currentWord: string) {
  if (!currentWord) {
    return text;
  }

  const escapedWord = currentWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(${escapedWord})(?!.*${escapedWord})`, "i");
  const match = text.match(pattern);
  if (!match || typeof match.index !== "number") {
    return text;
  }

  const start = match.index;
  const end = start + match[0].length;

  return (
    <>
      {text.slice(0, start)}
      <span className="voice-transcript-word-active">
        {text.slice(start, end)}
      </span>
      {text.slice(end)}
    </>
  );
}

export function VoiceModeOverlay({
  isOpen,
  threadId,
  onClose,
  onSwitchToText,
  createClientSecret,
  onFinalTranscript,
  onAssistantFinalTranscript,
  onToolCall,
  onUsage,
  onEvent,
}: {
  isOpen: boolean;
  threadId: string;
  onClose: () => void;
  onSwitchToText: (warning?: CreateWarningToolResult) => void;
  createClientSecret: (args: { threadId: string }) => Promise<{
    clientSecret: string;
    model: string;
    transcriptionModel: string;
  }>;
  onFinalTranscript: (text: string) => Promise<void>;
  onAssistantFinalTranscript: (text: string) => Promise<void>;
  onToolCall: (args: {
    threadId: string;
    callId: string;
    toolName: "create_spark" | "create_warning";
    argumentsJson: string;
  }) => Promise<{
    callId: string;
    toolName: "create_spark" | "create_warning";
    success: boolean;
    output: unknown;
  }>;
  onUsage: (args: {
    usageType: "input_transcription" | "realtime_response";
    model: string;
    usage: {
      totalTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      cachedInputTokens?: number;
      inputTokenDetails?: unknown;
      outputTokenDetails?: unknown;
      raw?: unknown;
    };
    providerMetadata?: unknown;
  }) => Promise<unknown>;
  onEvent: (args: {
    name: string;
    status: "success" | "failed";
    durationMs?: number;
    metadata?: unknown;
  }) => Promise<unknown>;
}) {
  const [dismissedWarningKey, setDismissedWarningKey] = useState<string | null>(
    null,
  );

  const {
    connectionState,
    liveAssistantTranscript,
    assistantCurrentWord,
    assistantTranscriptHistory,
    activeSpark,
    activeWarning,
    isSparkCreating,
    isSpeechActive,
    errorMessage,
    isMuted,
    inputDevices,
    selectedInputDeviceId,
    toggleMute,
    selectInputDevice,
    clearWarning,
    stop,
    retry,
  } = useVoiceSession({
    threadId,
    isActive: isOpen,
    createClientSecret,
    onFinalTranscript,
    onAssistantFinalTranscript,
    onToolCall,
    onUsage,
    onEvent,
  });

  if (!isOpen) {
    return null;
  }

  const warningKey = activeWarning
    ? `${activeWarning.reason}:${activeWarning.title}:${activeWarning.message}`
    : null;
  const showWarning =
    Boolean(activeWarning) && dismissedWarningKey !== warningKey;
  const shouldShowSpark = !isSparkCreating && Boolean(activeSpark?.artifact);

  return (
    <div className="voice-shell" role="dialog" aria-modal="true">
      <div className="voice-noise" aria-hidden />
      <header className="voice-header">
        <div>
          <p className="voice-eyebrow">Experimental</p>
          <h2 className="voice-title">Shru Voice</h2>
        </div>
        <button
          type="button"
          className="voice-close-btn"
          onClick={() => {
            void stop("exit_voice_mode");
            onClose();
          }}
        >
          Exit voice
        </button>
      </header>

      <section className="voice-stage" aria-live="polite">
        {isSparkCreating ? (
          <div className="voice-spark-building">
            <p className="voice-spark-building-title">Creating spark...</p>
            <p className="voice-spark-building-sub">
              Rendering an interactive scene for this answer.
            </p>
          </div>
        ) : shouldShowSpark && activeSpark ? (
          <div className="voice-spark-preview">
            <SparkSceneRenderer
              artifact={activeSpark.artifact}
              threadId={threadId}
              sparkInstanceId={activeSpark.sparkInstanceId}
              onExpandSpark={() => {
                return;
              }}
              expandedSparkInstanceId={null}
            />
          </div>
        ) : (
          <div className="voice-transcript-viewer">
            <p className="voice-transcript-title">Transcript</p>

            {assistantTranscriptHistory.length > 0 ? (
              assistantTranscriptHistory.map((line, index) => (
                <p key={`${index}-${line}`} className="voice-transcript-line">
                  {line}
                </p>
              ))
            ) : (
              <p className="voice-transcript-empty">Shru is listening...</p>
            )}

            {liveAssistantTranscript ? (
              <p className="voice-transcript-line voice-transcript-live">
                {renderHighlightedAssistantText(
                  liveAssistantTranscript,
                  assistantCurrentWord,
                )}
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="voice-orb-zone" aria-hidden>
        <div
          className="voice-orb"
          data-state={connectionState}
          data-speaking={isSpeechActive ? "true" : "false"}
        >
          <div className="voice-orb-core" />
          <div className="voice-orb-ring" />
          <div className="voice-orb-ring delayed" />
        </div>
      </section>

      <footer className="voice-controls">
        <div className="voice-controls-left">
          <p className="voice-status-pill" data-state={connectionState}>
            {formatStateLabel(connectionState)}
            {isSpeechActive ? " - listening" : ""}
          </p>

          <div className="voice-mic-controls">
            <button
              type="button"
              className="voice-secondary-btn"
              onClick={() => {
                toggleMute();
              }}
              disabled={
                connectionState !== "connected" &&
                connectionState !== "connecting"
              }
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>

            <label className="voice-input-label">
              <span>Input</span>
              <select
                className="voice-input-select"
                value={selectedInputDeviceId ?? ""}
                onChange={(event) => {
                  void selectInputDevice(event.target.value);
                }}
                disabled={
                  inputDevices.length === 0 || connectionState === "connecting"
                }
              >
                {inputDevices.length === 0 ? (
                  <option value="">No microphone found</option>
                ) : (
                  inputDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        </div>

        {connectionState === "connected" ? (
          <button
            type="button"
            className="voice-primary-btn"
            onClick={() => {
              void stop("manual_hangup");
            }}
          >
            Hang up
          </button>
        ) : (
          <button
            type="button"
            className="voice-primary-btn"
            onClick={() => {
              void retry();
            }}
          >
            Reconnect
          </button>
        )}
      </footer>

      {errorMessage ? <p className="voice-error-msg">{errorMessage}</p> : null}

      {showWarning && activeWarning ? (
        <div className="voice-warning-backdrop" role="presentation">
          <div className="voice-warning-modal" role="dialog" aria-modal="true">
            <p className="voice-warning-title">{activeWarning.title}</p>
            <p className="voice-warning-message">{activeWarning.message}</p>
            <div className="voice-warning-actions">
              <button
                type="button"
                className="voice-warning-cancel"
                onClick={() => {
                  if (warningKey) {
                    setDismissedWarningKey(warningKey);
                  }
                  clearWarning();
                }}
              >
                Stay in voice
              </button>
              <button
                type="button"
                className="voice-warning-switch"
                onClick={() => {
                  if (warningKey) {
                    setDismissedWarningKey(warningKey);
                  }
                  clearWarning();
                  void stop("switch_to_text_warning");
                  onSwitchToText(activeWarning);
                }}
              >
                {activeWarning.ctaLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <style jsx>{`
        .voice-shell {
          position: fixed;
          inset: 0;
          z-index: 80;
          display: grid;
          grid-template-rows: auto minmax(180px, 34vh) minmax(180px, 1fr) auto;
          gap: 0.9rem;
          padding: 1rem;
          background:
            radial-gradient(
              1100px 460px at 50% -10%,
              rgba(16, 189, 148, 0.13),
              transparent 65%
            ),
            radial-gradient(
              900px 420px at 8% 92%,
              rgba(251, 113, 133, 0.1),
              transparent 72%
            ),
            radial-gradient(
              850px 380px at 95% 100%,
              rgba(56, 189, 248, 0.09),
              transparent 74%
            ),
            #09090b;
          color: #f4f4f5;
        }

        .voice-noise {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.05;
          background-image: radial-gradient(
            circle at 20% 20%,
            #fff 0.3px,
            transparent 0.8px
          );
          background-size: 3px 3px;
        }

        .voice-header {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .voice-eyebrow {
          margin: 0;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(244, 244, 245, 0.58);
        }

        .voice-title {
          margin: 0.2rem 0 0;
          font-family: var(--font-dm-serif), serif;
          font-size: clamp(1.4rem, 2.5vw, 2rem);
          letter-spacing: 0.01em;
        }

        .voice-close-btn,
        .voice-primary-btn,
        .voice-secondary-btn,
        .voice-warning-cancel,
        .voice-warning-switch {
          border-radius: 999px;
          border: 1px solid transparent;
          padding: 0.58rem 1rem;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 0.76rem;
          font-weight: 600;
          letter-spacing: 0.02em;
          cursor: pointer;
        }

        .voice-close-btn {
          border-color: rgba(244, 244, 245, 0.24);
          background: rgba(24, 24, 27, 0.72);
          color: rgba(244, 244, 245, 0.9);
        }

        .voice-stage,
        .voice-orb-zone,
        .voice-controls,
        .voice-error-msg {
          position: relative;
          z-index: 1;
        }

        .voice-stage {
          border-radius: 1.3rem;
          border: 1px solid rgba(244, 244, 245, 0.14);
          background: rgba(9, 9, 11, 0.72);
          backdrop-filter: blur(7px);
          overflow: hidden;
        }

        .voice-spark-building,
        .voice-transcript-viewer {
          height: 100%;
          padding: 1rem;
        }

        .voice-spark-building {
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 0.45rem;
          background:
            radial-gradient(
              520px 180px at 50% 20%,
              rgba(16, 185, 129, 0.2),
              transparent 70%
            ),
            rgba(9, 9, 11, 0.8);
        }

        .voice-spark-building-title,
        .voice-transcript-title {
          margin: 0;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 0.86rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #09090b;
        }

        .voice-spark-building-sub {
          margin: 0;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 0.9rem;
          color: rgba(244, 244, 245, 0.9);
        }

        .voice-spark-preview {
          height: 100%;
          padding: 0.75rem;
        }

        .voice-spark-preview :global(.spark-scene-card) {
          height: 100%;
        }

        .voice-spark-preview :global(.spark-scene-body) {
          height: calc(100% - 2.5rem);
        }

        .voice-transcript-viewer {
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
          overflow: auto;
          background: #ffffff;
        }

        .voice-transcript-line {
          margin: 0;
          padding: 0;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 1rem;
          line-height: 1.6;
          color: #09090b;
          border: none;
          background: transparent;
        }

        .voice-transcript-live {
          font-weight: 600;
        }

        .voice-transcript-word-active {
          background: #09090b;
          color: #ffffff;
          border-radius: 0.35rem;
          padding: 0.03rem 0.28rem;
          margin: 0 0.06rem;
        }

        .voice-transcript-empty {
          margin: 0;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 0.95rem;
          color: rgba(9, 9, 11, 0.58);
        }

        .voice-orb-zone {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .voice-orb {
          position: relative;
          width: min(64vw, 300px);
          aspect-ratio: 1 / 1;
          border-radius: 999px;
          display: grid;
          place-items: center;
        }

        .voice-orb-core {
          width: 52%;
          height: 52%;
          border-radius: inherit;
          background: radial-gradient(
            circle at 30% 25%,
            rgba(244, 244, 245, 0.96),
            rgba(148, 163, 184, 0.72) 40%,
            rgba(16, 185, 129, 0.32) 72%,
            rgba(9, 9, 11, 0.9) 100%
          );
          box-shadow:
            0 0 24px rgba(16, 185, 129, 0.34),
            0 0 92px rgba(56, 189, 248, 0.25);
          transition: transform 260ms ease;
        }

        .voice-orb-ring {
          position: absolute;
          inset: 12%;
          border-radius: inherit;
          border: 1px solid rgba(16, 185, 129, 0.28);
          opacity: 0.7;
          animation: voice-ping 2.6s ease-out infinite;
        }

        .voice-orb-ring.delayed {
          animation-delay: 1.3s;
        }

        .voice-orb[data-state="connecting"] .voice-orb-core,
        .voice-orb[data-state="connected"][data-speaking="true"]
          .voice-orb-core {
          transform: scale(1.08);
        }

        .voice-orb[data-state="error"] .voice-orb-core {
          box-shadow:
            0 0 18px rgba(248, 113, 113, 0.42),
            0 0 72px rgba(248, 113, 113, 0.24);
        }

        .voice-controls {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.8rem;
        }

        .voice-controls-left {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .voice-mic-controls {
          display: flex;
          align-items: center;
          gap: 0.55rem;
        }

        .voice-secondary-btn {
          border-color: rgba(244, 244, 245, 0.24);
          background: rgba(24, 24, 27, 0.72);
          color: rgba(244, 244, 245, 0.88);
        }

        .voice-secondary-btn:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .voice-input-label {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 0.72rem;
          color: rgba(244, 244, 245, 0.86);
        }

        .voice-input-select {
          max-width: min(46vw, 270px);
          border-radius: 999px;
          border: 1px solid rgba(244, 244, 245, 0.24);
          background: rgba(24, 24, 27, 0.76);
          color: rgba(244, 244, 245, 0.95);
          padding: 0.42rem 0.72rem;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 0.73rem;
        }

        .voice-input-select:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .voice-status-pill {
          margin: 0;
          border-radius: 999px;
          border: 1px solid rgba(244, 244, 245, 0.2);
          padding: 0.44rem 0.8rem;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 0.74rem;
          color: rgba(244, 244, 245, 0.84);
          background: rgba(24, 24, 27, 0.78);
        }

        .voice-status-pill[data-state="connected"] {
          border-color: rgba(16, 185, 129, 0.45);
          color: rgba(167, 243, 208, 1);
        }

        .voice-primary-btn {
          border-color: rgba(16, 185, 129, 0.32);
          background: rgba(16, 185, 129, 0.18);
          color: rgba(209, 250, 229, 1);
        }

        .voice-error-msg {
          margin: 0;
          text-align: center;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 0.76rem;
          color: #fecaca;
        }

        .voice-warning-backdrop {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          background: rgba(9, 9, 11, 0.62);
          z-index: 3;
        }

        .voice-warning-modal {
          width: min(90vw, 430px);
          border-radius: 1.1rem;
          border: 1px solid rgba(244, 244, 245, 0.16);
          background: #18181b;
          padding: 1rem;
        }

        .voice-warning-title {
          margin: 0;
          font-family: var(--font-dm-serif), serif;
          font-size: 1.3rem;
        }

        .voice-warning-message {
          margin: 0.55rem 0 0;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          color: rgba(228, 228, 231, 0.9);
          font-size: 0.9rem;
        }

        .voice-warning-actions {
          margin-top: 0.95rem;
          display: flex;
          gap: 0.6rem;
          justify-content: flex-end;
        }

        .voice-warning-cancel {
          border-color: rgba(244, 244, 245, 0.22);
          background: transparent;
          color: rgba(228, 228, 231, 0.85);
        }

        .voice-warning-switch {
          border-color: rgba(14, 165, 233, 0.44);
          background: rgba(14, 165, 233, 0.2);
          color: rgba(224, 242, 254, 1);
        }

        @keyframes voice-ping {
          from {
            transform: scale(0.92);
            opacity: 0.6;
          }
          to {
            transform: scale(1.22);
            opacity: 0;
          }
        }

        @media (max-width: 900px) {
          .voice-shell {
            padding: 0.8rem;
            gap: 0.7rem;
          }

          .voice-controls {
            flex-direction: column;
            align-items: stretch;
          }

          .voice-controls-left {
            width: 100%;
          }

          .voice-mic-controls {
            width: 100%;
            flex-wrap: wrap;
          }

          .voice-input-label {
            flex: 1;
            min-width: 0;
          }

          .voice-input-select {
            width: 100%;
            max-width: none;
          }

          .voice-primary-btn,
          .voice-secondary-btn,
          .voice-status-pill {
            width: 100%;
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
}
