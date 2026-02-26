"use client";

import type { CreateWarningToolResult } from "@/lib/voice/contracts";

export function VoiceWarningBanner({
  warning,
  onDismiss,
  onSwitchToText,
}: {
  warning: CreateWarningToolResult;
  onDismiss: () => void;
  onSwitchToText: (warning: CreateWarningToolResult) => void;
}) {
  return (
    <div className="voice-warning-banner">
      <div className="voice-warning-banner-body">
        <p className="voice-warning-banner-title">{warning.title}</p>
        <p className="voice-warning-banner-message">{warning.message}</p>
      </div>
      <div className="voice-warning-banner-actions">
        <button
          type="button"
          className="voice-warning-banner-dismiss"
          onClick={onDismiss}
        >
          Stay in voice
        </button>
        <button
          type="button"
          className="voice-warning-banner-cta"
          onClick={() => onSwitchToText(warning)}
        >
          {warning.ctaLabel}
        </button>
      </div>
    </div>
  );
}
