"use client";

import type { ClipboardEvent, FormEvent, RefObject } from "react";
import { useUser } from "@clerk/nextjs";
import type { Id } from "@/convex/_generated/dataModel";
import { Composer } from "@/components/studi-chat/Composer";
import type {
  ChatAdmissionBlock,
  PendingAttachment,
} from "@/components/studi-chat/types";

const chips = [
  {
    emoji: "🧪",
    label: "Explain a concept",
    sub: "Break down any topic simply",
    prompt: "Explain quantum entanglement in simple terms",
    colorClass: "card-teal",
  },
  {
    emoji: "📐",
    label: "Solve a problem",
    sub: "Step-by-step guidance",
    prompt: "Walk me through solving a quadratic equation step by step",
    colorClass: "card-amber",
  },
  {
    emoji: "📝",
    label: "Help me write",
    sub: "Essays, outlines & more",
    prompt: "Help me outline an essay about the Industrial Revolution",
    colorClass: "card-pink",
  },
  {
    emoji: "💡",
    label: "Practice",
    sub: "Questions that build intuition",
    prompt: "Quiz me on calculus basics and explain what I miss",
    colorClass: "card-lavender",
  },
];

export function WelcomeView({
  pendingAttachments,
  input,
  canSend,
  isComposerBusy,
  textareaRef,
  onInputChange,
  onSubmit,
  onPaste,
  onUpload,
  onRemoveAttachment,
  onSuggestionClick,
  admissionBlock,
  onReturnToActiveThread,
  isAdmissionLoading = false,
}: {
  pendingAttachments: PendingAttachment[];
  input: string;
  canSend: boolean;
  isComposerBusy: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => Promise<void>;
  onUpload: (files: FileList) => Promise<void>;
  onRemoveAttachment: (attachmentId: Id<"attachments">) => void;
  onSuggestionClick: (prompt: string) => void;
  admissionBlock?: ChatAdmissionBlock | null;
  onReturnToActiveThread?: (threadId: string) => void;
  isAdmissionLoading?: boolean;
}) {
  const { user } = useUser();
  const firstName = user?.firstName ?? "there";

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
      <div className="w-full" style={{ maxWidth: "var(--column-max)" }}>
        {/* Greeting */}
        <div className="welcome-enter mb-8 text-center">
          <p className="font-brand text-5xl leading-tight tracking-tight sm:text-6xl">
            <span className="text-fg">Hey, </span>
            <span className="italic text-accent">{firstName}</span>
          </p>
          <p
            className="mt-3 text-sm text-fg-faint"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            What would you like to learn today?
          </p>
        </div>

        {/* Composer card */}
        <div className="welcome-enter-delay">
          <Composer
            pendingAttachments={pendingAttachments}
            input={input}
            canSend={canSend}
            isComposerBusy={isComposerBusy}
            textareaRef={textareaRef}
            onInputChange={onInputChange}
            onSubmit={onSubmit}
            onPaste={onPaste}
            onUpload={onUpload}
            onRemoveAttachment={onRemoveAttachment}
            variant="welcome"
            admissionBlock={admissionBlock}
            onReturnToActiveThread={onReturnToActiveThread}
            isAdmissionLoading={isAdmissionLoading}
          />
        </div>

        {/* Colorful suggestion cards */}
        <div className="welcome-enter-delay-2 mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              className={`suggestion-card ${c.colorClass}`}
              onClick={() => onSuggestionClick(c.prompt)}
            >
              <span className="suggestion-card-icon">{c.emoji}</span>
              <span className="suggestion-card-label">{c.label}</span>
              <span className="suggestion-card-sub">{c.sub}</span>
            </button>
          ))}
        </div>

        <p
          className="welcome-enter-delay-2 mt-5 text-center text-[10px] text-fg-faint"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Studi may make mistakes — verify important information
        </p>
      </div>
    </div>
  );
}
