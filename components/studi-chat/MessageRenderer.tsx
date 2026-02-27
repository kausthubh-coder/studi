import type { UIMessage } from "@convex-dev/agent/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
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
import { IconChevronDown, IconPaperclip } from "@/components/studi-chat/icons";
import { FlickeringGrid } from "@/components/studi-chat/FlickeringGrid";

type ChatMessagePart = NonNullable<UIMessage["parts"]>[number];

type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

export type AgentUiState = {
  phase: "idle" | "reasoning" | "tool" | "spark";
};

type ActivityStepStatus = "active" | "complete" | "error";

type ActivityStep = {
  id: string;
  label: string;
  detail?: string;
  status: ActivityStepStatus;
  summary: string;
};

type AssistantActivity = {
  hasActivity: boolean;
  /** True when the only activity is a single create_spark call with no reasoning.
   *  In this case we hide the CoT panel — the SparkBuildingCard covers the UX. */
  isTrivial: boolean;
  isStreaming: boolean;
  summary: string;
  steps: ActivityStep[];
  reasoningText: string;
};

type AssistantTextSegments = {
  hasToolBoundary: boolean;
  introText: string;
  finalText: string;
};

/* ── Helpers ──────────────────────────────────────────────── */

function humanizeToolName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSentenceCase(text: string): string {
  if (!text) {
    return text;
  }
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

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

function getToolInputDetail(input: unknown): string | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const candidate = input as Record<string, unknown>;
  const keys = [
    "query",
    "context",
    "summary",
    "title",
    "path",
    "url",
    "prompt",
  ];
  for (const key of keys) {
    const value = candidate[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return truncate(value.trim(), 120);
    }
  }

  return undefined;
}

