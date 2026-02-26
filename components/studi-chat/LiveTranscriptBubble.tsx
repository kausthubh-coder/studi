"use client";

import { memo, type ReactNode } from "react";

function renderHighlightedAssistantText(text: string, currentWord: string): ReactNode {
  // No active word — show everything faded
  if (!currentWord || !text) {
    return <span className="voice-live-text-past">{text}</span>;
  }

  const escapedWord = currentWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match the LAST occurrence of the current word (most recently spoken)
  const pattern = new RegExp(`(${escapedWord})(?!.*${escapedWord})`, "i");
  const match = text.match(pattern);

  // Word not found in text yet — show everything faded
  if (!match || typeof match.index !== "number") {
    return <span className="voice-live-text-past">{text}</span>;
  }

  const start = match.index;
  const end = start + match[0].length;

  return (
    <>
      {start > 0 && (
        <span className="voice-live-text-past">{text.slice(0, start)}</span>
      )}
      <span className="voice-live-word-active">{text.slice(start, end)}</span>
      {end < text.length && (
        <span className="voice-live-text-ahead">{text.slice(end)}</span>
      )}
    </>
  );
}

export const LiveTranscriptBubble = memo(function LiveTranscriptBubble({
  role,
  text,
  currentWord,
  isActive,
}: {
  role: "user" | "assistant";
  text: string;
  currentWord?: string;
  isActive: boolean;
}) {
  if (!text) return null;

  if (role === "user") {
    return (
      <div className="voice-live-bubble" data-role="user" data-active={isActive ? "true" : "false"}>
        <div className="voice-live-user-text">{text}</div>
      </div>
    );
  }

  return (
    <div className="voice-live-bubble" data-role="assistant" data-active={isActive ? "true" : "false"}>
      <div className="voice-live-assistant-label">Studi</div>
      <div className="voice-live-assistant-text">
        {renderHighlightedAssistantText(text, currentWord ?? "")}
      </div>
    </div>
  );
});
