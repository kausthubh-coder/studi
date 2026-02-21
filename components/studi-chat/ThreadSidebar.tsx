import { UserButton } from "@clerk/nextjs";
import { IconBook, IconCompose } from "@/components/studi-chat/icons";
import type { ThreadSummary } from "@/components/studi-chat/types";

export function ThreadSidebar({
  threads,
  selectedThreadId,
  onSelectThread,
  onCreateThread,
}: {
  threads: ThreadSummary[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
}) {
  const isOnWelcome = selectedThreadId === null;

  return (
    <aside className="flex h-screen flex-shrink-0 flex-col overflow-hidden border-r border-border-warm bg-bg-alt" style={{ width: "var(--sidebar-w)" }}>
      <div className="px-5 pb-3 pt-5">
        <p className="font-brand text-xl italic tracking-wide text-fg">
          studi
        </p>
      </div>

      <div className="px-3 pb-2 pt-2">
        <button
          type="button"
          onClick={onCreateThread}
          data-active={isOnWelcome}
          className="sidebar-new-btn flex w-full items-center gap-2 rounded-lg border border-border-warm px-3 py-2 text-sm text-fg-muted"
        >
          <IconCompose />
          <span className="font-heading text-[13px]">New thread</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {threads.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <IconBook className="mx-auto mb-2 text-fg-faint opacity-30" />
            <p className="font-heading text-xs italic text-fg-faint">
              No threads yet
            </p>
          </div>
        ) : (
          threads.map((thread) => {
            const isActive = thread.threadId === selectedThreadId;
            return (
              <button
                key={thread.threadId}
                type="button"
                onClick={() => onSelectThread(thread.threadId)}
                data-active={isActive}
                className="sidebar-thread-btn w-full border-l-[2.5px] border-l-transparent px-4 py-2.5 text-left"
              >
                <p
                  className="truncate font-heading text-[13px] font-medium leading-snug"
                  style={{
                    color: isActive ? "var(--accent)" : "var(--fg)",
                  }}
                >
                  {thread.title && thread.title !== "New Thread" ? (
                    thread.title
                  ) : (
                    <span className="italic text-fg-faint">New thread</span>
                  )}
                </p>
                {thread.lastMessageAt && (
                  <p className="mt-0.5 text-[11px] text-fg-faint">
                    {new Date(thread.lastMessageAt).toLocaleDateString(
                      "en-US",
                      {
                        month: "short",
                        day: "numeric",
                      },
                    )}
                  </p>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2.5 border-t border-border-faint px-4 py-4">
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-7 h-7",
            },
          }}
        />
        <span className="font-heading text-xs text-fg-faint">Account</span>
      </div>
    </aside>
  );
}