function deriveAssistantActivity(
  message: UIMessage,
  introText?: string,
): AssistantActivity {
  const parts = message.parts ?? [];
  const steps: ActivityStep[] = [];
  const summaryParts: string[] = [];

  // Collect reasoning text
  const reasoningParts = parts.filter(
    (part): part is Extract<ChatMessagePart, { type: "reasoning" }> =>
      part.type === "reasoning",
  );

  const reasoningText = reasoningParts
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (reasoningParts.length > 0) {
    const isReasoningStreaming = reasoningParts.some(
      (part) => part.state === "streaming",
    );

    steps.push({
      id: `${message.key}-reasoning`,
      label: isReasoningStreaming ? "Thinking" : "Reasoned through response",
      detail: reasoningText ? truncate(reasoningText, 180) : undefined,
      status: isReasoningStreaming ? "active" : "complete",
      summary: isReasoningStreaming ? "Thinking" : "Reasoned",
    });
    summaryParts.push(isReasoningStreaming ? "Thinking" : "Reasoned");
  }

  const seenToolCallIds = new Set<string>();
  const seenToolNames = new Set<string>();
  for (const [index, part] of parts.entries()) {
    const toolName = getToolName(part);
    if (!toolName) {
      continue;
    }
    seenToolNames.add(toolName);

    const toolPart = part as {
      toolCallId?: unknown;
      state?: string;
      input?: unknown;
      errorText?: unknown;
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
    const readableToolName = humanizeToolName(toolName);
    let detail =
      toolName === "create_spark"
        ? getSparkBuildContext(toolPart.input)
        : getToolInputDetail(toolPart.input);

    if (toolName === "create_spark") {
      const sparkResult = extractCreateSparkToolResult(
        (toolPart as { output?: unknown }).output,
      );

      if (toolPart.state === "output-error") {
        status = "error";
      } else if (toolPart.state === "output-available") {
        if (!sparkResult) {
          const outputText = getToolOutputText(
            (toolPart as { output?: unknown }).output,
          )?.trim();
          if (outputText && /^spark created/i.test(outputText)) {
            status = "complete";
            detail = outputText;
          } else {
            status = "error";
            detail = "Spark returned an unexpected output shape.";
          }
        } else if (sparkResult.status === "failed") {
          status = "error";
          detail = sparkResult.error;
        } else {
          status = "complete";
          detail = sparkResult.workerSummary;
        }
      }
    }

    if (toolName !== "create_spark" && toolPart.state === "output-available") {
      const structured = getStructuredToolOutput(
        (toolPart as { output?: unknown }).output,
      );

      if (structured?.status === "failed") {
        status = "error";
      }

      if (status === "error") {
        detail =
          structured?.errorMessage ??
          structured?.summary ??
          getToolOutputText((toolPart as { output?: unknown }).output) ??
          detail;
      } else {
        detail =
          structured?.summary ??
          getToolOutputText((toolPart as { output?: unknown }).output) ??
          detail;
      }
    }

    const label =
      toolName === "create_spark"
        ? status === "active"
          ? "Creating spark"
          : status === "error"
            ? "Spark failed"
            : "Created spark"
        : status === "active"
          ? `Calling ${readableToolName}`
          : status === "error"
            ? `${toSentenceCase(readableToolName)} failed`
            : `Called ${readableToolName}`;

    const summary =
      toolName === "create_spark"
        ? status === "active"
          ? "Creating spark"
          : status === "error"
            ? "Spark failed"
            : "Created spark"
        : status === "active"
          ? `Calling ${readableToolName}`
          : status === "error"
            ? "Tool failed"
            : `Used ${readableToolName}`;

    steps.push({
      id: `${message.key}-tool-${callId}`,
      label,
      detail:
        status === "error" && typeof toolPart.errorText === "string"
          ? truncate(toolPart.errorText, 120)
          : detail
            ? truncate(detail, 160)
            : undefined,
      status,
      summary,
    });
    summaryParts.push(summary);
  }

  const fileParts = parts.filter((part) => part.type === "file");
  if (fileParts.length > 0) {
    steps.push({
      id: `${message.key}-files`,
      label: fileParts.length > 1 ? "Presented files" : "Presented file",
      status: "complete",
      summary: fileParts.length > 1 ? "Presented files" : "Presented file",
    });
    summaryParts.push(
      fileParts.length > 1 ? "Presented files" : "Presented file",
    );
  }

  const isStreaming =
    message.status === "streaming" ||
    steps.some((step) => step.status === "active");

  if (introText && introText.trim().length > 0 && steps.length > 0) {
    steps.unshift({
      id: `${message.key}-intro`,
      label: isStreaming ? "Drafting response" : "Initial response",
      detail: truncate(introText, 180),
      status: isStreaming ? "active" : "complete",
      summary: isStreaming ? "Drafting response" : "Drafted response",
    });
    summaryParts.unshift(
      isStreaming ? "Drafting response" : "Drafted response",
    );
  }

  if (!isStreaming && steps.length > 0) {
    const hasErrors = steps.some((step) => step.status === "error");
    steps.push({
      id: `${message.key}-done`,
      label: hasErrors ? "Finished with issues" : "Done",
      status: hasErrors ? "error" : "complete",
      summary: hasErrors ? "Finished with issues" : "Done",
    });
  }

  const dedupedSummary = Array.from(new Set(summaryParts));
  const baseSummary =
    dedupedSummary.length > 0
      ? dedupedSummary.slice(0, 3).join(", ")
      : isStreaming
        ? "Working"
        : "Show steps";
  const summary =
    isStreaming && baseSummary !== "Working"
      ? `Working — ${baseSummary}`
      : baseSummary;

  // A trivial activity is a single create_spark call with no reasoning.
  // We skip the CoT panel for these — the SparkBuildingCard handles the UX.
  const isTrivial =
    reasoningText.trim().length === 0 &&
    seenToolCallIds.size === 1 &&
    seenToolNames.size === 1 &&
    seenToolNames.has("create_spark");

  return {
    hasActivity: steps.length > 0,
    isTrivial,
    isStreaming,
    summary,
    steps,
    reasoningText,
  };
}

function getToolPartState(part: ChatMessagePart): ToolPartState | null {
  const state = (part as { state?: unknown }).state;
  if (
    state === "input-streaming" ||
    state === "input-available" ||
    state === "output-available" ||
    state === "output-error"
  ) {
    return state;
  }
  return null;
}

function isToolPartInProgress(part: ChatMessagePart): boolean {
  const state = getToolPartState(part);
  return state === "input-streaming" || state === "input-available";
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

function getSparkBuildContext(input: unknown): string | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }

  const candidate = input as {
    context?: unknown;
    summary?: unknown;
    title?: unknown;
  };
  if (typeof candidate.context === "string" && candidate.context.trim()) {
    return candidate.context.trim();
  }
  if (typeof candidate.summary === "string" && candidate.summary.trim()) {
    return candidate.summary.trim();
  }
  if (typeof candidate.title === "string" && candidate.title.trim()) {
    return candidate.title.trim();
  }

  return undefined;
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

function getStructuredToolOutput(output: unknown): {
  status?: string;
  summary?: string;
  errorMessage?: string;
} | null {
  if (!output || typeof output !== "object") {
    return null;
  }

  const root = output as {
    status?: unknown;
    summary?: unknown;
    error?: unknown;
    value?: unknown;
    output?: unknown;
  };

  const nested =
    root.value && typeof root.value === "object"
      ? (root.value as Record<string, unknown>)
      : root.output && typeof root.output === "object"
        ? (root.output as Record<string, unknown>)
        : null;

  const base: Record<string, unknown> =
    nested ?? (root as Record<string, unknown>);
  const errorRecord =
    base.error && typeof base.error === "object"
      ? (base.error as Record<string, unknown>)
      : null;

  const status = typeof base.status === "string" ? base.status : undefined;
  const summary = typeof base.summary === "string" ? base.summary : undefined;
  const errorMessage =
    typeof errorRecord?.message === "string"
      ? errorRecord.message
      : typeof base.error === "string"
        ? base.error
        : undefined;

  if (!status && !summary && !errorMessage) {
    return null;
  }

  return {
    status,
    summary,
    errorMessage,
  };
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

/* ── Spark building animation ────────────────────────────── */

const SparkBuildingCard = memo(function SparkBuildingCard({
  context,
}: {
  context?: string;
}) {
  return (
    <div className="spark-building-card my-4 not-prose">
      <FlickeringGrid
        className="spark-building-grid"
        squareSize={6}
        gridGap={10}
        maxOpacity={0.45}
        flickerChance={0.55}
        color="rgb(232, 160, 48)"
      />
      <div className="spark-building-content">
        <p
          className="text-sm font-semibold text-fg"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Building spark
        </p>
        {context && (
          <p
            className="mt-1 text-xs text-fg-muted"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            {truncate(context, 95)}
          </p>
        )}
      </div>
    </div>
  );
});

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

/* ── Agent UI state ──────────────────────────────────────── */

export function deriveAgentUiState(messages: UIMessage[]): AgentUiState {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") {
      continue;
    }

    const parts = message.parts ?? [];

    const sparkPart = parts.find(
      (part) =>
        getToolName(part) === "create_spark" && isToolPartInProgress(part),
    );
    if (sparkPart) {
      return { phase: "spark" };
    }

    const reasoningPart = parts.find(
      (part) => part.type === "reasoning" && part.state === "streaming",
    );
    if (reasoningPart) {
      return { phase: "reasoning" };
    }

    const toolPart = parts.find(
      (part) => Boolean(getToolName(part)) && isToolPartInProgress(part),
    );
    if (toolPart) {
      return { phase: "tool" };
    }

    if (message.status === "streaming") {
      return { phase: "reasoning" };
    }
  }

  return { phase: "idle" };
}

