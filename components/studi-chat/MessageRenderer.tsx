import type { UIMessage } from "@convex-dev/agent/react";
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import SparkSceneRenderer from "@/components/sparks/SparkSceneRenderer";
import {
  isCreateSparkToolResult,
  isSparkArtifact,
  type CreateSparkToolResult,
  type SparkArtifact,
} from "@/lib/sparks/contracts";
import { IconPaperclip } from "@/components/studi-chat/icons";
import { OrbitalActivity } from "@/components/studi-chat/OrbitalActivity";

type ChatMessagePart = NonNullable<UIMessage["parts"]>[number];

export type AgentUiState = {
  phase: "idle" | "reasoning" | "tool" | "spark";
};

export type ActivityStepKind = "reasoning" | "tool" | "spark";
export type ActivityStepStatus = "active" | "complete" | "error";

export type ActivityStep = {
  id: string;
  kind: ActivityStepKind;
  label: string;
  detail?: string;
  status: ActivityStepStatus;
};

type AssistantTextSegments = {
  hasToolBoundary: boolean;
  introText: string;
  finalText: string;
};

/* ── Helpers ──────────────────────────────────────────────── */

function joinTextParts(
  parts: Array<Extract<ChatMessagePart, { type: "text" }>>,
): string {
  return parts
    .map((part) => part.text)
    .filter((text) => typeof text === "string" && text.trim().length > 0)
    .join("\n\n")
    .trim();
}

function splitAssistantTextSegments(
  parts: ChatMessagePart[],
): AssistantTextSegments {
  const boundaryIndexes: number[] = [];
  for (const [index, part] of parts.entries()) {
    if (part.type === "step-start" || getToolName(part)) {
      boundaryIndexes.push(index);
    }
  }

  const textEntries = parts
    .map((part, index) => ({ index, part }))
    .filter(
      (
        entry,
      ): entry is {
        index: number;
        part: Extract<ChatMessagePart, { type: "text" }>;
      } => entry.part.type === "text",
    );

  if (boundaryIndexes.length === 0) {
    return {
      hasToolBoundary: false,
      introText: "",
      finalText: joinTextParts(textEntries.map((entry) => entry.part)),
    };
  }

  const firstBoundaryIndex = Math.min(...boundaryIndexes);
  const lastBoundaryIndex = Math.max(...boundaryIndexes);

  const introText = joinTextParts(
    textEntries
      .filter((entry) => entry.index < firstBoundaryIndex)
      .map((entry) => entry.part),
  );
  const finalText = joinTextParts(
    textEntries
      .filter((entry) => entry.index > lastBoundaryIndex)
      .map((entry) => entry.part),
  );

  return {
    hasToolBoundary: true,
    introText,
    finalText,
  };
}

function normalizeRenderableText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function mapToolStateToStatus(state: string | undefined): ActivityStepStatus {
  if (state === "output-error") {
    return "error";
  }
  if (state === "input-streaming" || state === "input-available") {
    return "active";
  }
  return "complete";
}

const KNOWN_TOOL_KIND: Record<
  string,
  {
    kind: ActivityStepKind;
    active: string;
    complete: string;
    error: string;
  }
> = {
  create_spark: {
    kind: "spark",
    active: "Building an interactive Spark",
    complete: "Built a Spark",
    error: "Spark failed to build",
  },
};

const FALLBACK_TOOL_KIND = {
  kind: "tool" as const,
  active: "Looking into it",
  complete: "Looked into it",
  error: "Ran into a problem",
};

function resolveToolKind(toolName: string) {
  return KNOWN_TOOL_KIND[toolName] ?? FALLBACK_TOOL_KIND;
}

