import type { RefObject } from "react";
import type { UIMessage } from "@convex-dev/agent/react";
import { ArticleMessage } from "@/components/studi-chat/MessageRenderer";
import { PlanPanel } from "@/components/studi-chat/PlanPanel";
import type { ThreadPlan } from "@/components/studi-chat/types";
import type { SparkArtifact } from "@/lib/sparks/contracts";

export function MessageColumn({
  listRef,
  selectedThreadId,
  messages,
  threadPlan,
  onPrefillPlanInput,
  onExpandSpark,
  expandedSparkInstanceId,
}: {
  listRef: RefObject<HTMLDivElement | null>;
  selectedThreadId: string | null;
  messages: UIMessage[];
  threadPlan: ThreadPlan | null | undefined;
  onPrefillPlanInput: (value: string) => void;
  onExpandSpark: (
    artifact: SparkArtifact,
    threadId: string | null,
    sparkInstanceId: string,
  ) => void;
  expandedSparkInstanceId: string | null;
}) {
  return (
    <div ref={listRef} className="flex-1 overflow-y-auto">
      <div
        className="mx-auto px-8 pb-36 pt-14"
        style={{ maxWidth: "var(--column-max)" }}
      >
        {selectedThreadId && messages.length === 0 && (
          <div className="py-24 text-center">
            <p className="font-heading text-base italic text-fg-faint">
              Start by asking a question below.
            </p>
          </div>
        )}

        {selectedThreadId ? (
          <PlanPanel
            threadId={selectedThreadId}
            threadPlan={threadPlan}
            onPrefillInput={onPrefillPlanInput}
          />
        ) : null}

        {messages.map((message, idx) => (
          <ArticleMessage
            key={message.key}
            message={message}
            index={idx}
            threadId={selectedThreadId}
            onExpandSpark={onExpandSpark}
            expandedSparkInstanceId={expandedSparkInstanceId}
          />
        ))}
      </div>
    </div>
  );
}
