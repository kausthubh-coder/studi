"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import type { FunctionReference } from "convex/server";
import { useAction, useMutation, useQuery } from "convex/react";
import { plansApi as planMutations } from "@/components/studi-chat/plan-utils";
import { useUIMessages } from "@convex-dev/agent/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Composer } from "@/components/studi-chat/Composer";
import { MessageColumn } from "@/components/studi-chat/MessageColumn";
import {
  deriveAgentUiState,
  type AgentUiState,
} from "@/components/studi-chat/MessageRenderer";
import { ThreadSidebar } from "@/components/studi-chat/ThreadSidebar";
import { WelcomeView } from "@/components/studi-chat/WelcomeView";
import type {
  ExpandedSpark,
  PendingAttachment,
  ThreadPlan,
  ThreadSummary,
} from "@/components/studi-chat/types";
import { SparkPanel } from "@/components/sparks/SparkPanel";
import type { SparkArtifact } from "@/lib/sparks/contracts";
import { LabWorkspace } from "@/components/lab/LabWorkspace";

const plansApi = (
  api as unknown as {
    plans: {
      getThreadPlan: FunctionReference<"query", "public">;
    };
  }
).plans;

function makeRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function releaseAttachmentPreviewUrls(attachments: PendingAttachment[]) {
  for (const attachment of attachments) {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }
}