export function buildActivitySteps(
  message: UIMessage,
  introText?: string,
): ActivityStep[] {
  const parts = message.parts ?? [];
  const steps: ActivityStep[] = [];
  const reasoningParts = parts.filter(
    (part): part is Extract<ChatMessagePart, { type: "reasoning" }> =>
      part.type === "reasoning",
  );

  if (introText?.trim() && (reasoningParts.length > 0 || parts.some(getToolName))) {
    steps.push({
      id: `${message.key}-intro`,
      kind: "reasoning",
      label: message.status === "streaming" ? "Drafting a response" : "Drafted a response",
      status: message.status === "streaming" ? "active" : "complete",
    });
  }

  if (reasoningParts.length > 0) {
    const isActive = reasoningParts.some((part) => part.state === "streaming");
    steps.push({
      id: `${message.key}-reasoning`,
      kind: "reasoning",
      label: isActive ? "Thinking it through" : "Thought it through",
      status: isActive ? "active" : "complete",
    });
  }

  const seenToolCallIds = new Set<string>();
  for (const [index, part] of parts.entries()) {
    const toolName = getToolName(part);
    if (!toolName) {
      continue;
    }

    const toolPart = part as {
      toolCallId?: unknown;
      state?: string;
      output?: unknown;
    };
    const callId =
      typeof toolPart.toolCallId === "string"
        ? toolPart.toolCallId
        : `${toolName}-${index}`;
    if (seenToolCallIds.has(callId)) {
      continue;
    }
    seenToolCallIds.add(callId);

    let status = mapToolStateToStatus(toolPart.state);
    if (toolName === "create_spark" && toolPart.state === "output-available") {
      status =
        classifySparkOutcome(toolPart.output) === "success"
          ? "complete"
          : "error";
    }
    const vocabulary = resolveToolKind(toolName);
    steps.push({
      id: `${message.key}-tool-${callId}`,
      kind: vocabulary.kind,
      label: vocabulary[status],
      status,
    });
  }

  const fileCount = parts.filter((part) => part.type === "file").length;
  if (fileCount > 0) {
    steps.push({
      id: `${message.key}-files`,
      kind: "tool",
      label: fileCount > 1 ? "Shared files" : "Shared a file",
      status: "complete",
    });
  }

  return steps;
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

function getSparkId(input: unknown): string | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const sparkId = (input as { sparkId?: unknown }).sparkId;
  return typeof sparkId === "string" ? sparkId : undefined;
}

function getToolOutputText(output: unknown): string | undefined {
  if (typeof output === "string") {
    return output;
  }

  if (!output || typeof output !== "object") {
    return undefined;
  }

  const record = output as {
    value?: unknown;
    output?: unknown;
  };

  if (typeof record.value === "string") {
    return record.value;
  }

  if (record.output && typeof record.output === "object") {
    const nested = record.output as { value?: unknown };
    if (typeof nested.value === "string") {
      return nested.value;
    }
  }

  return undefined;
}

function classifySparkFailure(error: string): string {
  const normalized = error.toLowerCase();
  if (normalized.includes("timed out")) {
    return "timeout";
  }
  if (normalized.includes("provider")) {
    return "provider";
  }
  if (normalized.includes("syntax")) {
    return "syntax";
  }
  if (normalized.includes("cancelled")) {
    return "cancelled";
  }
  return "error";
}

/* ── Spark failure card ──────────────────────────────────── */

const SparkFailureCard = memo(function SparkFailureCard({
  sparkId,
  workerSummary,
  error,
}: {
  sparkId?: string;
  workerSummary?: string;
  error: string;
}) {
  const sparkLabel = sparkId
    ? sparkId.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "Spark";
  const failureKind = classifySparkFailure(error);

  return (
    <div className="spark-fail my-3 not-prose">
      <div className="flex items-center gap-2">
        <p
          className="text-sm font-semibold text-fg"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          {sparkLabel} failed to build
        </p>
        <span className="spark-fail-badge">{failureKind}</span>
      </div>
      {workerSummary ? (
        <p
          className="mt-1 text-xs text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          {workerSummary}
        </p>
      ) : null}
      <p
        className="mt-1 text-xs"
        style={{ color: "#8f3c3c", fontFamily: "var(--font-jakarta)" }}
      >
        {error}
      </p>
    </div>
  );
});

/* ── Spark result extraction ─────────────────────────────── */

