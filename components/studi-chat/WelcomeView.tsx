"use client";

import type { ClipboardEvent, FormEvent, RefObject } from "react";
import { useUser } from "@clerk/nextjs";
import type { Id } from "@/convex/_generated/dataModel";
import { Composer } from "@/components/studi-chat/Composer";
import type { PendingAttachment } from "@/components/studi-chat/types";

const chips = [
  { emoji: "🧪", label: "Explain a concept", prompt: "Explain quantum entanglement in simple terms" },
  { emoji: "📐", label: "Solve a problem", prompt: "Walk me through solving a quadratic equation step by step" },
  { emoji: "📝", label: "Help me write", prompt: "Help me outline an essay about the Industrial Revolution" },
  { emoji: "💡", label: "Study plan", prompt: "Create a study plan for learning calculus in 4 weeks" },
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
}) {
  const { user } = useUser();
  const firstName = user?.firstName ?? "there";

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full" style={{ maxWidth: "var(--column-max)" }}>
        {/* Greeting */}
        <div className="welcome-enter mb-8 text-center">
          <p className="font-brand text-4xl leading-tight tracking-tight sm:text-5xl">
            <span className="italic text-fg">Hey, </span>
            <span className="italic text-accent">{firstName}</span>
          </p>
          <p className="mt-2 font-heading text-sm text-fg-faint">
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
          />
        </div>

        {/* Chip suggestions */}
        <div className="welcome-enter-delay-2 mt-5 flex flex-wrap items-center justify-center gap-2">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              className="chip"
              onClick={() => onSuggestionClick(c.prompt)}
            >
              <span>{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>

        <p className="welcome-enter-delay-2 mt-6 text-center font-heading text-[10px] italic text-fg-faint">
          Studi may make mistakes — verify important information
        </p>
      </div>
    </div>
  );
}
