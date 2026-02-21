import type { ClipboardEvent, FormEvent, RefObject } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { IconArrow, IconPaperclip, IconX } from "@/components/studi-chat/icons";
import type { PendingAttachment } from "@/components/studi-chat/types";

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
  variant = "chat",
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
  variant?: "chat" | "welcome";
}) {
  const isWelcome = variant === "welcome";

  const composerCard = (
    <form onSubmit={onSubmit} className="composer-card">
      {/* Attachment preview row */}
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
              ) : (
                <IconPaperclip />
              )}
              <span className="max-w-36 truncate">
                {attachment.filename ?? "file"}
              </span>
              <button
                type="button"
                onClick={() => onRemoveAttachment(attachment.attachmentId)}
                className="rounded p-0.5 transition-opacity hover:opacity-60"
              >
                <IconX />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Textarea */}
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
          isWelcome
            ? "What would you like to learn?"
            : "Ask a follow-up..."
        }
        rows={isWelcome ? 3 : 1}
        className={isWelcome ? "min-h-[80px]" : "min-h-[42px] max-h-40"}
      />

      {/* Bottom row: file upload left, send button right */}
      <div className="composer-bottom-row">
        <label className="composer-icon-btn" aria-label="Attach file">
          <IconPaperclip />
          <input
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
        </label>

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
    </form>
  );

  if (isWelcome) {
    return composerCard;
  }

  return (
    <div className="flex-shrink-0 border-t border-border-faint bg-bg px-6 py-4">
      <div className="mx-auto" style={{ maxWidth: "var(--column-max)" }}>
        {composerCard}
        <p className="mt-2 text-center font-heading text-[10px] italic text-fg-faint">
          Studi may make mistakes — verify important information
        </p>
      </div>
    </div>
  );
}
