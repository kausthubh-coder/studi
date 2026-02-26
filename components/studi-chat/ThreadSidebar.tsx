import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
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
  return (
    <aside
      className="studi-thread-sidebar flex h-screen flex-shrink-0 flex-col overflow-hidden border-r border-border-warm bg-bg-alt"
      data-mobile-open={isMobileOpen}
      style={{ width: "var(--sidebar-w)" }}
    >
      <div className="flex items-center justify-end px-3 pt-3 lg:hidden">
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-full border border-border-faint p-1.5 text-fg-faint transition hover:text-fg"
          aria-label="Close sidebar"
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* Brand logo */}
      <div className="flex items-center gap-1.5 px-5 pb-3 pt-3 lg:pt-5">
        <p
          className="font-brand text-2xl tracking-wide text-fg"
          style={{ lineHeight: 1 }}
        >
          studi
        </p>
        <span
          className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-accent"
          aria-hidden
        />
      </div>

      {/* New thread pill button */}
      <div className="px-3 pb-3 pt-1">
        <button
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

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto py-1">
        {threads.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p
              className="text-xs italic text-fg-faint"
              style={{ fontFamily: "var(--font-jakarta)" }}
            >
              No threads yet
            </p>
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
                  className="sidebar-thread-btn w-full border-l-[2.5px] border-l-transparent px-4 py-2.5 pr-14 text-left"
                  disabled={isDeleting}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className="truncate text-[13px] font-semibold leading-snug"
                      style={{
                        fontFamily: "var(--font-jakarta)",
                        color: isActive ? "var(--accent)" : "var(--fg)",
                      }}
                    >
                      {thread.title && thread.title !== "New Thread" ? (
                        thread.title
                      ) : (
                        <span
                          className="font-normal italic text-fg-faint"
                          style={{ fontFamily: "var(--font-jakarta)" }}
                        >
                          New thread
                        </span>
                      )}
                    </p>
                    {thread.hasLab ? (
                      <span
                        className="sidebar-thread-lab-tag"
                        data-active-lab={thread.hasActiveLab}
                      >
                        Lab
                      </span>
                    ) : null}
                  </div>
                  {thread.lastMessageAt && (
                    <p
                      className="mt-0.5 text-[11px] text-fg-faint"
                      style={{ fontFamily: "var(--font-jakarta)" }}
                    >
                      {new Date(thread.lastMessageAt).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                        },
                      )}
                    </p>
                  )}
                  {thread.hasPlan && (
                    <div
                      className="sidebar-thread-progress"
                      data-phase={thread.planPhase ?? "active"}
                    >
                      <span
                        style={{
                          width: `${thread.planProgressPercent ?? 0}%`,
                        }}
                      />
                    </div>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteThread(thread);
                  }}
                  disabled={isDeleting}
                  className="sidebar-thread-delete-btn"
                  aria-label={`Delete ${thread.title ?? "thread"}`}
                  title={
                    thread.hasLab ? "Delete thread and lab" : "Delete thread"
                  }
                >
                  <IconX className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom bar: profile + settings */}
      <div className="flex items-center gap-2 border-t border-border-faint px-4 py-3">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-8 h-8",
            },
          }}
        />
        <span
          className="flex-1 truncate text-xs font-semibold text-fg"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          My Account
        </span>
        <Link href="/settings" className="sidebar-settings-link" title="Settings">
          <IconSettings className="h-4 w-4" />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
