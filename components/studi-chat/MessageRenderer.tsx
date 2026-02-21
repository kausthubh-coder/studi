import type { UIMessage } from "@convex-dev/agent/react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import SparkSceneRenderer from "@/components/sparks/SparkSceneRenderer";
import {
  isCreateSparkToolResult,
  isSparkSceneArtifact,
  type CreateSparkToolResult,
} from "@/lib/sparks/contracts";
import { IconChevronDown, IconPaperclip } from "@/components/studi-chat/icons";

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
  isStreaming: boolean;
  summary: string;
  steps: ActivityStep[];
};

type AssistantTextSegments = {
  hasToolBoundary: boolean;
  introText: string;
  finalText: string;
};

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

  const reasoningParts = parts.filter(
    (part): part is Extract<ChatMessagePart, { type: "reasoning" }> =>
      part.type === "reasoning",
  );
  if (reasoningParts.length > 0) {
    const text = reasoningParts
      .map((part) => part.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const isReasoningStreaming = reasoningParts.some(
      (part) => part.state === "streaming",
    );

    steps.push({
      id: `${message.key}-reasoning`,
      label: isReasoningStreaming ? "Thinking" : "Reasoned through response",
      detail: text ? truncate(text, 180) : undefined,
      status: isReasoningStreaming ? "active" : "complete",
      summary: isReasoningStreaming ? "Thinking" : "Reasoned",
    });
    summaryParts.push(isReasoningStreaming ? "Thinking" : "Reasoned");
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
          status = "error";
          detail = "Spark returned an unexpected output shape.";
        } else if (sparkResult.status === "failed") {
          status = "error";
          detail = sparkResult.error;
        } else {
          status = "complete";
          detail = sparkResult.workerSummary;
        }
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
          : detail,
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
      ? `Working - ${baseSummary}`
      : baseSummary;

  return {
    hasActivity: steps.length > 0,
    isStreaming,
    summary,
    steps,
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

function extractCreateSparkToolResult(
  output: unknown,
): CreateSparkToolResult | null {
  if (isCreateSparkToolResult(output)) {
    return output;
  }
  if (!output || typeof output !== "object") {
    return null;
  }

  const container = output as {
    artifact?: unknown;
    result?: unknown;
    output?: unknown;
  };

  if (isCreateSparkToolResult(container.result)) {
    return container.result;
  }
  if (isCreateSparkToolResult(container.output)) {
    return container.output;
  }

  if (isSparkSceneArtifact(container.artifact)) {
    return {
      status: "success",
      workerSummary: "Spark artifact created.",
      warnings: [],
      artifact: container.artifact,
    };
  }

  return null;
}

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
      return {
        phase: "spark",
      };
    }

    const reasoningPart = parts.find(
      (part) => part.type === "reasoning" && part.state === "streaming",
    );
    if (reasoningPart) {
      return {
        phase: "reasoning",
      };
    }

    const toolPart = parts.find(
      (part) => Boolean(getToolName(part)) && isToolPartInProgress(part),
    );
    if (toolPart) {
      return {
        phase: "tool",
      };
    }

    if (message.status === "streaming") {
      return {
        phase: "reasoning",
      };
    }
  }

  return { phase: "idle" };
}

function AssistantActivityPanel({
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

  if (!activity.hasActivity) {
    return null;
  }

  const isOpen = !isCollapsed;
  const stepsId = `${message.key}-assistant-steps`;

  return (
    <div className="agent-activity not-prose">
      <button
        type="button"
        className="agent-activity-trigger"
        onClick={() => {
          setIsCollapsed((previous) => !previous);
        }}
        aria-expanded={isOpen}
        aria-controls={stepsId}
      >
        <span className="agent-activity-summary">{activity.summary}</span>
        <IconChevronDown
          className={`agent-activity-chevron${isOpen ? " is-open" : ""}`}
        />
      </button>

      <div
        id={stepsId}
        className="agent-activity-steps"
        data-state={isOpen ? "open" : "closed"}
      >
        {activity.steps.map((step) => (
          <div key={step.id} className="agent-step" data-status={step.status}>
            <span className="agent-step-marker" aria-hidden />
            <div className="agent-step-content">
              <p className="agent-step-label">{step.label}</p>
              {step.detail ? (
                <p className="agent-step-detail">{step.detail}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssistantParts({ message }: { message: UIMessage }) {
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
    activity.isStreaming && textSegments.introText.trim().length > 0;

  const finalText =
    textSegments.hasToolBoundary && !activity.isStreaming
      ? textSegments.finalText
      : textSegments.hasToolBoundary && activity.isStreaming
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
      const sparkResult = extractCreateSparkToolResult(toolState.output);
      if (
        toolState.state !== "output-available" ||
        sparkResult?.status !== "success" ||
        !sparkResult.artifact
      ) {
        return null;
      }

      return (
        <div key={`${message.key}-spark-${partIndex}`}>
          <SparkSceneRenderer artifact={sparkResult.artifact} />
        </div>
      );
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
            className="my-3 block overflow-hidden rounded-lg"
            style={{ border: "1px solid var(--border)" }}
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
          className="my-2 flex w-fit items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg-alt)",
            color: "var(--fg-muted)",
          }}
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
      {shouldShowIntroText ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {textSegments.introText}
        </ReactMarkdown>
      ) : null}
      <AssistantActivityPanel message={message} activity={activity} />
      {textToRender ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {textToRender}
        </ReactMarkdown>
      ) : null}
      {sparkArtifacts}
      {fileArtifacts}
    </>
  );
}

export function ArticleMessage({
  message,
  index,
}: {
  message: UIMessage;
  index: number;
}) {
  const fileParts = (message.parts ?? []).filter((p) => p.type === "file");

  if (message.role === "user") {
    return (
      <div
        className="animate-rise mb-6 mt-8 flex justify-end first:mt-0"
        style={{ animationDelay: `${Math.min(index * 30, 200)}ms` }}
      >
        <div
          className="max-w-[72%] rounded-2xl rounded-br-sm px-4 py-2.5 font-body text-sm leading-relaxed"
          style={{
            background: "var(--accent-dim)",
            border: "1px solid rgba(168,92,58,0.18)",
            color: "var(--fg)",
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
                    style={{ color: "var(--accent)" }}
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
        <AssistantParts message={message} />
      </div>
    </div>
  );
}
