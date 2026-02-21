"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { UserButton } from "@clerk/nextjs";
import SparkSceneRenderer from "@/components/sparks/SparkSceneRenderer";
import {
  isCreateSparkToolResult,
  isSparkSceneArtifact,
  type CreateSparkToolResult,
} from "@/lib/sparks/contracts";

type PendingAttachment = {
  attachmentId: Id<"attachments">;
  filename?: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
};

/* ------------------------------------------------------------------ */
/*  Inline SVG icons                                                   */
/* ------------------------------------------------------------------ */

function IconCompose({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconPaperclip({ className }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function IconArrow({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function IconBook({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function IconX({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Article-style message renderer                                     */
/* ------------------------------------------------------------------ */

type ChatMessagePart = NonNullable<UIMessage["parts"]>[number];

type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "output-error";

type AgentUiState = {
  phase: "idle" | "reasoning" | "tool" | "spark";
};

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

function deriveAgentUiState(messages: UIMessage[]): AgentUiState {
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

function StatusCallout({
  label,
  detail,
  tone,
  loading,
}: {
  label: string;
  detail?: string;
  tone: "reasoning" | "tool" | "spark" | "error";
  loading?: boolean;
}) {
  const toneStyle: Record<
    "reasoning" | "tool" | "spark" | "error",
    { border: string; background: string; text: string }
  > = {
    reasoning: {
      border: "rgba(90,122,88,0.35)",
      background: "rgba(90,122,88,0.10)",
      text: "var(--fg)",
    },
    tool: {
      border: "var(--border)",
      background: "var(--bg-alt)",
      text: "var(--fg-muted)",
    },
    spark: {
      border: "rgba(168,92,58,0.35)",
      background: "rgba(168,92,58,0.10)",
      text: "var(--accent)",
    },
    error: {
      border: "rgba(176,74,74,0.45)",
      background: "rgba(176,74,74,0.10)",
      text: "#8f2f2f",
    },
  };

  const style = toneStyle[tone];

  return (
    <div
      className="my-3 rounded-lg px-3 py-2"
      style={{
        border: `1px solid ${style.border}`,
        background: style.background,
      }}
    >
      <p
        className="m-0 text-xs font-semibold tracking-wide"
        style={{ color: style.text }}
      >
        {label}
      </p>
      {detail && (
        <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
          {detail}
        </p>
      )}
      {loading && tone === "spark" && (
        <div
          className="status-spark-progress mt-2 h-1 w-full rounded-full"
          style={{ background: "rgba(168,92,58,0.18)" }}
          aria-hidden
        />
      )}
    </div>
  );
}

function AssistantParts({ message }: { message: UIMessage }) {
  const parts = message.parts ?? [];
  const latestSparkProgressPartIndex = (() => {
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const toolName = getToolName(parts[index]);
      if (toolName === "create_spark" && isToolPartInProgress(parts[index])) {
        return index;
      }
    }
    return -1;
  })();

  const rendered = parts.map((part, partIndex) => {
    if (part.type === "text") {
      if (!part.text) return null;
      return (
        <ReactMarkdown
          key={`${message.key}-text-${partIndex}`}
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {part.text}
        </ReactMarkdown>
      );
    }

    if (part.type === "reasoning") {
      return null;
    }

    if (part.type === "file") {
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
    }

    if (part.type === "step-start") {
      return null;
    }

    const toolName = getToolName(part);
    if (!toolName) {
      return null;
    }

    const toolState = part as {
      state?: string;
      input?: unknown;
      output?: unknown;
      errorText?: string;
    };

    if (toolName === "create_spark") {
      const sparkResult = extractCreateSparkToolResult(toolState.output);
      const sparkContext = getSparkBuildContext(toolState.input);

      if (
        toolState.state === "output-available" &&
        sparkResult?.status === "success" &&
        sparkResult.artifact
      ) {
        return (
          <div key={`${message.key}-spark-${partIndex}`}>
            <SparkSceneRenderer artifact={sparkResult.artifact} />
            <details
              className="mt-2 rounded-md px-3 py-2 text-xs"
              style={{
                border: "1px solid var(--border-faint)",
                color: "var(--fg-muted)",
              }}
            >
              <summary className="cursor-pointer font-heading">
                Working details
              </summary>
              <p className="mt-1">{sparkResult.workerSummary}</p>
              {sparkResult.warnings.length > 0 && (
                <p className="mt-1">
                  Warnings: {sparkResult.warnings.join(" ")}
                </p>
              )}
            </details>
          </div>
        );
      }

      if (
        toolState.state === "output-available" &&
        sparkResult?.status === "failed"
      ) {
        return (
          <StatusCallout
            key={`${message.key}-spark-failed-${partIndex}`}
            tone="error"
            label="Spark failed"
            detail={sparkResult.error}
          />
        );
      }

      if (toolState.state === "output-available") {
        const detail =
          typeof toolState.output === "string"
            ? toolState.output
            : "Spark returned an unexpected output shape.";
        return (
          <StatusCallout
            key={`${message.key}-spark-unexpected-${partIndex}`}
            tone="error"
            label="Spark failed"
            detail={detail}
          />
        );
      }

      if (toolState.state === "output-error") {
        return (
          <StatusCallout
            key={`${message.key}-spark-error-${partIndex}`}
            tone="error"
            label="Spark failed"
            detail={toolState.errorText ?? "The spark could not be generated."}
          />
        );
      }

      if (partIndex !== latestSparkProgressPartIndex) {
        return null;
      }

      return (
        <StatusCallout
          key={`${message.key}-spark-progress-${partIndex}`}
          tone="spark"
          label="Working on Spark"
          detail={
            sparkContext ? `For: ${sparkContext}` : "For your latest question"
          }
          loading
        />
      );
    }

    return null;
  });

  if (rendered.some((item) => item !== null)) {
    return <>{rendered}</>;
  }

  if (message.text) {
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {message.text}
      </ReactMarkdown>
    );
  }

  return null;
}

function ArticleMessage({
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
          {message.text || "…"}
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

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function StudiChat() {
  const threadsQuery = useQuery(api.chat.listThreads);
  const threads = useMemo(() => threadsQuery ?? [], [threadsQuery]);
  const createThread = useAction(api.chatActions.createThread);
  const sendMessage = useAction(api.chatActions.sendMessage);
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const saveAttachment = useMutation(api.chat.saveAttachment);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      setSelectedThreadId(threads[0].threadId);
    }
  }, [threads, selectedThreadId]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [selectedThreadId]);

  const uiMessages = useUIMessages(
    api.chat.listThreadMessages,
    selectedThreadId ? { threadId: selectedThreadId } : "skip",
    { initialNumItems: 30, stream: true },
  );

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [uiMessages.results.length]);

  const hasActiveAgentWork = useMemo(
    () => deriveAgentUiState(uiMessages.results).phase !== "idle",
    [uiMessages.results],
  );
  const isComposerBusy = isSending || isUploading;

  const canSend = useMemo(
    () =>
      !isSending &&
      !isUploading &&
      !hasActiveAgentWork &&
      Boolean(selectedThreadId) &&
      (input.trim().length > 0 || pendingAttachments.length > 0),
    [
      input,
      hasActiveAgentWork,
      isSending,
      isUploading,
      pendingAttachments.length,
      selectedThreadId,
    ],
  );

  const createNewThread = async () => {
    const threadId = await createThread({ title: "New Thread" });
    setSelectedThreadId(threadId);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const releaseAttachmentPreviewUrls = (attachments: PendingAttachment[]) => {
    for (const attachment of attachments) {
      if (attachment.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
    }
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (!arr.length) return;
    setIsUploading(true);
    try {
      const uploaded: PendingAttachment[] = [];
      for (const file of arr) {
        const postUrl = await generateUploadUrl({});
        const res = await fetch(postUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
        const { storageId } = (await res.json()) as {
          storageId: Id<"_storage">;
        };
        const saved = await saveAttachment({
          storageId,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
        });
        uploaded.push({
          attachmentId: saved.attachmentId,
          filename: saved.filename,
          mimeType: saved.mimeType,
          size: saved.size,
          previewUrl: file.type.startsWith("image/")
            ? URL.createObjectURL(file)
            : undefined,
        });
      }
      setPendingAttachments((p) => [...p, ...uploaded]);
    } finally {
      setIsUploading(false);
    }
  };

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imgs: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) imgs.push(f);
      }
    }
    if (imgs.length) {
      e.preventDefault();
      await uploadFiles(imgs);
    }
  };

  const onSend = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!canSend || !selectedThreadId) return;

    const draft = input;
    const prompt = draft.trim() || undefined;
    const attachmentsSnapshot = pendingAttachments;
    const attachmentIds = attachmentsSnapshot.map((a) => a.attachmentId);

    setInput("");
    setPendingAttachments([]);
    setIsSending(true);
    try {
      await sendMessage({
        threadId: selectedThreadId,
        prompt,
        attachmentIds,
      });
      releaseAttachmentPreviewUrls(attachmentsSnapshot);
    } catch (error) {
      setInput(draft);
      setPendingAttachments(attachmentsSnapshot);
      console.error("Failed to send message", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      {/* ═══════════════════════════════════════════════════════
          SIDEBAR — fixed left column
      ═══════════════════════════════════════════════════════ */}
      <aside
        className="flex h-screen flex-shrink-0 flex-col overflow-hidden"
        style={{
          width: "var(--sidebar-w)",
          borderRight: "1px solid var(--border)",
          background: "var(--bg-alt)",
        }}
      >
        {/* Brand */}
        <div className="px-5 pb-3 pt-5">
          <p
            className="font-body text-xl font-semibold tracking-wide"
            style={{ color: "var(--fg)", letterSpacing: "0.06em" }}
          >
            studi
          </p>
        </div>

        {/* New thread button */}
        <div className="px-4 pb-2 pt-3">
          <button
            type="button"
            onClick={() => {
              void createNewThread();
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
            style={{
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--bg)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--fg)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--fg-muted)";
            }}
          >
            <IconCompose />
            <span className="font-heading text-[13px]">New thread</span>
          </button>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto py-1">
          {threads.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <IconBook
                className="mx-auto mb-2 opacity-30"
                style={{ color: "var(--fg-muted)" }}
              />
              <p
                className="font-heading text-xs italic"
                style={{ color: "var(--fg-faint)" }}
              >
                No threads yet
              </p>
            </div>
          ) : (
            threads.map((thread) => {
              const isActive = thread.threadId === selectedThreadId;
              return (
                <button
                  key={thread.threadId}
                  type="button"
                  onClick={() => setSelectedThreadId(thread.threadId)}
                  className="w-full px-4 py-2.5 text-left transition-colors"
                  style={{
                    background: isActive ? "var(--accent-dim)" : "transparent",
                    borderLeft: isActive
                      ? `2px solid var(--accent)`
                      : "2px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(0,0,0,0.04)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "transparent";
                    }
                  }}
                >
                  <p
                    className="truncate font-heading text-[13px] font-medium leading-snug"
                    style={{ color: isActive ? "var(--accent)" : "var(--fg)" }}
                  >
                    {thread.title && thread.title !== "New Thread" ? (
                      thread.title
                    ) : (
                      <span
                        className="italic"
                        style={{ color: "var(--fg-faint)" }}
                      >
                        New thread
                      </span>
                    )}
                  </p>
                  {thread.lastMessageAt && (
                    <p
                      className="mt-0.5 text-[11px]"
                      style={{ color: "var(--fg-faint)" }}
                    >
                      {new Date(thread.lastMessageAt).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* User button at bottom */}
        <div
          className="flex items-center gap-2.5 px-4 py-4"
          style={{ borderTop: "1px solid var(--border-faint)" }}
        >
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-7 h-7",
              },
            }}
          />
          <span
            className="font-heading text-xs"
            style={{ color: "var(--fg-faint)" }}
          >
            Account
          </span>
        </div>
      </aside>

      {/* ═══════════════════════════════════════════════════════
          MAIN AREA — article reading column
      ═══════════════════════════════════════════════════════ */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Messages — centered article column */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          <div
            className="mx-auto px-8 pb-4 pt-14"
            style={{ maxWidth: "var(--column-max)" }}
          >
            {!selectedThreadId && (
              <div className="py-24 text-center">
                <p
                  className="font-brand text-4xl italic"
                  style={{ color: "var(--fg-faint)" }}
                >
                  Ask anything
                </p>
                <p
                  className="mt-2 font-heading text-sm italic"
                  style={{ color: "var(--fg-faint)" }}
                >
                  Create or select a thread to begin.
                </p>
              </div>
            )}

            {selectedThreadId && uiMessages.results.length === 0 && (
              <div className="py-24 text-center">
                <p
                  className="font-heading text-base italic"
                  style={{ color: "var(--fg-faint)" }}
                >
                  Start by asking a question below.
                </p>
              </div>
            )}

            {uiMessages.results.map((message, idx) => (
              <ArticleMessage key={message.key} message={message} index={idx} />
            ))}
          </div>
        </div>

        {/* Input — pinned to bottom, centered */}
        <div
          className="flex-shrink-0 px-8 py-5"
          style={{
            borderTop: "1px solid var(--border-faint)",
            background: "var(--bg)",
          }}
        >
          <div className="mx-auto" style={{ maxWidth: "var(--column-max)" }}>
            {/* Pending attachments */}
            {pendingAttachments.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-2">
                {pendingAttachments.map((a) => (
                  <div
                    key={a.attachmentId}
                    className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs"
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--bg-alt)",
                      color: "var(--fg-muted)",
                    }}
                  >
                    {a.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.previewUrl}
                        alt={a.filename ?? "img"}
                        className="h-6 w-6 rounded object-cover"
                      />
                    ) : (
                      <IconPaperclip />
                    )}
                    <span className="max-w-36 truncate">
                      {a.filename ?? "file"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingAttachments((prev) => {
                          const item = prev.find(
                            (x) => x.attachmentId === a.attachmentId,
                          );
                          if (item?.previewUrl)
                            URL.revokeObjectURL(item.previewUrl);
                          return prev.filter(
                            (x) => x.attachmentId !== a.attachmentId,
                          );
                        });
                      }}
                      className="rounded p-0.5 transition-opacity hover:opacity-60"
                    >
                      <IconX />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={onSend} className="flex items-end gap-2">
              {/* File upload */}
              <label
                className="flex-shrink-0 cursor-pointer rounded-md p-2.5 transition-colors"
                style={{
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                  background: "var(--bg-alt)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLLabelElement).style.color =
                    "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLLabelElement).style.color =
                    "var(--fg-muted)";
                }}
              >
                <IconPaperclip />
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void uploadFiles(e.target.files);
                      e.currentTarget.value = "";
                    }
                  }}
                />
              </label>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  void onPaste(e);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) {
                      const form = e.currentTarget.closest("form");
                      if (form) form.requestSubmit();
                    }
                  }
                }}
                placeholder="Ask anything… (Shift+Enter for newline)"
                rows={1}
                className="min-h-[42px] max-h-40 flex-1 resize-none rounded-md px-4 py-2.5 font-body text-sm outline-none transition-all"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--fg)",
                  lineHeight: "1.6",
                }}
                onFocus={(e) => {
                  (e.currentTarget as HTMLTextAreaElement).style.borderColor =
                    "var(--accent)";
                  (e.currentTarget as HTMLTextAreaElement).style.boxShadow =
                    "0 0 0 3px var(--accent-dim)";
                }}
                onBlur={(e) => {
                  (e.currentTarget as HTMLTextAreaElement).style.borderColor =
                    "var(--border)";
                  (e.currentTarget as HTMLTextAreaElement).style.boxShadow =
                    "none";
                }}
              />

              {/* Send */}
              <button
                type="submit"
                disabled={!canSend}
                className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-md transition-opacity disabled:opacity-30"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {isComposerBusy ? (
                  <span
                    className="status-loader-ring"
                    style={{
                      borderColor: "rgba(255,255,255,0.35)",
                      borderTopColor: "#fff",
                    }}
                    aria-hidden
                  />
                ) : (
                  <IconArrow />
                )}
              </button>
            </form>

            <p
              className="mt-2 text-center font-heading text-[10px] italic"
              style={{ color: "var(--fg-faint)" }}
            >
              Studi may make mistakes — verify important information
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
