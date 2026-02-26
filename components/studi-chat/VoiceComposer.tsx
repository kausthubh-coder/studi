"use client";

import { IconMic, IconMicOff, IconPhoneOff, IconChevronDown2 } from "@/components/studi-chat/icons";
import type { AudioInputDeviceOption } from "@/components/voice/input-device-utils";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

function StatusPill({ connectionState, isMuted }: { connectionState: ConnectionState; isMuted: boolean }) {
  if (isMuted) {
    return <span className="voice-composer-status voice-composer-status--muted">Muted</span>;
  }
  if (connectionState === "connected") {
    return <span className="voice-composer-status voice-composer-status--live">Live</span>;
  }
  if (connectionState === "connecting") {
    return <span className="voice-composer-status voice-composer-status--connecting">Connecting</span>;
  }
  if (connectionState === "error") {
    return <span className="voice-composer-status voice-composer-status--error">Error</span>;
  }
  return null;
}

export function VoiceComposer({
  connectionState,
  isSpeechActive,
  isMuted,
  errorMessage,
  inputDevices,
  selectedInputDeviceId,
  onToggleMute,
  onSelectInputDevice,
  onHangUp,
  onRetry,
}: {
  connectionState: ConnectionState;
  isSpeechActive: boolean;
  isMuted: boolean;
  errorMessage: string | null;
  inputDevices: AudioInputDeviceOption[];
  selectedInputDeviceId: string | null;
  onToggleMute: () => void;
  onSelectInputDevice: (deviceId: string) => void;
  onHangUp: () => void;
  onRetry: () => void;
}) {
  const isConnecting = connectionState === "connecting";
  const isConnected = connectionState === "connected";
  const isError = connectionState === "error";

  // speaking = agent or user is actively speaking
  const isSpeaking = isConnected && isSpeechActive && !isMuted;

  return (
    <div className="voice-composer-body">
      {/* Orb zone */}
      <div className="voice-composer-orb-zone">
        <div
          className="voice-composer-orb"
          data-state={connectionState}
          data-speaking={isSpeaking ? "true" : "false"}
          data-muted={isMuted ? "true" : "false"}
        >
          <div className="voice-composer-orb-ring voice-composer-orb-ring--1" />
          <div className="voice-composer-orb-ring voice-composer-orb-ring--2" />
          <div className="voice-composer-orb-core" />
        </div>
      </div>

      {/* Separator */}
      <div className="voice-composer-divider" />

      {/* Status + controls row */}
      <div className="voice-composer-controls">
        <StatusPill connectionState={connectionState} isMuted={isMuted} />

        <div className="voice-composer-actions">
          {/* Mute toggle */}
          <button
            type="button"
            className={`voice-composer-mute-btn${isMuted ? " is-muted" : ""}`}
            onClick={onToggleMute}
            aria-label={isMuted ? "Unmute" : "Mute"}
            disabled={!isConnected}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <IconMicOff /> : <IconMic />}
          </button>

          {/* Device selector */}
          {inputDevices.length > 1 && (
            <div className="voice-composer-device-wrap">
              <select
                className="voice-composer-device-select"
                value={selectedInputDeviceId ?? ""}
                onChange={(e) => onSelectInputDevice(e.target.value)}
                aria-label="Microphone"
                disabled={!isConnected}
              >
                {inputDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
              <IconChevronDown2 className="voice-composer-device-chevron" />
            </div>
          )}

          {/* Retry (error state only) */}
          {isError && (
            <button
              type="button"
              className="voice-composer-retry-btn"
              onClick={onRetry}
            >
              Retry
            </button>
          )}

          {/* Hang up */}
          <button
            type="button"
            className="voice-composer-hangup-btn"
            onClick={onHangUp}
            aria-label="End voice session"
            disabled={isConnecting}
          >
            <IconPhoneOff />
            <span>End</span>
          </button>
        </div>
      </div>

      {/* Error message */}
      {isError && errorMessage && (
        <p className="voice-composer-error-msg">{errorMessage}</p>
      )}
    </div>
  );
}
