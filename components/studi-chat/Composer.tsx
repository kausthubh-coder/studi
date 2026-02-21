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
}) {
  return (
    <div
      className="flex-shrink-0 px-8 py-5"
      style={{
        borderTop: "1px solid var(--border-faint)",
        background: "var(--bg)",
      }}
    >
      <div className="mx-auto" style={{ maxWidth: "var(--column-max)" }}>
        {pendingAttachments.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-2">
            {pendingAttachments.map((attachment) => (
              <div
                key={attachment.attachmentId}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--bg-alt)",
                  color: "var(--fg-muted)",
                }}
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

        <form onSubmit={onSubmit} className="flex items-end gap-2">
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
                  void onUpload(e.target.files);
                  e.currentTarget.value = "";
                }
              }}
            />
          </label>

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
            placeholder="Ask anything... (Shift+Enter for newline)"
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
              (e.currentTarget as HTMLTextAreaElement).style.boxShadow = "none";
            }}
          />

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
          Studi may make mistakes - verify important information
        </p>
      </div>
    </div>
  );
}
