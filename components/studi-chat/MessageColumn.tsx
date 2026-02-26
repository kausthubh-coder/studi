import type { RefObject } from "react";
import type { UIMessage } from "@convex-dev/agent/react";
import { ArticleMessage } from "@/components/studi-chat/MessageRenderer";
import { PlanDraftCard } from "@/components/studi-chat/PlanDraftCard";
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
  const showDraftCard =
    selectedThreadId &&
    threadPlan &&
    threadPlan.phase === "draft_review" &&
    threadPlan.hasDraft;

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto">
      <div
        className="mx-auto px-8 pt-14"
        style={{ maxWidth: "var(--column-max)" }}
      >
        {selectedThreadId && messages.length === 0 && !threadPlan && (
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
            onExpandSpark={onExpandSpark}
            expandedSparkInstanceId={expandedSparkInstanceId}
          />
        ))}

        {/* Inline draft review card after messages */}
        {showDraftCard ? (
          <PlanDraftCard
            threadId={selectedThreadId}
            threadPlan={threadPlan}
            onPrefillInput={onPrefillPlanInput}
          />
        ) : null}
      </div>

      {/* Extra scroll space so content clears the floating composer */}
      <div style={{ height: showDraftCard ? "16rem" : "9rem" }} />
    </div>
  );
}
