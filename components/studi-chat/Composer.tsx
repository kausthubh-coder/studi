import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ClipboardEvent, FormEvent, RefObject } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  IconArrow,
  IconPaperclip,
  IconPlus,
  IconX,
} from "@/components/studi-chat/icons";
import type {
  ChatAdmissionBlock,
  PendingAttachment,
} from "@/components/studi-chat/types";
import type { AgentUiState } from "@/components/studi-chat/MessageRenderer";

export function Composer({
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
  isStoppingGeneration = false,
  stopGenerationError = null,
  onStopGeneration,
  agentPhase = "idle",
  variant = "chat",
  admissionBlock = null,
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
  isStoppingGeneration?: boolean;
  stopGenerationError?: string | null;
  onStopGeneration?: () => void;
  agentPhase?: AgentUiState["phase"];
  variant?: "chat" | "welcome";
  admissionBlock?: ChatAdmissionBlock | null;
  onReturnToActiveThread?: (threadId: string) => void;
  isAdmissionLoading?: boolean;
}) {
  const isWelcome = variant === "welcome";

  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const closePlusMenu = useCallback(() => setPlusMenuOpen(false), []);

  useEffect(() => {
    if (!plusMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        plusMenuRef.current &&
        !plusMenuRef.current.contains(e.target as Node) &&
        plusBtnRef.current &&
        !plusBtnRef.current.contains(e.target as Node)
      ) {
        closePlusMenu();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [plusMenuOpen, closePlusMenu]);

  useEffect(() => {
    if (!plusMenuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePlusMenu();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [plusMenuOpen, closePlusMenu]);

  const composerCard = (
    <form
      onSubmit={onSubmit}
      className={isWelcome ? "composer-card is-welcome" : "composer-card"}
    >
      <>
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {pendingAttachments.map((attachment) => (
              <div
                key={attachment.attachmentId}
                className="flex items-center gap-1.5 rounded-lg border border-border-faint bg-bg-alt px-2.5 py-1 text-xs text-fg-muted"
              >
                {attachment.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.filename ?? "img"}
                    className="h-6 w-6 rounded object-cover"
                  />
                ) : null}
                <span className="max-w-36 truncate">
                  {attachment.filename ?? "file"}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(attachment.attachmentId)}
                  className="rounded p-0.5 transition-opacity hover:opacity-60"
                  aria-label={`Remove ${attachment.filename ?? "file"}`}
                >
                  <IconX />
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
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
          placeholder={
            isWelcome ? "What would you like to learn?" : "Ask a follow-up..."
          }
          rows={isWelcome ? 3 : 1}
          className={isWelcome ? "min-h-[80px]" : "min-h-[42px] max-h-40"}
        />

        <div className="composer-bottom-row">
          <div style={{ position: "relative" }}>
            <button
              ref={plusBtnRef}
              type="button"
              className={`composer-plus-btn${plusMenuOpen ? " is-open" : ""}`}
              aria-label="More options"
              aria-expanded={plusMenuOpen}
              onClick={() => setPlusMenuOpen((v) => !v)}
            >
              <IconPlus />
            </button>

            {plusMenuOpen && (
              <div ref={plusMenuRef} className="composer-plus-menu">
                <button
                  type="button"
                  className="composer-plus-menu-item"
                  onClick={() => {
                    closePlusMenu();
                    fileInputRef.current?.click();
                  }}
                >
                  <IconPaperclip />
                  <span>Upload file</span>
                </button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                void onUpload(e.target.files);
                e.currentTarget.value = "";
              }
            }}
          />

          <button
            type="submit"
            disabled={!canSend}
            className="composer-send-btn"
            aria-label="Send message"
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
        </div>
      </>
    </form>
  );

  const admissionNotice = admissionBlock ? (
    <div
      role="status"
      aria-live="polite"
      className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-amber-950 shadow-sm"
    >
      <span className="min-w-0 text-xs leading-relaxed">
        <strong className="block text-sm">
          {admissionBlock.reason === "same_thread_active"
            ? "Studi is still responding in this lesson."
            : "Finish your active lesson before starting another one."}
        </strong>
        {admissionBlock.reason === "same_thread_active"
          ? "Wait for it to finish or stop the response above."
          : "Your current plan includes one active lesson at a time. Pro can run lessons concurrently."}
      </span>
      {admissionBlock.reason === "another_thread_active" ? (
        <span className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {onReturnToActiveThread ? (
            <button
              type="button"
              onClick={() =>
                onReturnToActiveThread(admissionBlock.activeThread.threadId)
              }
              className="min-h-11 shrink-0 rounded-full border border-amber-300 bg-white/70 px-4 text-xs font-semibold text-amber-950 transition hover:bg-white"
              aria-label={`Return to ${admissionBlock.activeThread.title ?? "active lesson"}`}
            >
              Return
            </button>
          ) : null}
          <Link
            href="/pricing?entry_point=chat_concurrency&plan=pro"
            className="flex min-h-11 items-center rounded-full border border-amber-300 bg-amber-100/80 px-4 text-xs font-semibold text-amber-950 transition hover:bg-amber-100"
          >
            View Pro
          </Link>
        </span>
      ) : null}
    </div>
  ) : null;

  const admissionLoadingNotice = isAdmissionLoading ? (
    <div
      role="status"
      aria-live="polite"
      className="mb-2 flex items-center gap-2 rounded-2xl border border-border-faint bg-bg-alt px-4 py-3 text-xs text-fg-muted"
    >
      <span className="status-loader-ring shrink-0" aria-hidden />
      Checking lesson availability…
    </div>
  ) : null;

  if (isWelcome) {
    return (
      <>
        {admissionNotice}
        {admissionLoadingNotice}
        {composerCard}
      </>
    );
  }

  const progressLabel =
    agentPhase === "spark"
      ? "Studi is building your interactive Spark. This can take about a minute."
      : agentPhase === "tool"
        ? "Studi is preparing the next learning step."
        : "Studi is working on your next step.";

  return (
    <div className="composer-footer" data-testid="chat-composer">
      {agentPhase !== "idle" ? (
        <div
          role="status"
          aria-live="polite"
          className="agent-progress-notice mx-auto mb-2 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-amber-950 shadow-sm"
          style={{ maxWidth: "var(--column-max)" }}
        >
          <span className="status-loader-ring mt-0.5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 text-xs leading-relaxed">
            <strong className="block text-sm">{progressLabel}</strong>
            New responses and build progress will stay visible above the
            composer.
            {stopGenerationError ? (
              <span
                role="alert"
                className="mt-1 block font-semibold text-red-700"
              >
                {stopGenerationError}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            aria-label="Stop response generation"
            disabled={isStoppingGeneration}
            onClick={onStopGeneration}
            className="min-h-11 shrink-0 rounded-full border border-amber-300 bg-white/70 px-4 text-xs font-semibold text-amber-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-60"
          >
            {isStoppingGeneration ? "Stopping…" : "Stop"}
          </button>
        </div>
      ) : null}
      <div className="mx-auto" style={{ maxWidth: "var(--column-max)" }}>
        {agentPhase === "idle" ? admissionNotice : null}
        {agentPhase === "idle" ? admissionLoadingNotice : null}
        {composerCard}
        <p className="mt-2 text-center font-heading text-[10px] italic text-fg-faint">
          Studi may make mistakes — verify important information
        </p>
      </div>
    </div>
  );
}
