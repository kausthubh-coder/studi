import type { RefObject } from "react";
import type { UIMessage } from "@convex-dev/agent/react";
import { ArticleMessage } from "@/components/studi-chat/MessageRenderer";
import type { SparkArtifact } from "@/lib/sparks/contracts";

export function MessageColumn({
  listRef,
  selectedThreadId,
  messages,
  onExpandSpark,
  onOpenLab,
  expandedSparkInstanceId,
}: {
  listRef: RefObject<HTMLDivElement | null>;
  selectedThreadId: string | null;
  messages: UIMessage[];
  onExpandSpark: (
    artifact: SparkArtifact,
    threadId: string | null,
    sparkInstanceId: string,
  ) => void;
  onOpenLab?: () => void;
  expandedSparkInstanceId: string | null;
}) {
  return (
    <div ref={listRef} className="flex-1 overflow-y-auto">
      <div
        className="mx-auto px-8 pt-14"
        style={{ maxWidth: "var(--column-max)" }}
      >
        {selectedThreadId && messages.length === 0 ? (
          <div className="py-24 text-center">
            <p className="font-heading text-base italic text-fg-faint">
              Start by asking a question below.
            </p>
          </div>
        ) : null}

        {messages.map((message, index) => (
          <ArticleMessage
            key={message.key}
            message={message}
            index={index}
            threadId={selectedThreadId}
            onExpandSpark={onExpandSpark}
            onOpenLab={onOpenLab}
            expandedSparkInstanceId={expandedSparkInstanceId}
          />
        ))}
      </div>

      <div style={{ height: "9rem" }} />
    </div>
  );
}
