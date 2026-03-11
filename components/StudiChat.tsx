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
import posthog from "posthog-js";

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

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Something went wrong.";
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
  const syncBillingProfile = useAction(
    api.billingActions.syncCurrentUserBillingProfile,
  );
  const billingState = useQuery(api.billing.getViewerBillingState);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);
  const [threadDeleteError, setThreadDeleteError] = useState<string | null>(null);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [threadPendingDelete, setThreadPendingDelete] =
    useState<ThreadSummary | null>(null);
  const [expandedSpark, setExpandedSpark] = useState<ExpandedSpark | null>(
    null,
  );
  const [isPlanExpanded, setIsPlanExpanded] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [labChatWidth, setLabChatWidth] = useState(480);
  const labResizingRef = useRef(false);
  const [sparkChatWidth, setSparkChatWidth] = useState(420);
  const sparkResizingRef = useRef(false);
  const [mobileLabView, setMobileLabView] = useState<"chat" | "lab">("chat");
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

  useEffect(() => {
    void syncBillingProfile().catch((error) => {
      console.error("Billing profile sync failed", error);
    });
  }, [syncBillingProfile]);

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
  const isLabActive = Boolean(selectedThreadId && activeLabSession);

  const isOnWelcome = selectedThreadId === null;

  const threadPlanQuery = useQuery(
    plansApi.getThreadPlan,
    selectedThreadId ? { threadId: selectedThreadId } : "skip",
  );
  const threadPlan = threadPlanQuery as ThreadPlan | null | undefined;

  const voiceDisabledReason = useMemo(() => {
    if (billingState?.lockedSurfaces.voice) {
      return (
        billingState.upgradeReason ??
        "Voice tutoring is unavailable on your current plan."
      );
    }
    if (selectedThreadId && isLabActive) {
      return "Voice mode is disabled while a lab session is active.";
    }
    if (selectedThreadId && threadPlan) {
      return "Voice mode is disabled for plan and track threads.";
    }
    return null;
  }, [billingState?.lockedSurfaces.voice, billingState?.upgradeReason, isLabActive, selectedThreadId, threadPlan]);

  const canSend = useMemo(
    () =>
      !isSending &&
      !isUploading &&
      !hasActiveAgentWork &&
      !billingState?.lockedSurfaces.chat &&
      (input.trim().length > 0 || pendingAttachments.length > 0),
    [
      billingState?.lockedSurfaces.chat,
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
      setComposerError(null);
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
        posthog.capture("attachment_uploaded", {
          file_count: uploaded.length,
          mime_types: uploaded.map((a) => a.mimeType),
        });
      } catch (error) {
        posthog.captureException(error);
        setComposerError(getErrorMessage(error));
        console.error("Failed to upload attachment", error);
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
      setComposerError(null);

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
          posthog.capture("thread_created", {
            has_attachments: attachmentIds.length > 0,
            attachment_count: attachmentIds.length,
          });
        } else {
          await sendMessageMutation({
            threadId: selectedThreadId!,
            prompt,
            attachmentIds,
            requestId: makeRequestId(),
          });
          releaseAttachmentPreviewUrls(attachmentsSnapshot);
          posthog.capture("message_sent", {
            thread_id: selectedThreadId,
            has_attachments: attachmentIds.length > 0,
            attachment_count: attachmentIds.length,
          });
        }
      } catch (error) {
        posthog.captureException(error);
        setInput(draft);
        setPendingAttachments(attachmentsSnapshot);
        setComposerError(getErrorMessage(error));
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
    setComposerError(null);
    if (isOnWelcome) {
      try {
        const threadId = await createThreadAction({});
        setSelectedThreadId(threadId);
        setIsVoiceMode(true);
        posthog.capture("voice_mode_opened", { thread_id: threadId, from_welcome: true });
      } catch (error) {
        posthog.captureException(error);
        setComposerError(getErrorMessage(error));
        console.error("Failed to create thread for voice mode", error);
      }
      return;
    }

    if (voiceDisabledReason) {
      setComposerError(voiceDisabledReason);
      return;
    }
    setIsVoiceMode(true);
    posthog.capture("voice_mode_opened", { thread_id: selectedThreadId, from_welcome: false });
  }, [createThreadAction, isOnWelcome, selectedThreadId, voiceDisabledReason]);

  const handleCloseVoiceMode = useCallback(() => {
    void voiceSession.stop("manual_hangup");
    setIsVoiceMode(false);
    posthog.capture("voice_mode_closed", { thread_id: selectedThreadId });
  }, [selectedThreadId, voiceSession]);

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

  const handleLabResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      labResizingRef.current = true;
      const startX = e.clientX;
      const startWidth = labChatWidth;
      const onMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const next = Math.max(320, Math.min(startWidth + delta, window.innerWidth - 400));
        setLabChatWidth(next);
      };
      const onUp = () => {
        labResizingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [labChatWidth],
  );

  const handleLabResizeTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      labResizingRef.current = true;
      const startX = touch.clientX;
      const startWidth = labChatWidth;
      const onMove = (moveEvent: globalThis.TouchEvent) => {
        const t = moveEvent.touches[0];
        if (!t) return;
        const delta = t.clientX - startX;
        const next = Math.max(320, Math.min(startWidth + delta, window.innerWidth - 400));
        setLabChatWidth(next);
      };
      const onEnd = () => {
        labResizingRef.current = false;
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
      };
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
    },
    [labChatWidth],
  );

  const handleSparkResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      sparkResizingRef.current = true;
      const startX = e.clientX;
      const startWidth = sparkChatWidth;
      const onMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        const next = Math.max(320, Math.min(startWidth + delta, window.innerWidth - 400));
        setSparkChatWidth(next);
      };
      const onUp = () => {
        sparkResizingRef.current = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [sparkChatWidth],
  );

  const handleSparkResizeTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      sparkResizingRef.current = true;
      const startX = touch.clientX;
      const startWidth = sparkChatWidth;
      const onMove = (moveEvent: globalThis.TouchEvent) => {
        const t = moveEvent.touches[0];
        if (!t) return;
        const delta = t.clientX - startX;
        const next = Math.max(320, Math.min(startWidth + delta, window.innerWidth - 400));
        setSparkChatWidth(next);
      };
      const onEnd = () => {
        sparkResizingRef.current = false;
        document.removeEventListener("touchmove", onMove);
        document.removeEventListener("touchend", onEnd);
      };
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd);
    },
    [sparkChatWidth],
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
      posthog.capture("plan_accepted", { thread_id: selectedThreadId });
    } catch (error) {
      posthog.captureException(error);
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
        "Yes, let's make this a track. Ask only the minimum questions needed to tailor it, then draft a plan we can revise.",
      );
      setInput("");
      setTimeout(() => textareaRef.current?.focus(), 50);
      posthog.capture("track_started", { thread_id: selectedThreadId });
    } catch (error) {
      posthog.captureException(error);
      console.error("Failed to start track", error);
    } finally {
      setIsSending(false);
    }
  }, [selectedThreadId, sendPlanKickoffMessage, startPlanMode]);

  const handleTogglePlanExpanded = useCallback(() => {
    setIsPlanExpanded((v) => !v);
  }, []);

  const handleNewThread = useCallback(() => {
    setThreadDeleteError(null);
    setSelectedThreadId(null);
    setExpandedSpark(null);
    setIsPlanExpanded(false);
    setIsVoiceMode(false);
    setMobileLabView("chat");
    setInput("");
    setPendingAttachments((prev) => {
      releaseAttachmentPreviewUrls(prev);
      return [];
    });
    setTimeout(() => textareaRef.current?.focus(), 50);
    setIsMobileSidebarOpen(false);
  }, []);

  const handleSelectThread = useCallback((id: string | null) => {
    setThreadDeleteError(null);
    setSelectedThreadId(id);
    setExpandedSpark(null);
    setIsPlanExpanded(false);
    setIsVoiceMode(false);
    setMobileLabView("chat");
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
      setThreadDeleteError(null);
      try {
        const result = await deleteThreadAction({ threadId: thread.threadId });
        if (result.status === "failed") {
          throw new Error(result.summary);
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

        posthog.capture("thread_deleted", {
          thread_id: thread.threadId,
          had_lab: thread.hasLab,
        });
      } catch (error) {
        posthog.captureException(error);
        setThreadDeleteError(
          error instanceof Error
            ? error.message
            : "Failed to delete thread.",
        );
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
      setMobileLabView("lab");
      posthog.capture("spark_expanded", {
        thread_id: threadId,
        spark_instance_id: sparkInstanceId,
        spark_kind: artifact.kind,
        spark_type: artifact.sparkType,
      });
    },
    [],
  );

  useEffect(() => {
    if (isLabActive && expandedSpark) {
      setExpandedSpark(null);
    }
  }, [expandedSpark, isLabActive]);

  useEffect(() => {
    if (!isLabActive) {
      setMobileLabView("chat");
    }
  }, [isLabActive]);

  useEffect(() => {
    if (isVoiceMode && voiceDisabledReason) {
      setIsVoiceMode(false);
    }
  }, [isVoiceMode, voiceDisabledReason]);

  const billingBanner = useMemo(() => {
    if (composerError) {
      return composerError;
    }
    if (billingState?.lockedSurfaces.chat || billingState?.lockedSurfaces.voice) {
      return billingState.upgradeReason ?? null;
    }
    return null;
  }, [
    billingState?.lockedSurfaces.chat,
    billingState?.lockedSurfaces.voice,
    billingState?.upgradeReason,
    composerError,
  ]);

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
                    href="/pricing"
                    className="shrink-0 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
                  >
                    View plans
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
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
            onOpenVoiceMode={() => {
              void handleOpenVoiceMode();
            }}
            voiceDisabledReason={voiceDisabledReason}
          />
        ) : (
          <div
            className={`flex flex-1 overflow-hidden ${
              isLabActive || expandedSpark ? "flex-col lg:flex-row" : ""
            }`}
          >
            {/* Mobile tab bar for lab / spark threads */}
            {(isLabActive || expandedSpark) && isMobile && (
              <div className="mobile-panel-tabs">
                <button
                  type="button"
                  className={`mobile-panel-tab ${mobileLabView === "chat" ? "mobile-panel-tab-active" : ""}`}
                  onClick={() => setMobileLabView("chat")}
                >
                  Chat
                </button>
                <button
                  type="button"
                  className={`mobile-panel-tab ${mobileLabView === "lab" ? "mobile-panel-tab-active" : ""}`}
                  onClick={() => setMobileLabView("lab")}
                >
                  {isLabActive ? "Lab" : "Spark"}
                </button>
              </div>
            )}
            {/* Chat column — side-by-side on desktop, tab-switched on mobile */}
            <div
              className={`relative flex min-w-0 flex-col overflow-hidden ${
                isLabActive
                  ? `lab-chat-column flex-1 lg:flex-none ${isMobile && mobileLabView !== "chat" ? "hidden" : ""}`
                  : expandedSpark
                    ? `spark-chat-column flex-1 lg:flex-none ${isMobile && mobileLabView !== "chat" ? "hidden" : ""}`
                    : "flex-1"
              }`}
              style={
                isLabActive
                  ? ({ "--lab-chat-width": `${labChatWidth}px` } as React.CSSProperties)
                  : expandedSpark
                    ? ({ "--spark-chat-width": `${sparkChatWidth}px` } as React.CSSProperties)
                    : undefined
              }
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
              />
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
            {/* Lab resize handle + workspace */}
            {isLabActive && selectedThreadId ? (
              <div className={`flex min-w-0 flex-1 ${isMobile && mobileLabView !== "lab" ? "hidden" : ""}`}>
                <div
                  className="lab-resize-handle"
                  onMouseDown={handleLabResizeStart}
                  onTouchStart={handleLabResizeTouchStart}
                  title="Drag to resize"
                />
                <LabWorkspace threadId={selectedThreadId} />
              </div>
            ) : null}
            {/* Spark panel — side-by-side on desktop, full view on mobile */}
            {!isLabActive && expandedSpark && (
              <div className={`flex min-w-0 flex-1 ${isMobile && mobileLabView !== "lab" ? "hidden" : ""}`}>
                <div
                  className="spark-resize-handle"
                  onMouseDown={handleSparkResizeStart}
                  onTouchStart={handleSparkResizeTouchStart}
                  title="Drag to resize"
                />
                <SparkPanel
                  spark={expandedSpark}
                  onClose={() => {
                    setExpandedSpark(null);
                    setMobileLabView("chat");
                  }}
                />
              </div>
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
