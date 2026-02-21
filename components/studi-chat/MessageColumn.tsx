import type { RefObject } from "react";
import type { UIMessage } from "@convex-dev/agent/react";
import { ArticleMessage } from "@/components/studi-chat/MessageRenderer";

export function MessageColumn({
  listRef,
  selectedThreadId,
  messages,
}: {
  listRef: RefObject<HTMLDivElement | null>;
  selectedThreadId: string | null;
  messages: UIMessage[];
}) {
  return (
    <div ref={listRef} className="flex-1 overflow-y-auto">
      <div
        className="mx-auto px-8 pb-4 pt-14"
        style={{ maxWidth: "var(--column-max)" }}
      >
        {selectedThreadId && messages.length === 0 && (
          <div className="py-24 text-center">
            <p className="font-heading text-base italic text-fg-faint">
              Start by asking a question below.
            </p>
          </div>
        )}

        {messages.map((message, idx) => (
          <ArticleMessage
            key={message.key}
            message={message}
            index={idx}
            threadId={selectedThreadId}
          />
        ))}
      </div>
    </div>
  );
}
