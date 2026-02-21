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
  return (
    <aside
      className="flex h-screen flex-shrink-0 flex-col overflow-hidden"
      style={{
        width: "var(--sidebar-w)",
        borderRight: "1px solid var(--border)",
        background: "var(--bg-alt)",
      }}
    >
      <div className="px-5 pb-3 pt-5">
        <p
          className="font-body text-xl font-semibold tracking-wide"
          style={{ color: "var(--fg)", letterSpacing: "0.06em" }}
        >
          studi
        </p>
      </div>

      <div className="px-4 pb-2 pt-3">
        <button
          type="button"
          onClick={onCreateThread}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
          style={{
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
            background: "transparent",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--bg)";
            (e.currentTarget as HTMLButtonElement).style.color = "var(--fg)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
            (e.currentTarget as HTMLButtonElement).style.color =
              "var(--fg-muted)";
          }}
        >
          <IconCompose />
          <span className="font-heading text-[13px]">New thread</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {threads.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <IconBook
              className="mx-auto mb-2 opacity-30"
              style={{ color: "var(--fg-muted)" }}
            />
            <p
              className="font-heading text-xs italic"
              style={{ color: "var(--fg-faint)" }}
            >
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
                className="w-full px-4 py-2.5 text-left transition-colors"
                style={{
                  background: isActive ? "var(--accent-dim)" : "transparent",
                  borderLeft: isActive
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(0,0,0,0.04)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "transparent";
                  }
                }}
              >
                <p
                  className="truncate font-heading text-[13px] font-medium leading-snug"
                  style={{ color: isActive ? "var(--accent)" : "var(--fg)" }}
                >
                  {thread.title && thread.title !== "New Thread" ? (
                    thread.title
                  ) : (
                    <span
                      className="italic"
                      style={{ color: "var(--fg-faint)" }}
                    >
                      New thread
                    </span>
                  )}
                </p>
                {thread.lastMessageAt && (
                  <p
                    className="mt-0.5 text-[11px]"
                    style={{ color: "var(--fg-faint)" }}
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
              </button>
            );
          })
        )}
      </div>

      <div
        className="flex items-center gap-2.5 px-4 py-4"
        style={{ borderTop: "1px solid var(--border-faint)" }}
      >
        <UserButton
          appearance={{
            elements: {
              avatarBox: "w-7 h-7",
            },
          }}
        />
        <span
          className="font-heading text-xs"
          style={{ color: "var(--fg-faint)" }}
        >
          Account
        </span>
      </div>
    </aside>
  );
}
