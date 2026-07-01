type ModelMessageLike = {
  content?: unknown;
  [key: string]: unknown;
};

function isProviderPrivateReasoningPart(part: unknown): boolean {
  if (!part || typeof part !== "object") {
    return false;
  }

  const type = (part as { type?: unknown }).type;
  return type === "reasoning" || type === "redacted-reasoning" || type === "thinking";
}

export function sanitizeStudiModelMessages<T extends ModelMessageLike>(
  messages: readonly T[],
): T[] {
  return messages
    .map((message): T | null => {
      if (!Array.isArray(message.content)) {
        return message;
      }

      const content = message.content.filter(
        (part) => !isProviderPrivateReasoningPart(part),
      );

      if (content.length === message.content.length) {
        return message;
      }

      if (content.length === 0) {
        return null;
      }

      return {
        ...message,
        content,
      };
    })
    .filter((message): message is T => message !== null);
}
