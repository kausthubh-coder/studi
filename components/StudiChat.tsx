"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { useAction, useMutation, useQuery } from "convex/react";
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
  ThreadSummary,
} from "@/components/studi-chat/types";
import { SparkPanel } from "@/components/sparks/SparkPanel";
import { LabWorkspace } from "@/components/labs/LabWorkspace";
import type { SparkArtifact } from "@/lib/sparks/contracts";
import { IconCompose } from "@/components/studi-chat/icons";
import { PanelRightOpen, TerminalSquare } from "lucide-react";

function makeRequestId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function releaseAttachmentPreviewUrls(attachments: PendingAttachment[]) {
  for (const attachment of attachments) {
    if (attachment.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  }
}

function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    error.data &&
    typeof error.data === "object" &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message;
  }

  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong.";
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
  const syncBillingProfile = useAction(
    api.billingActions.syncCurrentUserBillingProfile,
  );
  const billingState = useQuery(api.billing.getViewerBillingState);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [threadDeleteError, setThreadDeleteError] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [expandedSpark, setExpandedSpark] = useState<ExpandedSpark | null>(null);
  const [isLabPanelOpen, setIsLabPanelOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePanelView, setMobilePanelView] = useState<"chat" | "spark">(
    "chat",
  );
  const [sparkChatWidth, setSparkChatWidth] = useState(420);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
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
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchTrackingRef = useRef(false);
  const sparkResizingRef = useRef(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
      if (!event.matches) {
        setIsMobileSidebarOpen(false);
      }
    };

    handleChange(mediaQuery);
    const listener = (event: MediaQueryListEvent) => handleChange(event);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (didBackfillRef.current) return;
    didBackfillRef.current = true;
    void backfillThreadActivity({ limit: 200 }).catch((error) => {
      console.error("Thread activity backfill failed", error);
    });
  }, [backfillThreadActivity]);

  useEffect(() => {
    void syncBillingProfile().catch((error) => {
      console.error("Billing profile sync failed", error);
    });
  }, [syncBillingProfile]);

  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);

  const uiMessages = useUIMessages(
    api.chat.listThreadMessages,
    selectedThreadId ? { threadId: selectedThreadId } : "skip",
    { initialNumItems: 30, stream: true },
  );

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [selectedThreadId, uiMessages.results.length]);

  const currentAgentState = useMemo<AgentUiState>(
    () => deriveAgentUiState(uiMessages.results),
    [uiMessages.results],
  );
  const hasActiveAgentWork = currentAgentState.phase !== "idle";
  const isOnWelcome = selectedThreadId === null;
  const isComposerBusy = isSending || isUploading;

  const canSend =
    !isSending &&
    !isUploading &&
    !hasActiveAgentWork &&
    !billingState?.lockedSurfaces.chat &&
    (input.trim().length > 0 || pendingAttachments.length > 0);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileList = Array.from(files);
      if (fileList.length === 0) return;

      setComposerError(null);
      setIsUploading(true);
      try {
        const uploaded: PendingAttachment[] = [];
        for (const file of fileList) {
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
      } catch (error) {
        console.error("Attachment upload failed", error);
        setComposerError(getErrorMessage(error));
      } finally {
        setIsUploading(false);
      }
    },
    [generateUploadUrl, saveAttachment],
  );

  const onPaste = useCallback(
    async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const images: File[] = [];
      for (const item of Array.from(event.clipboardData.items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) images.push(file);
        }
      }
      if (images.length > 0) {
        event.preventDefault();
        await uploadFiles(images);
      }
    },
    [uploadFiles],
  );

  const onSend = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSend) return;

      const draft = input;
      const prompt = draft.trim() || undefined;
      const attachmentsSnapshot = pendingAttachments;
      const attachmentIds = attachmentsSnapshot.map(
        (attachment) => attachment.attachmentId,
      );

      setComposerError(null);
      setInput("");
      setPendingAttachments([]);
      setIsSending(true);
      try {
        if (isOnWelcome) {
          const { threadId } = await sendFirstMessageAction({
            prompt,
            attachmentIds,
            requestId: makeRequestId(),
          });
          setSelectedThreadId(threadId);
        } else {
          await sendMessageMutation({
            threadId: selectedThreadId!,
            prompt,
            attachmentIds,
            requestId: makeRequestId(),
          });
        }
        releaseAttachmentPreviewUrls(attachmentsSnapshot);
      } catch (error) {
        console.error("Send message failed", error);
        setInput(draft);
        setPendingAttachments(attachmentsSnapshot);
        setComposerError(getErrorMessage(error));
      } finally {
        setIsSending(false);
      }
    },
    [
      canSend,
      input,
      isOnWelcome,
      pendingAttachments,
      selectedThreadId,
      sendFirstMessageAction,
      sendMessageMutation,
    ],
  );

  const removeAttachment = useCallback((attachmentId: Id<"attachments">) => {
    setPendingAttachments((previous) => {
      const removed = previous.find(
        (attachment) => attachment.attachmentId === attachmentId,
      );
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return previous.filter(
        (attachment) => attachment.attachmentId !== attachmentId,
      );
    });
  }, []);

  const handleNewThread = useCallback(() => {
    setThreadDeleteError(null);
    setSelectedThreadId(null);
    setExpandedSpark(null);
    setIsLabPanelOpen(false);
    setMobilePanelView("chat");
    setInput("");
    setPendingAttachments((previous) => {
      releaseAttachmentPreviewUrls(previous);
      return [];
    });
    setTimeout(() => textareaRef.current?.focus(), 50);
    setIsMobileSidebarOpen(false);
  }, []);

  const handleSelectThread = useCallback((id: string | null) => {
    setThreadDeleteError(null);
    setSelectedThreadId(id);
    setExpandedSpark(null);
    setIsLabPanelOpen(false);
    setMobilePanelView("chat");
    setIsMobileSidebarOpen(false);
  }, []);

  const handleSuggestionClick = useCallback((prompt: string) => {
    setInput(prompt);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleDeleteThread = useCallback(
    async (thread: ThreadSummary) => {
      setDeletingThreadId(thread.threadId);
      setThreadDeleteError(null);
      try {
        const result = await deleteThreadAction({ threadId: thread.threadId });
        if (!result.deleted) {
          throw new Error("Thread not found.");
        }
        if (selectedThreadIdRef.current === thread.threadId) {
          handleNewThread();
        }
      } catch (error) {
        console.error("Delete thread failed", error);
        setThreadDeleteError(getErrorMessage(error));
      } finally {
        setDeletingThreadId(null);
      }
    },
    [deleteThreadAction, handleNewThread],
  );

  const handleExpandSpark = useCallback(
    (
      artifact: SparkArtifact,
      threadId: string | null,
      sparkInstanceId: string,
    ) => {
      setExpandedSpark({ artifact, threadId, sparkInstanceId });
      setIsLabPanelOpen(false);
      setMobilePanelView("spark");
    },
    [],
  );

  useEffect(() => {
    if (!expandedSpark) {
      setMobilePanelView("chat");
    }
  }, [expandedSpark]);

  const handleSparkResizeStart = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      sparkResizingRef.current = true;
      const onMove = (moveEvent: MouseEvent) => {
        if (!sparkResizingRef.current) return;
        const nextWidth = Math.min(
          Math.max(moveEvent.clientX, 340),
          window.innerWidth - 420,
        );
        setSparkChatWidth(nextWidth);
      };
      const onUp = () => {
        sparkResizingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [],
  );

  const handleSparkResizeTouchStart = useCallback(
    () => {
      sparkResizingRef.current = true;
      const onMove = (moveEvent: globalThis.TouchEvent) => {
        if (!sparkResizingRef.current) return;
        const touch = moveEvent.touches[0];
        if (!touch) return;
        const nextWidth = Math.min(
          Math.max(touch.clientX, 340),
          window.innerWidth - 420,
        );
        setSparkChatWidth(nextWidth);
      };
      const onEnd = () => {
        sparkResizingRef.current = false;
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onEnd);
      };
      window.addEventListener("touchmove", onMove);
      window.addEventListener("touchend", onEnd);
    },
    [],
  );

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!isMobile) {
        touchStartRef.current = null;
        touchTrackingRef.current = false;
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) return;
      const canOpenFromEdge = !isMobileSidebarOpen && touch.clientX <= 24;
      touchTrackingRef.current = canOpenFromEdge || isMobileSidebarOpen;
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    },
    [isMobile, isMobileSidebarOpen],
  );

  const handleTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || !touchTrackingRef.current) return;
    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
      event.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLDivElement>) => {
      if (!isMobile || !touchStartRef.current || !touchTrackingRef.current) {
        touchStartRef.current = null;
        touchTrackingRef.current = false;
        return;
      }

      const touch = event.changedTouches[0];
      if (touch) {
        const deltaX = touch.clientX - touchStartRef.current.x;
        const deltaY = touch.clientY - touchStartRef.current.y;
        if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < 44) {
          setIsMobileSidebarOpen(deltaX > 0);
        }
      }

      touchStartRef.current = null;
      touchTrackingRef.current = false;
    },
    [isMobile],
  );

  const upgradeBannerReason = billingState?.lockedSurfaces.chat
    ? billingState.upgradeReason ?? null
    : null;
  const billingBanner = composerError ?? upgradeBannerReason;
  const paywallSurface = billingState?.lockedSurfaces.chat ? "chat" : null;

  return (
    <div
      className="flex h-screen overflow-hidden bg-bg"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {isMobile && !isMobileSidebarOpen ? (
        <button
          type="button"
          className="absolute left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-full border border-border-faint bg-bg-alt text-fg shadow-sm lg:hidden"
          onClick={() => setIsMobileSidebarOpen(true)}
          aria-label="Open sidebar"
        >
          <IconCompose className="h-4 w-4" />
        </button>
      ) : null}

      {isMobile && isMobileSidebarOpen ? (
        <button
          type="button"
          className="absolute inset-0 z-20 bg-black/35 lg:hidden"
          aria-label="Close sidebar overlay"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      ) : null}

      <ThreadSidebar
        threads={threads}
        selectedThreadId={selectedThreadId}
        onSelectThread={handleSelectThread}
        onCreateThread={handleNewThread}
        onDeleteThread={(thread) => void handleDeleteThread(thread)}
        deletingThreadId={deletingThreadId}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      <main className="relative flex min-w-0 flex-1 overflow-hidden">
        {threadDeleteError || billingBanner ? (
          <div className="absolute left-1/2 top-3 z-20 w-full max-w-xl -translate-x-1/2 px-4">
            {threadDeleteError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50/95 px-4 py-3 text-sm text-red-900 shadow-sm backdrop-blur">
                {threadDeleteError}
              </div>
            ) : null}
            {billingBanner ? (
              <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 shadow-sm backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <span>{billingBanner}</span>
                  <Link
                    href={`/pricing?entry_point=chat_banner${paywallSurface ? `&surface=${paywallSurface}` : ""}`}
                    className="shrink-0 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
                  >
                    View plans
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isOnWelcome ? (
          <button
            type="button"
            className="lab-toggle-btn"
            onClick={() => {
              setExpandedSpark(null);
              setIsLabPanelOpen((value) => !value);
            }}
            aria-pressed={isLabPanelOpen}
            aria-label={isLabPanelOpen ? "Close lab panel" : "Open lab panel"}
            title={isLabPanelOpen ? "Close lab" : "Open lab"}
          >
            {isLabPanelOpen ? (
              <PanelRightOpen className="h-4 w-4" />
            ) : (
              <TerminalSquare className="h-4 w-4" />
            )}
          </button>
        ) : null}

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
            className={`flex flex-1 overflow-hidden ${
              expandedSpark || isLabPanelOpen ? "flex-col lg:flex-row" : ""
            }`}
          >
            {expandedSpark && isMobile ? (
              <div className="mobile-panel-tabs">
                <button
                  type="button"
                  className={`mobile-panel-tab ${mobilePanelView === "chat" ? "mobile-panel-tab-active" : ""}`}
                  onClick={() => setMobilePanelView("chat")}
                >
                  Chat
                </button>
                <button
                  type="button"
                  className={`mobile-panel-tab ${mobilePanelView === "spark" ? "mobile-panel-tab-active" : ""}`}
                  onClick={() => setMobilePanelView("spark")}
                >
                  Spark
                </button>
              </div>
            ) : null}

            <div
              className={`relative flex min-w-0 flex-col overflow-hidden ${
                expandedSpark
                  ? `spark-chat-column flex-1 lg:flex-none ${isMobile && mobilePanelView !== "chat" ? "hidden" : ""}`
                  : isLabPanelOpen
                    ? "lab-chat-column flex-1 lg:flex-none"
                  : "flex-1"
              }`}
              style={
                expandedSpark
                  ? ({
                      "--spark-chat-width": `${sparkChatWidth}px`,
                    } as React.CSSProperties)
                  : isLabPanelOpen
                    ? ({
                        "--lab-chat-width": `${Math.max(360, sparkChatWidth)}px`,
                      } as React.CSSProperties)
                  : undefined
              }
            >
              <MessageColumn
                listRef={listRef}
                selectedThreadId={selectedThreadId}
                messages={uiMessages.results}
                onExpandSpark={handleExpandSpark}
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
              />
            </div>

            {expandedSpark ? (
              <div
                className={`flex min-w-0 flex-1 ${isMobile && mobilePanelView !== "spark" ? "hidden" : ""}`}
              >
                <div
                  className="spark-resize-handle"
                  onMouseDown={handleSparkResizeStart}
                  onTouchStart={handleSparkResizeTouchStart}
                  title="Drag to resize"
                />
                <SparkPanel
                  spark={expandedSpark}
                  onClose={() => setExpandedSpark(null)}
                />
              </div>
            ) : isLabPanelOpen && selectedThreadId ? (
              <div className="flex min-w-0 flex-1">
                <LabWorkspace threadId={selectedThreadId} />
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