function extractCreateSparkToolResult(
  output: unknown,
): CreateSparkToolResult | null {
  if (isCreateSparkToolResult(output)) {
    return output;
  }

  const parseFromString = (text: string): CreateSparkToolResult | null => {
    const normalized = text.trim();
    if (!normalized) {
      return null;
    }

    if (/^spark failed:/i.test(normalized)) {
      return {
        status: "failed",
        workerSummary: "Spark generation failed.",
        warnings: [],
        error: normalized.replace(/^spark failed:\s*/i, "") || normalized,
      };
    }

    if (normalized.startsWith("{") || normalized.startsWith("[")) {
      try {
        const parsed = JSON.parse(normalized);
        return isCreateSparkToolResult(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }

    return null;
  };

  if (typeof output === "string") {
    return parseFromString(output);
  }

  if (!output || typeof output !== "object") {
    return null;
  }

  const container = output as {
    artifact?: unknown;
    result?: unknown;
    output?: unknown;
    value?: unknown;
  };

  if (isCreateSparkToolResult(container.result)) {
    return container.result;
  }
  const nestedResult = extractCreateSparkToolResult(container.result);
  if (nestedResult) {
    return nestedResult;
  }

  if (isCreateSparkToolResult(container.output)) {
    return container.output;
  }
  const nestedOutput = extractCreateSparkToolResult(container.output);
  if (nestedOutput) {
    return nestedOutput;
  }

  if (typeof container.value === "string") {
    const parsed = parseFromString(container.value);
    if (parsed) {
      return parsed;
    }
  }

  if (isSparkArtifact(container.artifact)) {
    return {
      status: "success",
      workerSummary: "Spark artifact created.",
      warnings: [],
      artifact: container.artifact,
    };
  }

  return null;
}

function classifySparkOutcome(
  output: unknown,
): "success" | "failed" | "unknown" {
  const sparkResult = extractCreateSparkToolResult(output);
  if (sparkResult?.status === "success") {
    return "success";
  }
  if (sparkResult?.status === "failed") {
    return "failed";
  }

  const outputText = getToolOutputText(output)?.trim();
  return outputText && /^spark created/i.test(outputText)
    ? "success"
    : "unknown";
}

/* ── Agent UI state ──────────────────────────────────────── */

export function deriveAgentUiState(messages: UIMessage[]): AgentUiState {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") {
      break;
    }
    if (message.role !== "assistant") {
      continue;
    }

    const steps = buildActivitySteps(message);
    if (
      steps.some((step) => step.kind === "spark" && step.status === "active")
    ) {
      return { phase: "spark" };
    }

    const reasoningPart = (message.parts ?? []).find(
      (part) => part.type === "reasoning" && part.state === "streaming",
    );
    if (reasoningPart) {
      return { phase: "reasoning" };
    }

    if (
      steps.some((step) => step.kind === "tool" && step.status === "active")
    ) {
      return { phase: "tool" };
    }

    if (message.status === "streaming") {
      return { phase: "reasoning" };
    }
  }

  return { phase: "idle" };
}

/* ── Assistant parts renderer ────────────────────────────── */

function AssistantParts({
  message,
  threadId,
  onExpandSpark,
  expandedSparkInstanceId,
}: {
  message: UIMessage;
  threadId: string | null;
  onExpandSpark: (
    artifact: SparkArtifact,
    threadId: string | null,
    sparkInstanceId: string,
  ) => void;
  expandedSparkInstanceId: string | null;
}) {
  const parts = useMemo(() => message.parts ?? [], [message.parts]);
  const textSegments = useMemo(
    () => splitAssistantTextSegments(parts),
    [parts],
  );
  const activitySteps = useMemo(
    () => buildActivitySteps(message, textSegments.introText),
    [message, textSegments.introText],
  );
  const activityPhase = useMemo(
    () => deriveAgentUiState([message]).phase,
    [message],
  );

  const shouldShowIntroText =
    textSegments.introText.trim().length > 0;

  const introMatchesFinal =
    shouldShowIntroText &&
    normalizeRenderableText(textSegments.introText) ===
      normalizeRenderableText(textSegments.finalText);

  const finalText = textSegments.hasToolBoundary
    ? textSegments.finalText
    : textSegments.finalText;

  const sparkArtifacts = parts
    .map((part, partIndex) => {
      const toolName = getToolName(part);
      if (toolName !== "create_spark") {
        return null;
      }

      const toolState = part as {
        state?: string;
        output?: unknown;
      };
      const sparkResult = extractCreateSparkToolResult(toolState);
      if (
        toolState.state !== "output-available" ||
        sparkResult?.status !== "success" ||
        !sparkResult.artifact
      ) {
        return null;
      }

      return (
        <div key={`${message.key}-spark-${partIndex}`}>
          <SparkSceneRenderer
            artifact={sparkResult.artifact}
            threadId={threadId}
            sparkInstanceId={
              sparkResult.artifact.artifactId ??
              `${message.key}-spark-${partIndex}`
            }
            onExpandSpark={onExpandSpark}
            expandedSparkInstanceId={expandedSparkInstanceId}
          />
        </div>
      );
    })
    .filter((artifact): artifact is React.JSX.Element => artifact !== null);

  const sparkFailures = parts
    .map((part, partIndex) => {
      const toolName = getToolName(part);
      if (toolName !== "create_spark") {
        return null;
      }

      const toolState = part as {
        state?: string;
        input?: unknown;
        output?: unknown;
        errorText?: unknown;
      };

      const sparkId = getSparkId(toolState.input);

      if (toolState.state === "output-error") {
        return (
          <SparkFailureCard
            key={`${message.key}-spark-fail-${partIndex}`}
            sparkId={sparkId}
            error={
              typeof toolState.errorText === "string"
                ? toolState.errorText
                : "Spark tool failed before returning output."
            }
          />
        );
      }

      if (toolState.state !== "output-available") {
        return null;
      }

      const sparkOutcome = classifySparkOutcome(toolState.output);
      if (sparkOutcome === "unknown") {
        return (
          <SparkFailureCard
            key={`${message.key}-spark-fail-${partIndex}`}
            sparkId={sparkId}
            error="Spark returned an unexpected output shape."
          />
        );
      }

      if (sparkOutcome === "failed") {
        const sparkResult = extractCreateSparkToolResult(toolState.output);
        if (!sparkResult || sparkResult.status !== "failed") {
          return null;
        }

        return (
          <SparkFailureCard
            key={`${message.key}-spark-fail-${partIndex}`}
            sparkId={sparkId}
            workerSummary={sparkResult.workerSummary}
            error={sparkResult.error}
          />
        );
      }

      return null;
    })
    .filter((artifact): artifact is React.JSX.Element => artifact !== null);

  const fileArtifacts = parts
    .map((part, partIndex) => {
      if (part.type !== "file") {
        return null;
      }

      const isImage = part.mediaType.startsWith("image/");
      if (isImage) {
        return (
          <a
            key={`${message.key}-file-${partIndex}`}
            href={part.url}
            target="_blank"
            rel="noreferrer"
            className="my-3 block overflow-hidden rounded-xl border border-border-warm"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={part.url}
              alt={part.filename ?? "image"}
              className="h-44 w-auto object-cover"
            />
          </a>
        );
      }

      return (
        <a
          key={`${message.key}-doc-${partIndex}`}
          href={part.url}
          target="_blank"
          rel="noreferrer"
          className="my-2 flex w-fit items-center gap-1.5 rounded-lg border border-border-warm bg-bg-alt px-3 py-1.5 text-sm text-fg-muted"
        >
          <IconPaperclip />
          {part.filename ?? "file"}
        </a>
      );
    })
    .filter((artifact): artifact is React.JSX.Element => artifact !== null);

  const textToRender =
    finalText.trim().length > 0
      ? finalText
      : !textSegments.hasToolBoundary
        ? (message.text ?? "")
        : "";

  return (
    <>
      {shouldShowIntroText && !introMatchesFinal ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, rehypeHighlight]}
        >
          {textSegments.introText}
        </ReactMarkdown>
      ) : null}
      <OrbitalActivity
        messageKey={message.key}
        phase={activityPhase}
        steps={activitySteps}
        isStreaming={message.status === "streaming"}
        finalText={finalText}
      />
      {/* Intended sequence: show Spark output first, then post-tool guidance text. */}
      {sparkFailures}
      {sparkArtifacts}
      {textToRender ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex, rehypeHighlight]}
        >
          {textToRender}
        </ReactMarkdown>
      ) : null}
      {fileArtifacts}
    </>
  );
}

