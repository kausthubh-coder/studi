import type { RefObject } from "react";
import type { UIMessage } from "@convex-dev/agent/react";
import { ArticleMessage } from "@/components/studi-chat/MessageRenderer";
import type { SparkArtifact } from "@/lib/sparks/contracts";
import { TrackCard, type ThreadTrackRecord } from "@/components/tracks/TrackCard";
import type { Id } from "@/convex/_generated/dataModel";
import type { TrackItemStatus } from "@/lib/tracks/contracts";

export function MessageColumn({
  listRef,
  selectedThreadId,
  messages,
  onExpandSpark,
  expandedSparkInstanceId,
  currentTrack,
  trackBusy,
  trackError,
  onAcceptTrack,
  onReviseTrack,
  onMarkTrackItem,
}: {
  listRef: RefObject<HTMLDivElement | null>;
  selectedThreadId: string | null;
  messages: UIMessage[];
  onExpandSpark: (
    artifact: SparkArtifact,
    threadId: string | null,
    sparkInstanceId: string,
  ) => void;
  expandedSparkInstanceId: string | null;
  currentTrack?: ThreadTrackRecord | null;
  trackBusy?: boolean;
  trackError?: string | null;
  onAcceptTrack?: (trackId: Id<"learningTracks">) => void;
  onReviseTrack?: (track: ThreadTrackRecord) => void;
  onMarkTrackItem?: (
    trackId: Id<"learningTracks">,
    itemId: string,
    status: TrackItemStatus,
  ) => void;
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

        {currentTrack ? (
          <TrackCard
            track={currentTrack}
            isBusy={trackBusy}
            error={trackError}
            onAccept={onAcceptTrack}
            onRevise={onReviseTrack}
            onMarkItem={onMarkTrackItem}
          />
        ) : null}

        {messages.map((message, index) => (
          <ArticleMessage
            key={message.key}
            message={message}
            index={index}
            threadId={selectedThreadId}
            onExpandSpark={onExpandSpark}
            expandedSparkInstanceId={expandedSparkInstanceId}
          />
        ))}
      </div>

      <div style={{ height: "9rem" }} />
    </div>
  );
}
