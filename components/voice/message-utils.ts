import type { UIMessage } from "@convex-dev/agent/react";
import {
  isCreateSparkToolResult,
  isSparkArtifact,
  type SparkArtifact,
} from "@/lib/sparks/contracts";
import {
  isCreateWarningToolResult,
  type CreateWarningToolResult,
} from "@/lib/voice/contracts";

type ChatMessagePart = NonNullable<UIMessage["parts"]>[number];

function makeSparkInstanceId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getToolName(part: ChatMessagePart): string | null {
  if (part.type === "dynamic-tool") {
    const toolName = (part as { toolName?: unknown }).toolName;
    return typeof toolName === "string" ? toolName : null;
  }
  if (part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  return null;
}

function parseJsonString(value: string): unknown {
  const normalized = value.trim();
  if (
    !normalized ||
    (!normalized.startsWith("{") && !normalized.startsWith("["))
  ) {
    return null;
  }
  try {
    return JSON.parse(normalized);
  } catch {
    return null;
  }
}

function extractWarningResult(value: unknown): CreateWarningToolResult | null {
  if (isCreateWarningToolResult(value)) {
    return value;
  }

  if (typeof value === "string") {
    return extractWarningResult(parseJsonString(value));
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    result?: unknown;
    output?: unknown;
    value?: unknown;
    warning?: unknown;
  };

  return (
    extractWarningResult(candidate.result) ??
    extractWarningResult(candidate.output) ??
    extractWarningResult(candidate.value) ??
    extractWarningResult(candidate.warning)
  );
}

function extractSparkResult(value: unknown): {
  artifact: SparkArtifact;
  sparkInstanceId: string;
} | null {
  if (isCreateSparkToolResult(value)) {
    if (value.status === "success" && value.artifact) {
      return {
        artifact: value.artifact,
        sparkInstanceId: value.artifact.artifactId ?? makeSparkInstanceId(),
      };
    }
    return null;
  }

  if (typeof value === "string") {
    return extractSparkResult(parseJsonString(value));
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    artifact?: unknown;
    result?: unknown;
    output?: unknown;
    value?: unknown;
  };

  if (isSparkArtifact(candidate.artifact)) {
    return {
      artifact: candidate.artifact,
      sparkInstanceId: candidate.artifact.artifactId ?? makeSparkInstanceId(),
    };
  }

  return (
    extractSparkResult(candidate.result) ??
    extractSparkResult(candidate.output) ??
    extractSparkResult(candidate.value)
  );
}

export function extractLatestVoiceWarning(messages: UIMessage[]): {
  warning: CreateWarningToolResult;
  messageKey: string;
} | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") {
      continue;
    }

    const parts = message.parts ?? [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];
      if (getToolName(part) !== "create_warning") {
        continue;
      }

      const output = (part as { output?: unknown }).output;
      const warning = extractWarningResult(output);
      if (warning) {
        return {
          warning,
          messageKey: `${message.key}-warning-${partIndex}`,
        };
      }
    }
  }

  return null;
}

export function extractLatestVoiceSpark(messages: UIMessage[]): {
  artifact: SparkArtifact;
  sparkInstanceId: string;
} | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") {
      continue;
    }

    const parts = message.parts ?? [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];
      if (getToolName(part) !== "create_spark") {
        continue;
      }

      const output = (part as { output?: unknown }).output;
      const result = extractSparkResult(output);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

export function extractLatestAssistantTranscript(
  messages: UIMessage[],
): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant") {
      continue;
    }

    const textParts = (message.parts ?? [])
      .filter((part): part is Extract<ChatMessagePart, { type: "text" }> => {
        return part.type === "text";
      })
      .map((part) => part.text)
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .join("\n\n")
      .trim();

    if (textParts.length > 0) {
      return textParts;
    }

    if (typeof message.text === "string" && message.text.trim().length > 0) {
      return message.text.trim();
    }
  }

  return "";
}