/* ── Message component ───────────────────────────────────── */

export const ArticleMessage = memo(function ArticleMessage({
  message,
  index,
  threadId,
  onExpandSpark,
  expandedSparkInstanceId,
}: {
  message: UIMessage;
  index: number;
  threadId: string | null;
  onExpandSpark: (
    artifact: SparkArtifact,
    threadId: string | null,
    sparkInstanceId: string,
  ) => void;
  expandedSparkInstanceId: string | null;
}) {
  const fileParts = useMemo(
    () => (message.parts ?? []).filter((p) => p.type === "file"),
    [message.parts],
  );

  if (message.role === "user") {
    return (
      <div
        className="animate-rise mb-6 mt-8 flex justify-end first:mt-0"
        style={{ animationDelay: `${Math.min(index * 30, 200)}ms` }}
      >
        <div
          className="max-w-[72%] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed shadow-[4px_4px_0px_#1c1208]"
          style={{
            background: "var(--accent)",
            border: "3px solid #1c1208",
            color: "#fff",
            fontFamily: "var(--font-jakarta)",
          }}
        >
          {message.text || "..."}
          {fileParts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {fileParts.map((part, idx) => {
                const f = part as unknown as {
                  url?: string;
                  mediaType?: string;
                  filename?: string;
                };
                const isImage = (f.mediaType ?? "").startsWith("image/");
                if (isImage && f.url) {
                  return (
                    <a
                      key={`${message.key}-uimg-${idx}`}
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt={f.filename ?? "image"}
                        className="h-24 w-auto object-cover"
                      />
                    </a>
                  );
                }
                return (
                  <a
                    key={`${message.key}-ufile-${idx}`}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-xs underline"
                    style={{ color: "rgba(255,255,255,0.85)" }}
                  >
                    <IconPaperclip />
                    {f.filename ?? "file"}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="animate-rise mb-12"
      style={{ animationDelay: `${Math.min(index * 30, 200)}ms` }}
    >
      <div className="article-prose">
        <AssistantParts
          message={message}
          threadId={threadId}
          onExpandSpark={onExpandSpark}
          expandedSparkInstanceId={expandedSparkInstanceId}
        />
      </div>
    </div>
  );
});
