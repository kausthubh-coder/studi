"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type TouchEvent,
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
import { useVoiceSession } from "@/components/voice/useVoiceSession";
import { VoiceWarningBanner } from "@/components/studi-chat/VoiceWarningBanner";
import { IconCompose } from "@/components/studi-chat/icons";
import type { CreateWarningToolResult } from "@/lib/voice/contracts";

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
  const createThreadAction = useAction(api.chatActions.createThread);
  const deleteThreadAction = useAction(api.chatActions.deleteThread);
  const backfillThreadActivity = useMutation(
    api.chat.backfillThreadActivityForCurrentUser,
  );
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const saveAttachment = useMutation(api.chat.saveAttachment);
  const startPlanMode = useMutation(planMutations.startPlanMode);
  const saveVoiceTranscriptTurn = useMutation(api.chat.saveVoiceTranscriptTurn);
  const saveVoiceToolResultTurn = useMutation(api.chat.saveVoiceToolResultTurn);
  const createRealtimeClientSecret = useAction(
    api.voiceActions.createRealtimeClientSecret,
  );
  const executeRealtimeToolCall = useAction(
    api.voiceActions.executeRealtimeToolCall,
  );
  const recordVoiceUsage = useAction(api.voiceActions.recordVoiceUsage);
  const recordVoiceEvent = useAction(api.voiceActions.recordVoiceEvent);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [threadPendingDelete, setThreadPendingDelete] =
    useState<ThreadSummary | null>(null);
  const [expandedSpark, setExpandedSpark] = useState<ExpandedSpark | null>(
    null,
  );
  const [isPlanExpanded, setIsPlanExpanded] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const didBackfillRef = useRef(false);
  const selectedThreadIdRef = useRef<string | null>(null);
  const voicePersistChainRef = useRef<Promise<void>>(Promise.resolve());
  // Deduplication: useVoiceSession fires onAssistantFinalTranscript twice per
  // response (once from response.output_audio_transcript.done, once from
  // response.done). Track recently saved texts to skip the second call.
  const recentVoiceSavesRef = useRef<Map<string, number>>(new Map());
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchTrackingRef = useRef<boolean>(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      const nextIsMobile = event.matches;
      setIsMobile(nextIsMobile);
      if (!nextIsMobile) {
        setIsMobileSidebarOpen(false);
      }
    };

    handleChange(mediaQuery);
    const listener = (event: MediaQueryListEvent) => handleChange(event);
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, []);

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

  const voiceDisabledReason = useMemo(() => {
    if (selectedThreadId && isLabActive) {
      return "Voice mode is disabled while a lab session is active.";
    }
    if (selectedThreadId && threadPlan) {
      return "Voice mode is disabled for plan and track threads.";
    }
    return null;
  }, [isLabActive, selectedThreadId, threadPlan]);

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

  const sendPlanKickoffMessage = useCallback(
    async (threadId: string, prompt: string) => {
      await sendMessageMutation({
        threadId,
        prompt,
        attachmentIds: [],
        requestId: makeRequestId(),
      });
    },
    [sendMessageMutation],
  );

  const persistVoiceTurn = useCallback(
    async (role: "user" | "assistant", text: string) => {
      const normalized = text.trim();
      if (!normalized) {
        return;
      }

      const targetThreadId = selectedThreadIdRef.current;
      if (!targetThreadId) {
        return;
      }

      // Deduplicate: the hook fires onAssistantFinalTranscript twice for the
      // same response (response.output_audio_transcript.done + response.done).
      // Skip if the exact same role+text was saved within the last 4 seconds.
      const dedupKey = `${role}:${normalized}`;
      const lastSavedAt = recentVoiceSavesRef.current.get(dedupKey);
      if (lastSavedAt !== undefined && Date.now() - lastSavedAt < 4000) {
        return;
      }
      recentVoiceSavesRef.current.set(dedupKey, Date.now());
      // Prune old entries to avoid unbounded growth
      if (recentVoiceSavesRef.current.size > 50) {
        const cutoff = Date.now() - 10000;
        for (const [key, ts] of recentVoiceSavesRef.current) {
          if (ts < cutoff) recentVoiceSavesRef.current.delete(key);
        }
      }

      voicePersistChainRef.current = voicePersistChainRef.current
        .then(async () => {
          await saveVoiceTranscriptTurn({
            threadId: targetThreadId,
            role,
            text: normalized,
          });
        })
        .catch((error) => {
          console.error("Failed to persist voice transcript", error);
        });

      await voicePersistChainRef.current;
    },
    [saveVoiceTranscriptTurn],
  );

  const handleVoiceFinalTranscript = useCallback(
    async (text: string) => {
      await persistVoiceTurn("user", text);
    },
    [persistVoiceTurn],
  );

  const handleVoiceAssistantFinalTranscript = useCallback(
    async (text: string) => {
      await persistVoiceTurn("assistant", text);
    },
    [persistVoiceTurn],
  );

  const voiceSession = useVoiceSession({
    threadId: selectedThreadId ?? "",
    isActive: isVoiceMode && Boolean(selectedThreadId),
    createClientSecret: ({ threadId }) =>
      createRealtimeClientSecret({ threadId }),
    onFinalTranscript: handleVoiceFinalTranscript,
    onAssistantFinalTranscript: handleVoiceAssistantFinalTranscript,
    onToolCall: (args) => {
      const tid = selectedThreadIdRef.current!;
      return executeRealtimeToolCall({
        threadId: tid,
        callId: args.callId,
        toolName: args.toolName,
        argumentsJson: args.argumentsJson,
      }).then(async (result) => {
        try {
          await saveVoiceToolResultTurn({
            threadId: tid,
            callId: result.callId,
            toolName: result.toolName,
            output: result.output,
          });
        } catch (error) {
          console.error("Failed to persist voice tool result", error);
        }
        return result;
      });
    },
    onUsage: (args) =>
      recordVoiceUsage({
        threadId: selectedThreadIdRef.current!,
        usageType: args.usageType,
        model: args.model,
        usage: args.usage,
        providerMetadata: args.providerMetadata,
      }),
    onEvent: (args) =>
      recordVoiceEvent({
        threadId: selectedThreadIdRef.current!,
        name: args.name,
        status: args.status,
        durationMs: args.durationMs,
        metadata: args.metadata,
      }),
  });

  const handleOpenVoiceMode = useCallback(async () => {
    if (isOnWelcome) {
      try {
        const threadId = await createThreadAction({});
        setSelectedThreadId(threadId);
        setIsVoiceMode(true);
      } catch (error) {
        console.error("Failed to create thread for voice mode", error);
      }
      return;
    }

    if (voiceDisabledReason) {
      return;
    }
    setIsVoiceMode(true);
  }, [createThreadAction, isOnWelcome, voiceDisabledReason]);

  const handleCloseVoiceMode = useCallback(() => {
    void voiceSession.stop("manual_hangup");
    setIsVoiceMode(false);
  }, [voiceSession]);

  const handleVoiceSwitchToText = useCallback(
    (warning?: CreateWarningToolResult) => {
      void voiceSession.stop("manual_hangup");
      setIsVoiceMode(false);
      if (warning?.suggestedPrompt && input.trim().length === 0) {
        setInput(warning.suggestedPrompt);
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    },
    [input, textareaRef, voiceSession],
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


  const handleSendPlanAcceptancePrompt = useCallback(async () => {
    if (!selectedThreadId) return;
    try {
      await sendPlanKickoffMessage(
        selectedThreadId,
        "I've accepted the learning plan — let's start with the first milestone!",
      );
    } catch (error) {
      console.error("Failed to send plan acceptance message", error);
    }
  }, [selectedThreadId, sendPlanKickoffMessage]);

  const handleStartTrack = useCallback(async () => {
    if (!selectedThreadId) return;
    setIsSending(true);
    try {
      await startPlanMode({ threadId: selectedThreadId });
      await sendPlanKickoffMessage(
        selectedThreadId,
        "Yes, let's make this a track. Ask me the setup questions one-by-one, then draft a plan we can revise until it's ready.",
      );
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 50);
    } catch (error) {
      console.error("Failed to start track", error);
    } finally {
      setIsSending(false);
    }
  }, [selectedThreadId, sendPlanKickoffMessage, startPlanMode]);

  const handleTogglePlanExpanded = useCallback(() => {
    setIsPlanExpanded((v) => !v);
  }, []);

  const handleNewThread = useCallback(() => {
    setSelectedThreadId(null);
    setExpandedSpark(null);
    setIsPlanExpanded(false);
    setIsVoiceMode(false);
    setInput("");
    setPendingAttachments((prev) => {
      releaseAttachmentPreviewUrls(prev);
      return [];
    });
    setTimeout(() => textareaRef.current?.focus(), 50);
    setIsMobileSidebarOpen(false);
  }, []);

  const handleSelectThread = useCallback((id: string | null) => {
    setSelectedThreadId(id);
    setExpandedSpark(null);
    setIsPlanExpanded(false);
    setIsVoiceMode(false);
    setIsMobileSidebarOpen(false);
  }, []);

  const handleTouchStart = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!isMobile) {
        touchStartRef.current = null;
        touchTrackingRef.current = false;
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) return;
      const startX = touch.clientX;
      const canOpenFromEdge = !isMobileSidebarOpen && startX <= 24;
      const canCloseWhenOpen = isMobileSidebarOpen;
      touchTrackingRef.current = canOpenFromEdge || canCloseWhenOpen;
      touchStartRef.current = { x: startX, y: touch.clientY };
    },
    [isMobile, isMobileSidebarOpen],
  );

  const handleTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current || !touchTrackingRef.current) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
      event.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback(
    (event: TouchEvent<HTMLDivElement>) => {
      if (!isMobile || !touchStartRef.current || !touchTrackingRef.current) {
        touchStartRef.current = null;
        touchTrackingRef.current = false;
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX > 60 && absY < 44) {
        if (deltaX > 0 && !isMobileSidebarOpen) {
          setIsMobileSidebarOpen(true);
        } else if (deltaX < 0 && isMobileSidebarOpen) {
          setIsMobileSidebarOpen(false);
        }
      }

      touchStartRef.current = null;
      touchTrackingRef.current = false;
    },
    [isMobile, isMobileSidebarOpen],
  );

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

  useEffect(() => {
    if (isVoiceMode && voiceDisabledReason) {
      setIsVoiceMode(false);
    }
  }, [isVoiceMode, voiceDisabledReason]);

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
        onDeleteThread={handleDeleteThread}
        deletingThreadId={deletingThreadId}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
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
            onOpenVoiceMode={() => {
              void handleOpenVoiceMode();
            }}
            voiceDisabledReason={voiceDisabledReason}
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
                onSendPlanAcceptancePrompt={handleSendPlanAcceptancePrompt}
                onExpandSpark={
                  isLabActive
                    ? () => {
                        return;
                      }
                    : handleExpandSpark
                }
                expandedSparkInstanceId={expandedSpark?.sparkInstanceId ?? null}
                voiceActive={isVoiceMode}
                liveUserTranscript={voiceSession.liveUserTranscript}
                liveAssistantTranscript={voiceSession.liveAssistantTranscript}
                assistantCurrentWord={voiceSession.assistantCurrentWord}
                isSpeechActive={voiceSession.isSpeechActive}
              />
              {/* Voice warning banner — shown between messages and composer */}
              {isVoiceMode && voiceSession.activeWarning && (
                <div
                  className="mx-auto w-full px-4"
                  style={{ maxWidth: "var(--column-max)" }}
                >
                  <VoiceWarningBanner
                    warning={voiceSession.activeWarning}
                    onDismiss={() => voiceSession.clearWarning()}
                    onSwitchToText={(warning) => {
                      void recordVoiceEvent({
                        threadId: selectedThreadId!,
                        name: "voice_warning_switch_to_text",
                        status: "success",
                        metadata: { reason: warning.reason },
                      });
                      handleVoiceSwitchToText(warning);
                    }}
                  />
                </div>
              )}
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
                showVoiceButton
                onOpenVoiceMode={() => {
                  void handleOpenVoiceMode();
                }}
                voiceDisabledReason={voiceDisabledReason}
                voiceActive={isVoiceMode}
                voiceState={{
                  connectionState: voiceSession.connectionState,
                  isSpeechActive: voiceSession.isSpeechActive,
                  isMuted: voiceSession.isMuted,
                  errorMessage: voiceSession.errorMessage,
                  inputDevices: voiceSession.inputDevices,
                  selectedInputDeviceId: voiceSession.selectedInputDeviceId,
                }}
                onVoiceToggleMute={() => voiceSession.toggleMute()}
                onVoiceSelectInputDevice={(deviceId) =>
                  voiceSession.selectInputDevice(deviceId)
                }
                onVoiceHangUp={handleCloseVoiceMode}
                onVoiceRetry={() => void voiceSession.retry()}
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