/* ── Activity panel — redesigned chain-of-thought ────────── */

const AssistantActivityPanel = memo(function AssistantActivityPanel({
  message,
  activity,
}: {
  message: UIMessage;
  activity: AssistantActivity;
}) {
  const [isCollapsed, setIsCollapsed] = useState(!activity.isStreaming);
  const wasStreamingRef = useRef(activity.isStreaming);

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current;
    wasStreamingRef.current = activity.isStreaming;

    if (!activity.hasActivity) {
      return;
    }

    if (!wasStreaming && activity.isStreaming) {
      const openTimer = setTimeout(() => {
        setIsCollapsed(false);
      }, 0);
      return () => {
        clearTimeout(openTimer);
      };
    }

    if (wasStreaming && !activity.isStreaming) {
      const closeTimer = setTimeout(() => {
        setIsCollapsed(true);
      }, 850);
      return () => {
        clearTimeout(closeTimer);
      };
    }
  }, [activity.hasActivity, activity.isStreaming]);

  if (!activity.hasActivity || activity.isTrivial) {
    return null;
  }

  const isOpen = !isCollapsed;
  const stepsId = `${message.key}-assistant-steps`;
  const stepCount = activity.steps.length;

  return (
    <div
      className="thinking-card not-prose"
      data-streaming={activity.isStreaming}
    >
      {/* Teal-tinted header strip */}
      <button
        type="button"
        className="thinking-toggle"
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls={stepsId}
      >
        <span className="thinking-toggle-dot" aria-hidden />
        <span className="thinking-toggle-label">{activity.summary}</span>
        {stepCount > 0 && (
          <span className="thinking-step-count">
            {stepCount} {stepCount === 1 ? "step" : "steps"}
          </span>
        )}
        <IconChevronDown
          className={`thinking-toggle-chevron${isOpen ? " is-open" : ""}`}
        />
      </button>

      <div
        id={stepsId}
        className="thinking-body"
        data-state={isOpen ? "open" : "closed"}
      >
        {/* Reasoning text — teal left border */}
        {activity.reasoningText && (
          <div className="reasoning-block">{activity.reasoningText}</div>
        )}

        {/* Steps timeline with solid filled dots */}
        {activity.steps.map((step) => (
          <div
            key={step.id}
            className="thinking-step"
            data-status={step.status}
          >
            <span className="thinking-step-dot" aria-hidden />
            <div>
              <p className="thinking-step-label">{step.label}</p>
              {step.detail && (
                <p className="thinking-step-detail">{step.detail}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

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
  const activity = useMemo(
    () => deriveAssistantActivity(message, textSegments.introText),
    [message, textSegments.introText],
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

  // Spark building cards (in-progress create_spark tools)
  const sparkBuildingCards = parts
    .map((part, partIndex) => {
      const toolName = getToolName(part);
      if (toolName !== "create_spark") return null;
      const toolState = part as { state?: string; input?: unknown };
      if (
        toolState.state !== "input-streaming" &&
        toolState.state !== "input-available"
      )
        return null;
      const context = getSparkBuildContext(toolState.input);
      return (
        <SparkBuildingCard
          key={`${message.key}-spark-building-${partIndex}`}
          context={context}
        />
      );
    })
    .filter((card): card is React.JSX.Element => card !== null);

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

      const sparkResult = extractCreateSparkToolResult(toolState);
      if (!sparkResult) {
        const outputText = getToolOutputText(toolState.output)?.trim();
        if (outputText && /^spark created/i.test(outputText)) {
          return null;
        }

        return (
          <SparkFailureCard
            key={`${message.key}-spark-fail-${partIndex}`}
            sparkId={sparkId}
            error="Spark returned an unexpected output shape."
          />
        );
      }

      if (sparkResult.status === "failed") {
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
      <AssistantActivityPanel message={message} activity={activity} />
      {sparkBuildingCards}
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
