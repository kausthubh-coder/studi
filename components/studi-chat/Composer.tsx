import { useCallback, useEffect, useRef, useState } from "react";
import type { ClipboardEvent, FormEvent, RefObject } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  IconArrow,
  IconBook,
  IconMic,
  IconPaperclip,
  IconPlus,
  IconX,
} from "@/components/studi-chat/icons";
import { PlanProgressBar } from "@/components/studi-chat/PlanProgressBar";
import { VoiceComposer } from "@/components/studi-chat/VoiceComposer";
import type {
  PendingAttachment,
  ThreadPlan,
} from "@/components/studi-chat/types";
import type { AudioInputDeviceOption } from "@/components/voice/input-device-utils";

type VoiceState = {
  connectionState: "idle" | "connecting" | "connected" | "error";
  isSpeechActive: boolean;
  isMuted: boolean;
  errorMessage: string | null;
  inputDevices: AudioInputDeviceOption[];
  selectedInputDeviceId: string | null;
};

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
  showTrackOption,
  onStartTrack,
  threadId,
  threadPlan,
  isPlanExpanded,
  onTogglePlanExpanded,
  onPrefillPlanInput,
  showVoiceButton,
  onOpenVoiceMode,
  voiceDisabledReason,
  voiceActive = false,
  voiceState,
  onVoiceToggleMute,
  onVoiceSelectInputDevice,
  onVoiceHangUp,
  onVoiceRetry,
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
  showTrackOption?: boolean;
  onStartTrack?: () => void;
  threadId?: string | null;
  threadPlan?: ThreadPlan | null | undefined;
  isPlanExpanded?: boolean;
  onTogglePlanExpanded?: () => void;
  onPrefillPlanInput?: (value: string) => void;
  showVoiceButton?: boolean;
  onOpenVoiceMode?: () => void;
  voiceDisabledReason?: string | null;
  voiceActive?: boolean;
  voiceState?: VoiceState;
  onVoiceToggleMute?: () => void;
  onVoiceSelectInputDevice?: (deviceId: string) => void;
  onVoiceHangUp?: () => void;
  onVoiceRetry?: () => void;
}) {
  const isWelcome = variant === "welcome";

  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const plusBtnRef = useRef<HTMLButtonElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const closePlusMenu = useCallback(() => setPlusMenuOpen(false), []);

  // Close on outside click
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

  // Close on Escape
  useEffect(() => {
    if (!plusMenuOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePlusMenu();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [plusMenuOpen, closePlusMenu]);

  const hasPlanBar = !isWelcome && !!threadId && !!threadPlan;

  const composerCard = (
    <form
      onSubmit={onSubmit}
      className={isWelcome ? "composer-card is-welcome" : "composer-card"}
      data-has-plan={hasPlanBar ? "true" : undefined}
      data-voice-active={voiceActive && !isWelcome ? "true" : undefined}
    >
      {/* Plan progress bar — attached to top of composer */}
      {threadId &&
        threadPlan &&
        onTogglePlanExpanded &&
        onPrefillPlanInput &&
        !isWelcome && (
          <PlanProgressBar
            threadId={threadId}
            threadPlan={threadPlan}
            onPrefillInput={onPrefillPlanInput}
            isExpanded={isPlanExpanded ?? false}
            onToggleExpand={onTogglePlanExpanded}
          />
        )}

      {/* Voice mode body — replaces textarea + bottom row */}
      {voiceActive && !isWelcome && voiceState ? (
        <VoiceComposer
          connectionState={voiceState.connectionState}
          isSpeechActive={voiceState.isSpeechActive}
          isMuted={voiceState.isMuted}
          errorMessage={voiceState.errorMessage}
          inputDevices={voiceState.inputDevices}
          selectedInputDeviceId={voiceState.selectedInputDeviceId}
          onToggleMute={() => onVoiceToggleMute?.()}
          onSelectInputDevice={(deviceId) => onVoiceSelectInputDevice?.(deviceId)}
          onHangUp={() => onVoiceHangUp?.()}
          onRetry={() => onVoiceRetry?.()}
        />
      ) : (
        <>
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
                  ) : null}
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
              isWelcome ? "What would you like to learn?" : "Ask a follow-up..."
            }
            rows={isWelcome ? 3 : 1}
            className={isWelcome ? "min-h-[80px]" : "min-h-[42px] max-h-40"}
          />

          {/* Bottom row: plus menu left, send button right */}
          <div className="composer-bottom-row">
            <div style={{ position: "relative" }}>
              <button
                ref={plusBtnRef}
                type="button"
                className={`composer-plus-btn${plusMenuOpen ? " is-open" : ""}`}
                aria-label="More options"
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
                  {showTrackOption && onStartTrack ? (
                    <button
                      type="button"
                      className="composer-plus-menu-item"
                      onClick={() => {
                        closePlusMenu();
                        onStartTrack();
                      }}
                    >
                      <IconBook />
                      <span>Start track</span>
                    </button>
                  ) : hasPlanBar && onTogglePlanExpanded ? (
                    <button
                      type="button"
                      className="composer-plus-menu-item"
                      onClick={() => {
                        closePlusMenu();
                        onTogglePlanExpanded();
                      }}
                    >
                      <IconBook />
                      <span>{isPlanExpanded ? "Hide track" : "View track"}</span>
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            {/* Hidden file input */}
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

            {showVoiceButton ? (
              <button
                type="button"
                className="composer-icon-btn disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Open voice mode"
                onClick={() => onOpenVoiceMode?.()}
                disabled={Boolean(voiceDisabledReason)}
                title={voiceDisabledReason ?? "Open voice mode"}
              >
                <IconMic />
              </button>
            ) : null}

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
      )}
    </form>
  );

  if (isWelcome) {
    return composerCard;
  }

  return (
    <div className="composer-footer">
      <div className="mx-auto" style={{ maxWidth: "var(--column-max)" }}>
        {composerCard}
        <p className="mt-2 text-center font-heading text-[10px] italic text-fg-faint">
          Studi may make mistakes — verify important information
        </p>
      </div>
    </div>
  );
}
