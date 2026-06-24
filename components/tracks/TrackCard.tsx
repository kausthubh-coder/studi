"use client";

import { Check, Circle, Play, RotateCcw, SkipForward } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  LearningTrack,
  TrackItemStatus,
  TrackPhase,
  TrackProgress,
} from "@/lib/tracks/contracts";

export type ThreadTrackRecord = {
  _id: Id<"learningTracks">;
  phase: TrackPhase;
  revision: number;
  draftTrack?: LearningTrack;
  acceptedTrack?: LearningTrack;
  progress: TrackProgress;
  revisionNote?: string;
};

export function summarizeTrackProgress(track: ThreadTrackRecord): {
  completed: number;
  total: number;
  label: string;
} {
  const activeTrack = track.acceptedTrack ?? track.draftTrack;
  const total =
    activeTrack?.milestones.reduce(
      (sum, milestone) => sum + milestone.items.length,
      0,
    ) ?? 0;
  const completed = track.progress.completedItemIds.length;
  return {
    completed,
    total,
    label: total === 0 ? "No steps" : `${completed}/${total} done`,
  };
}

function phaseLabel(phase: TrackPhase): string {
  if (phase === "draft_review") return "Draft";
  if (phase === "active") return "Active";
  if (phase === "completed") return "Completed";
  return "Discovery";
}

function statusIcon(status: TrackItemStatus) {
  if (status === "completed") return <Check className="h-3.5 w-3.5" />;
  if (status === "skipped") return <SkipForward className="h-3.5 w-3.5" />;
  if (status === "active") return <Play className="h-3.5 w-3.5" />;
  return <Circle className="h-3.5 w-3.5" />;
}

export function TrackCard({
  track,
  isBusy,
  error,
  onAccept,
  onRevise,
  onMarkItem,
}: {
  track: ThreadTrackRecord;
  isBusy?: boolean;
  error?: string | null;
  onAccept?: (trackId: Id<"learningTracks">) => void;
  onRevise?: (track: ThreadTrackRecord) => void;
  onMarkItem?: (
    trackId: Id<"learningTracks">,
    itemId: string,
    status: TrackItemStatus,
  ) => void;
}) {
  const activeTrack = track.acceptedTrack ?? track.draftTrack;
  if (!activeTrack) {
    return null;
  }

  const progress = summarizeTrackProgress(track);
  const canAccept = track.phase === "draft_review" && Boolean(onAccept);
  const canRevise =
    (track.phase === "draft_review" || track.phase === "discovery") &&
    Boolean(onRevise);
  const canUpdateItems =
    (track.phase === "active" || track.phase === "completed") &&
    Boolean(onMarkItem);

  return (
    <section className="track-card not-prose" aria-label="Track">
      <div className="track-card-header">
        <div className="min-w-0">
          <div className="track-card-kicker">
            <span className="track-card-dot" aria-hidden />
            <span>Track</span>
            <span className="track-card-phase">{phaseLabel(track.phase)}</span>
            <span className="track-card-progress">{progress.label}</span>
          </div>
          <h2 className="track-card-title">{activeTrack.title}</h2>
          <p className="track-card-summary">{activeTrack.summary}</p>
        </div>
        <div className="track-card-actions">
          {canRevise ? (
            <button
              type="button"
              className="track-icon-button"
              onClick={() => onRevise?.(track)}
              disabled={isBusy}
              aria-label="Revise Track"
              title="Revise Track"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          ) : null}
          {canAccept ? (
            <button
              type="button"
              className="track-primary-button"
              onClick={() => onAccept?.(track._id)}
              disabled={isBusy}
            >
              <Play className="h-4 w-4" />
              Start
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="track-card-error">{error}</p> : null}

      <div className="track-milestone-list">
        {activeTrack.milestones.map((milestone) => (
          <div key={milestone.id} className="track-milestone">
            <div className="track-milestone-title">{milestone.title}</div>
            <div className="track-item-list">
              {milestone.items.map((item) => (
                <div
                  key={item.id}
                  className="track-item"
                  data-status={item.status}
                >
                  <span className="track-item-icon" aria-hidden>
                    {statusIcon(item.status)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="track-item-title">{item.title}</p>
                    {item.summary ? (
                      <p className="track-item-summary">{item.summary}</p>
                    ) : null}
                  </div>
                  {canUpdateItems ? (
                    <div className="track-item-actions">
                      <button
                        type="button"
                        className="track-icon-button"
                        onClick={() =>
                          onMarkItem?.(track._id, item.id, "active")
                        }
                        disabled={isBusy || item.status === "active"}
                        aria-label={`Make ${item.title} active`}
                        title="Make active"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="track-icon-button"
                        onClick={() =>
                          onMarkItem?.(track._id, item.id, "completed")
                        }
                        disabled={isBusy || item.status === "completed"}
                        aria-label={`Complete ${item.title}`}
                        title="Complete"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

