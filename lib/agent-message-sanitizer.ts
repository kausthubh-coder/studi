type ModelMessageLike = {
  content?: unknown;
  message?: unknown;
  parts?: unknown;
  reasoning?: unknown;
  reasoningDetails?: unknown;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isProviderPrivateReasoningPart(part: unknown): boolean {
  if (!isRecord(part)) {
    return false;
  }

  const type = part.type;
  if (
    type === "reasoning" ||
    type === "redacted-reasoning" ||
    type === "thinking" ||
    type === "redacted" ||
    type === "reasoning.text" ||
    type === "reasoning.summary" ||
    type === "reasoning.encrypted"
  ) {
    return true;
  }

  const isToolReplayPart = type === "tool-call" || type === "tool-result";
  return !isToolReplayPart && typeof part.signature === "string";
}

function stripProviderPrivateReasoningParts(parts: unknown[]): unknown[] {
  return parts.filter((part) => !isProviderPrivateReasoningPart(part));
}

function hasVisibleReplayPayload(message: ModelMessageLike): boolean {
  if (typeof message.content === "string") {
    return true;
  }

  if (Array.isArray(message.content) && message.content.length > 0) {
    return true;
  }

  return Array.isArray(message.parts) && message.parts.length > 0;
}

export function sanitizeStudiModelMessages<T extends ModelMessageLike>(
  messages: readonly T[],
): T[] {
  return messages
    .map((message): T | null => sanitizeStudiModelMessage(message))
    .filter((message): message is T => message !== null);
}

function sanitizeStudiModelMessage<T extends ModelMessageLike>(
  message: T,
): T | null {
  let sanitized = message;
  let changed = false;
  const hadReplayPayloadArray =
    Array.isArray(message.content) || Array.isArray(message.parts);
  const hadPrivateTopLevelReasoning =
    "reasoning" in message || "reasoningDetails" in message;

  if (isRecord(message.message)) {
    const nestedMessage = sanitizeStudiModelMessage(
      message.message as ModelMessageLike,
    );

    if (!nestedMessage) {
      return null;
    }

    if (nestedMessage !== message.message) {
      sanitized = {
        ...sanitized,
        message: nestedMessage,
      };
      changed = true;
    }
  }

  if (hadPrivateTopLevelReasoning) {
    const withoutReasoning = { ...sanitized };
    delete withoutReasoning.reasoning;
    delete withoutReasoning.reasoningDetails;
    sanitized = withoutReasoning as T;
    changed = true;
  }

  if (Array.isArray(sanitized.content)) {
    const content = stripProviderPrivateReasoningParts(sanitized.content);

    if (content.length !== sanitized.content.length) {
      sanitized = {
        ...sanitized,
        content,
      };
      changed = true;
    }
  }

  if (Array.isArray(sanitized.parts)) {
    const parts = stripProviderPrivateReasoningParts(sanitized.parts);

    if (parts.length !== sanitized.parts.length) {
      sanitized = {
        ...sanitized,
        parts,
      };
      changed = true;
    }
  }

  if (
    !hasVisibleReplayPayload(sanitized) &&
    (hadReplayPayloadArray || hadPrivateTopLevelReasoning)
  ) {
    return null;
  }

  return changed ? sanitized : message;
}
