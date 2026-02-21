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
  PendingAttachment,
  ThreadSummary,
} from "@/components/studi-chat/types";

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
  const backfillThreadActivity = useMutation(
    api.chat.backfillThreadActivityForCurrentUser,
  );
  const generateUploadUrl = useMutation(api.chat.generateUploadUrl);
  const saveAttachment = useMutation(api.chat.saveAttachment);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<
    PendingAttachment[]
  >([]);
  const didBackfillRef = useRef(false);
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

  const isOnWelcome = selectedThreadId === null;

  const canSend = useMemo(
    () =>
      !isSending &&
      !isUploading &&
      !hasActiveAgentWork &&
      (input.trim().length > 0 || pendingAttachments.length > 0),
    [input, hasActiveAgentWork, isSending, isUploading, pendingAttachments.length],
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

  const removeAttachment = useCallback(
    (attachmentId: Id<"attachments">) => {
      setPendingAttachments((previous) => {
        const item = previous.find(
          (entry) => entry.attachmentId === attachmentId,
        );
        if (item?.previewUrl) {
          URL.revokeObjectURL(item.previewUrl);
        }
        return previous.filter(
          (entry) => entry.attachmentId !== attachmentId,
        );
      });
    },
    [],
  );

  const handleSuggestionClick = useCallback(
    (prompt: string) => {
      setInput(prompt);
      setTimeout(() => textareaRef.current?.focus(), 50);
    },
    [],
  );

  const handleNewThread = useCallback(() => {
    setSelectedThreadId(null);
    setInput("");
    setPendingAttachments((prev) => {
      releaseAttachmentPreviewUrls(prev);
      return [];
    });
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <ThreadSidebar
        threads={threads}
        selectedThreadId={selectedThreadId}
        onSelectThread={setSelectedThreadId}
        onCreateThread={handleNewThread}
      />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
          <>
            <MessageColumn
              listRef={listRef}
              selectedThreadId={selectedThreadId}
              messages={uiMessages.results}
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
          </>
        )}
      </main>
    </div>
  );
}
