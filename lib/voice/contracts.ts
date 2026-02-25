export const voiceWarningReasons = [
  "lab_required",
  "plan_required",
  "long_term",
  "long_lesson",
] as const;

export type VoiceWarningReason = (typeof voiceWarningReasons)[number];

export type CreateWarningToolResult = {
  status: "warning";
  warningType: "switch_to_text";
  reason: VoiceWarningReason;
  title: string;
  message: string;
  ctaLabel: string;
  suggestedPrompt?: string;
};

function isVoiceWarningReason(value: unknown): value is VoiceWarningReason {
  return (
    typeof value === "string" &&
    (voiceWarningReasons as readonly string[]).includes(value)
  );
}

export function isCreateWarningToolResult(
  value: unknown,
): value is CreateWarningToolResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.status === "warning" &&
    candidate.warningType === "switch_to_text" &&
    isVoiceWarningReason(candidate.reason) &&
    typeof candidate.title === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.ctaLabel === "string" &&
    (candidate.suggestedPrompt === undefined ||
      typeof candidate.suggestedPrompt === "string")
  );
}
