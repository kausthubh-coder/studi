import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconCompose,
  IconSettings,
  IconX,
} from "@/components/studi-chat/icons";
import type { ThreadSummary } from "@/components/studi-chat/types";

export function ThreadSidebar({
  threads,
  selectedThreadId,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  deletingThreadId,
  isMobileOpen = false,
  onCloseMobile,
}: {
  threads: ThreadSummary[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
  onDeleteThread: (thread: ThreadSummary) => void;
  deletingThreadId: string | null;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const [threadPendingDelete, setThreadPendingDelete] =
    useState<ThreadSummary | null>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const newThreadRef = useRef<HTMLButtonElement>(null);

  const closeDeleteDialog = useCallback(() => {
    setThreadPendingDelete(null);
  }, []);

  useEffect(() => {
    if (!threadPendingDelete) {
      deleteTriggerRef.current?.focus();
      return;
    }
    confirmDeleteRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDeleteDialog();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        deleteDialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      if (focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!deleteDialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDeleteDialog, threadPendingDelete]);

  return (
    <>
      <aside
        className="studi-thread-sidebar flex h-screen flex-shrink-0 flex-col overflow-hidden border-r border-border-warm bg-bg-alt"
        data-mobile-open={isMobileOpen}
        inert={threadPendingDelete ? true : undefined}
        style={{ width: "var(--sidebar-w)" }}
      >
        <div className="flex items-center justify-end px-3 pt-3 lg:hidden">
          <button
            type="button"
            onClick={onCloseMobile}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-border-faint text-fg-faint transition hover:text-fg"
            aria-label="Close sidebar"
          >
            <IconX className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5 px-5 pb-3 pt-3 lg:pt-5">
          <p
            className="font-brand text-2xl tracking-wide text-fg"
            style={{ lineHeight: 1 }}
          >
            studi
          </p>
          <span className="mt-0.5 h-2 w-2 rounded-full bg-accent" aria-hidden />
        </div>

        <div className="px-3 pb-3 pt-1">
          <button
            ref={newThreadRef}
            type="button"
            onClick={onCreateThread}
            className="sidebar-new-btn flex w-full items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            style={{
              background: "var(--accent)",
              color: "#fff",
              fontFamily: "var(--font-jakarta)",
            }}
          >
            <IconCompose />
            <span>New thread</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {threads.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <p className="text-xs italic text-fg-faint">No threads yet</p>
            </div>
          ) : (
            threads.map((thread) => {
              const isActive = thread.threadId === selectedThreadId;
              const isDeleting = deletingThreadId === thread.threadId;
              return (
                <div key={thread.threadId} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelectThread(thread.threadId)}
                    data-active={isActive}
                    title={thread.title ?? "New thread"}
                    className="sidebar-thread-btn w-full px-3 py-2.5 pr-12 text-left"
                    disabled={isDeleting}
                  >
                    <p
                      className="line-clamp-2 text-[13px] font-semibold leading-snug"
                      style={{
                        fontFamily: "var(--font-jakarta)",
                        color: isActive ? "var(--accent)" : "var(--fg)",
                      }}
                    >
                      {thread.title && thread.title !== "New Thread" ? (
                        thread.title
                      ) : (
                        <span className="font-normal italic text-fg-faint">
                          New thread
                        </span>
                      )}
                    </p>
                    {thread.lastMessageAt ? (
                      <p className="mt-0.5 text-[11px] text-fg-faint">
                        {new Date(thread.lastMessageAt).toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                          },
                        )}
                      </p>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteTriggerRef.current = event.currentTarget;
                      setThreadPendingDelete(thread);
                    }}
                    disabled={isDeleting}
                    className="sidebar-thread-delete-btn"
                    aria-label={`Delete ${thread.title ?? "thread"}`}
                    title="Delete thread"
                  >
                    <IconX className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-auto border-t border-border-faint px-3 py-3">
          <Link
            href="/settings"
            className="sidebar-settings-link"
            title="Settings"
          >
            <IconSettings className="h-4 w-4" />
            <span>Settings</span>
          </Link>
        </div>
      </aside>

      {threadPendingDelete ? (
        <div
          className="thread-delete-modal-overlay"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeDeleteDialog();
            }
          }}
        >
          <div
            ref={deleteDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="thread-delete-title"
            aria-describedby="thread-delete-description"
            className="thread-delete-modal"
          >
            <h2 id="thread-delete-title" className="thread-delete-modal-title">
              Delete this thread?
            </h2>
            <p
              id="thread-delete-description"
              className="thread-delete-modal-description"
            >
              <strong>{threadPendingDelete.title ?? "New thread"}</strong> and
              its conversation will be removed. This cannot be undone.
            </p>
            <div className="thread-delete-modal-actions">
              <button
                type="button"
                className="thread-delete-modal-cancel"
                onClick={closeDeleteDialog}
              >
                Keep thread
              </button>
              <button
                ref={confirmDeleteRef}
                type="button"
                className="thread-delete-modal-danger"
                onClick={() => {
                  const thread = threadPendingDelete;
                  deleteTriggerRef.current = newThreadRef.current;
                  closeDeleteDialog();
                  onDeleteThread(thread);
                }}
              >
                Delete thread
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
