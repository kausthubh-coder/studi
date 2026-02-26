"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { IconChevronRight } from "@/components/studi-chat/icons";
import { normalizePlanDocument, plansApi } from "@/components/studi-chat/plan-utils";
import type {
  LearningPlanItem,
  ThreadPlan,
} from "@/components/studi-chat/types";

export function PlanProgressBar({
  threadId,
  threadPlan,
  onPrefillInput,
  isExpanded,
  onToggleExpand,
}: {
  threadId: string;
  threadPlan: ThreadPlan;
  onPrefillInput: (value: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const setPlanItemStatus = useMutation(plansApi.setPlanItemStatus);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const acceptedPlan = useMemo(
    () => normalizePlanDocument(threadPlan.acceptedPlan),
    [threadPlan.acceptedPlan],
  );

  const phase = threadPlan.phase;

  // Phase-based display
  let dotPhase: string = phase;
  let label: string;
  let stats: string | null = null;

  if (phase === "discovery") {
    label = "Setting up track...";
    dotPhase = "discovery";
  } else if (phase === "draft_review") {
    label = "Draft ready for review";
    dotPhase = "draft_review";
  } else if (phase === "completed") {
    label = threadPlan.title ?? "Learning Track";
    stats = "Completed";
    dotPhase = "completed";
  } else {
    // active
    label = threadPlan.title ?? "Learning Track";
    stats = `${threadPlan.completedItems}/${threadPlan.totalItems} complete`;
    dotPhase = "active";
  }

  const toggleItem = async (item: LearningPlanItem) => {
    setBusyAction(item.id);
    try {
      await setPlanItemStatus({
        threadId,
        itemId: item.id,
        status: item.status === "done" ? "todo" : "done",
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="plan-bar">
      <button
        type="button"
        className="plan-bar-summary"
        onClick={onToggleExpand}
      >
        <span className="plan-bar-dot" data-phase={dotPhase} />
        <span className="plan-bar-title">{label}</span>
        {stats && <span className="plan-bar-stats">{stats}</span>}
        <span
          className="plan-bar-chevron"
          data-expanded={isExpanded ? "true" : "false"}
        >
          <IconChevronRight />
        </span>
      </button>

      {/* Thin progress bar */}
      {(phase === "active" || phase === "completed") && (
        <div className="plan-bar-progress" aria-hidden>
          <span style={{ width: `${threadPlan.progressPercent}%` }} />
        </div>
      )}

      {/* Expanded detail */}
      <div
        className="plan-bar-detail"
        data-open={isExpanded ? "true" : "false"}
      >
        {isExpanded && phase === "discovery" && (
          <div className="plan-bar-detail-inner">
            <p className="plan-panel-copy">
              The tutor will draft a personalized roadmap after collecting a few
              details.
            </p>
            <div className="plan-question-grid">
              <span className="plan-question-pill">Goal and outcome</span>
              <span className="plan-question-pill">Current skill level</span>
              <span className="plan-question-pill">Timeline</span>
              <span className="plan-question-pill">Weekly time commitment</span>
            </div>
            {threadPlan.latestChangeRequest ? (
              <p className="plan-change-note">
                Last requested change: {threadPlan.latestChangeRequest}
              </p>
            ) : null}
            <div className="plan-panel-actions">
              <button
                type="button"
                className="plan-btn"
                onClick={() =>
                  onPrefillInput(
                    [
                      "Goal:",
                      "Current level:",
                      "Timeline:",
                      "Time per week:",
                      "Anything to include or avoid:",
                    ].join("\n"),
                  )
                }
              >
                Fill answer template
              </button>
            </div>
          </div>
        )}

        {isExpanded &&
          (phase === "active" || phase === "completed") &&
          acceptedPlan && (
            <div className="plan-bar-detail-inner">
              {acceptedPlan.goal && (
                <p className="plan-panel-copy">{acceptedPlan.goal}</p>
              )}
              <div className="plan-node-stack">
                {acceptedPlan.nodes.map((node) => (
                  <article key={node.id} className="plan-node-card">
                    <p className="plan-node-title">{node.title}</p>
                    <div className="plan-item-stack">
                      {node.checklist.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className="plan-item-row"
                          data-status={item.status}
                          disabled={busyAction !== null}
                          onClick={() => void toggleItem(item)}
                        >
                          <span className="plan-item-dot" aria-hidden />
                          <span className="plan-item-text">{item.text}</span>
                          {busyAction === item.id ? (
                            <span className="plan-item-state">...</span>
                          ) : (
                            <span className="plan-item-state">
                              {item.status}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
      </div>
    </section>
  );
}