export default function StudiChat() {
  const threadsQuery = useQuery(api.chat.listThreads);
  const threads = useMemo(
    () => (threadsQuery ?? []) as ThreadSummary[],
    [threadsQuery],
  );
  const sendMessageMutation = useMutation(api.chat.sendMessage);
  const sendFirstMessageAction = useAction(api.chatActions.sendFirstMessage);
  const deleteThreadAction = useAction(api.chatActions.deleteThread);
  const backfillThreadActivity = useMutation(
    api.chat.backfillThreadActivityForCurrentUser,
  );
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const saveAttachment = useMutation(api.chat.saveAttachment);
  const startPlanMode = useMutation(planMutations.startPlanMode);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [threadPendingDelete, setThreadPendingDelete] =
    useState<ThreadSummary | null>(null);
  const [expandedSpark, setExpandedSpark] = useState<ExpandedSpark | null>(
    null,
  );
  const [isPlanExpanded, setIsPlanExpanded] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const didBackfillRef = useRef(false);
  const selectedThreadIdRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (didBackfillRef.current) {
      return;
    }
    didBackfillRef.current = true;
    void backfillThreadActivity({ limit: 200 }).catch((error) => {
      console.error("Thread activity backfill failed", error);
    });
  }, [backfillThreadActivity]);

  // Don't auto-select first thread — start on welcome view
  // User can click a thread in the sidebar to open it

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [selectedThreadId]);

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
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

  const currentAgentState = useMemo<AgentUiState>(
    () => deriveAgentUiState(uiMessages.results),
    [uiMessages.results],
  );
  const hasActiveAgentWork = currentAgentState.phase !== "idle";
  const isComposerBusy = isSending || isUploading;

  const activeLabSession = useQuery(
    api.labs.getLabSession,
    selectedThreadId ? { threadId: selectedThreadId } : "skip",
  );
  const isLabActive = Boolean(
    selectedThreadId && activeLabSession && !activeLabSession.archivedAt,
  );

  const isOnWelcome = selectedThreadId === null;

  const threadPlanQuery = useQuery(
    plansApi.getThreadPlan,
    selectedThreadId ? { threadId: selectedThreadId } : "skip",
  );
  const threadPlan = threadPlanQuery as ThreadPlan | null | undefined;

  const canSend = useMemo(
    () =>
      !isSending &&
      !isUploading &&
      !hasActiveAgentWork &&
      (input.trim().length > 0 || pendingAttachments.length > 0),
    [
      input,
      hasActiveAgentWork,
      isSending,
      isUploading,
      pendingAttachments.length,
    ],
  );

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (!arr.length) return;
      setIsUploading(true);
      try {
        const uploaded: PendingAttachment[] = [];
        for (const file of arr) {
          const postUrl = await generateUploadUrl({});
          const res = await fetch(postUrl, {
            method: "POST",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
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
        setPendingAttachments((previous) => [...previous, ...uploaded]);
      } finally {
        setIsUploading(false);
      }
    },
    [generateUploadUrl, saveAttachment],
  );

  const onPaste = useCallback(
    async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const images: File[] = [];
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) images.push(file);
        }
      }
      if (images.length > 0) {
        e.preventDefault();
        await uploadFiles(images);
      }
    },
    [uploadFiles],
  );

  const onSend = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSend) return;

      const draft = input;
      const prompt = draft.trim() || undefined;
      const attachmentsSnapshot = pendingAttachments;
      const attachmentIds = attachmentsSnapshot.map((a) => a.attachmentId);

      setInput("");
      setPendingAttachments([]);
      setIsSending(true);
      try {
        if (isOnWelcome) {
          // Lazy thread creation: create thread + send first message atomically
          const { threadId } = await sendFirstMessageAction({
            prompt,
            attachmentIds,
            requestId: makeRequestId(),
          });
          releaseAttachmentPreviewUrls(attachmentsSnapshot);
          setSelectedThreadId(threadId);
        } else {
          await sendMessageMutation({
            threadId: selectedThreadId!,
            prompt,
            attachmentIds,
            requestId: makeRequestId(),
          });
          releaseAttachmentPreviewUrls(attachmentsSnapshot);
        }
      } catch (error) {
        setInput(draft);
        setPendingAttachments(attachmentsSnapshot);
        console.error("Failed to send message", error);
      } finally {
        setIsSending(false);
      }
    },
    [
      canSend,
      input,
      pendingAttachments,
      isOnWelcome,
      selectedThreadId,
      sendFirstMessageAction,
      sendMessageMutation,
    ],
  );

  const removeAttachment = useCallback((attachmentId: Id<"attachments">) => {
    setPendingAttachments((previous) => {
      const item = previous.find(
        (entry) => entry.attachmentId === attachmentId,
      );
      if (item?.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
      }
      return previous.filter((entry) => entry.attachmentId !== attachmentId);
    });
  }, []);

  const handleSuggestionClick = useCallback((prompt: string) => {
    setInput(prompt);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handlePrefillPlanInput = useCallback((value: string) => {
    setInput(value);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleStartTrack = useCallback(async () => {
    if (!selectedThreadId) return;
    await startPlanMode({ threadId: selectedThreadId });
    setInput(
      [
        "Yes, let's make this a track.",
        "My goal:",
        "Current level:",
        "Timeline:",
        "Time per week:",
      ].join("\n"),
    );
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [selectedThreadId, startPlanMode]);

  const handleTogglePlanExpanded = useCallback(() => {
    setIsPlanExpanded((v) => !v);
  }, []);

  const handleNewThread = useCallback(() => {
    setSelectedThreadId(null);
    setExpandedSpark(null);
    setIsPlanExpanded(false);
    setInput("");
    setPendingAttachments((prev) => {
      releaseAttachmentPreviewUrls(prev);
      return [];
    });
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleSelectThread = useCallback((id: string | null) => {
    setSelectedThreadId(id);
    setExpandedSpark(null);
    setIsPlanExpanded(false);
  }, []);

  const performThreadDelete = useCallback(
    async (thread: ThreadSummary) => {
      setDeletingThreadId(thread.threadId);
      try {
        const result = await deleteThreadAction({ threadId: thread.threadId });
        if (result.labCleanupWarning) {
          console.warn("Lab sandbox cleanup warning", result.labCleanupWarning);
        }

        window.localStorage.removeItem(
          `studi.lab.workspace.${thread.threadId}`,
        );

        if (selectedThreadIdRef.current === thread.threadId) {
          setSelectedThreadId(null);
          setInput("");
          setPendingAttachments((prev) => {
            releaseAttachmentPreviewUrls(prev);
            return [];
          });
        }

        setExpandedSpark((current) => {
          if (!current || current.threadId !== thread.threadId) {
            return current;
          }
          return null;
        });
      } catch (error) {
        console.error("Failed to delete thread", error);
      } finally {
        setDeletingThreadId(null);
      }
    },
    [deleteThreadAction],
  );

  const handleDeleteThread = useCallback(
    (thread: ThreadSummary) => {
      if (thread.hasLab) {
        setThreadPendingDelete(thread);
        return;
      }
      void performThreadDelete(thread);
    },
    [performThreadDelete],
  );

  const handleConfirmThreadDelete = useCallback(() => {
    if (!threadPendingDelete) {
      return;
    }

    void performThreadDelete(threadPendingDelete).finally(() => {
      setThreadPendingDelete(null);
    });
  }, [performThreadDelete, threadPendingDelete]);

  useEffect(() => {
    if (!threadPendingDelete) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deletingThreadId) {
        setThreadPendingDelete(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [deletingThreadId, threadPendingDelete]);

  const handleExpandSpark = useCallback(
    (
      artifact: SparkArtifact,
      threadId: string | null,
      sparkInstanceId: string,
    ) => {
      setExpandedSpark({ artifact, threadId, sparkInstanceId });
    },
    [],
  );

  useEffect(() => {
    if (isLabActive && expandedSpark) {
      setExpandedSpark(null);
    }
  }, [expandedSpark, isLabActive]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <ThreadSidebar
        threads={threads}
        selectedThreadId={selectedThreadId}
        onSelectThread={handleSelectThread}
        onCreateThread={handleNewThread}
        onDeleteThread={handleDeleteThread}
        deletingThreadId={deletingThreadId}
      />

      <main className="relative flex min-w-0 flex-1 overflow-hidden">
        {isOnWelcome ? (
          <WelcomeView
            pendingAttachments={pendingAttachments}
            input={input}
            canSend={canSend}
            isComposerBusy={isComposerBusy}
            textareaRef={textareaRef}
            onInputChange={setInput}
            onSubmit={onSend}
            onPaste={onPaste}
            onUpload={uploadFiles}
            onRemoveAttachment={removeAttachment}
            onSuggestionClick={handleSuggestionClick}
          />
        ) : (
          <div
            className={`flex flex-1 overflow-hidden ${isLabActive ? "flex-col lg:flex-row" : ""}`}
          >
            {/* Chat column */}
            <div
              className={`relative flex min-w-0 flex-col overflow-hidden transition-[width] duration-300 ease-out ${
                isLabActive
                  ? "flex-1 lg:w-[44%] lg:max-w-[44%]"
                  : expandedSpark
                    ? "w-[420px] shrink-0"
                    : "flex-1"
              }`}
            >
              <MessageColumn
                listRef={listRef}
                selectedThreadId={selectedThreadId}
                messages={uiMessages.results}
                threadPlan={threadPlan}
                onPrefillPlanInput={handlePrefillPlanInput}
                onExpandSpark={
                  isLabActive
                    ? () => {
                        return;
                      }
                    : handleExpandSpark
                }
                expandedSparkInstanceId={expandedSpark?.sparkInstanceId ?? null}
              />
              <Composer
                pendingAttachments={pendingAttachments}
                input={input}
                canSend={canSend}
                isComposerBusy={isComposerBusy}
                textareaRef={textareaRef}
                onInputChange={setInput}
                onSubmit={onSend}
                onPaste={onPaste}
                onUpload={uploadFiles}
                onRemoveAttachment={removeAttachment}
                showTrackOption={!threadPlan}
                onStartTrack={() => void handleStartTrack()}
                threadId={selectedThreadId}
                threadPlan={threadPlan}
                isPlanExpanded={isPlanExpanded}
                onTogglePlanExpanded={handleTogglePlanExpanded}
                onPrefillPlanInput={handlePrefillPlanInput}
              />
            </div>
            {isLabActive && selectedThreadId ? (
              <LabWorkspace threadId={selectedThreadId} />
            ) : null}
            {/* Spark panel */}
            {!isLabActive && expandedSpark && (
              <SparkPanel
                spark={expandedSpark}
                onClose={() => setExpandedSpark(null)}
              />
            )}
          </div>
        )}
      </main>
      {threadPendingDelete ? (
        <div
          className="thread-delete-modal-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !deletingThreadId) {
              setThreadPendingDelete(null);
            }
          }}
        >
          <div
            className="thread-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="thread-delete-title"
            aria-describedby="thread-delete-description"
          >
            <h2 id="thread-delete-title" className="thread-delete-modal-title">
              Delete thread and lab?
            </h2>
            <p
              id="thread-delete-description"
              className="thread-delete-modal-description"
            >
              This thread has a lab workspace. Deleting it also permanently
              removes the lab session and files.
            </p>
            <div className="thread-delete-modal-actions">
              <button
                type="button"
                className="thread-delete-modal-cancel"
                onClick={() => setThreadPendingDelete(null)}
                disabled={Boolean(deletingThreadId)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="thread-delete-modal-danger"
                onClick={handleConfirmThreadDelete}
                disabled={Boolean(deletingThreadId)}
              >
                {deletingThreadId ? "Deleting..." : "Delete thread"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
