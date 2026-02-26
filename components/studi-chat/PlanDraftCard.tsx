"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import {
  normalizePlanDocument,
  plansApi,
} from "@/components/studi-chat/plan-utils";
import type { ThreadPlan } from "@/components/studi-chat/types";

export function PlanDraftCard({
  threadId,
  threadPlan,
  onPrefillInput,
}: {
  threadId: string;
  threadPlan: ThreadPlan;
  onPrefillInput: (prompt: string) => void;
}) {
  const acceptDraftPlan = useMutation(plansApi.acceptDraftPlan);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const draftPlan = useMemo(
    () => normalizePlanDocument(threadPlan.draftPlan),
    [threadPlan.draftPlan],
  );

  if (!draftPlan) return null;

  const totalItems = draftPlan.nodes.reduce(
    (sum, n) => sum + n.checklist.length,
    0,
  );

  const acceptDraft = async () => {
    setBusyAction("accept");
    try {
      await acceptDraftPlan({ threadId });
      onPrefillInput(
        "I've accepted the learning plan — let's start with the first milestone!",
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <section className="plan-draft-card">
      {/* Collapsed summary */}
      <div className="plan-draft-summary">
        <span className="plan-draft-badge">Draft Ready</span>
        <p className="plan-draft-title">{draftPlan.title}</p>
        <p className="plan-draft-meta">
          {draftPlan.nodes.length} milestones, {totalItems} items
        </p>
        <button
          type="button"
          className="plan-btn"
          onClick={() => setIsExpanded((v) => !v)}
        >
          {isExpanded ? "Hide draft" : "View draft"}
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="plan-draft-expanded">
          {draftPlan.goal && (
            <p className="plan-panel-copy">{draftPlan.goal}</p>
          )}
          <div className="plan-draft-milestones">
            {draftPlan.nodes.map((node) => (
              <article key={node.id} className="plan-milestone-card">
                <p className="plan-milestone-title">{node.title}</p>
                <p className="plan-milestone-meta">
                  {node.checklist.length} checklist items
                </p>
              </article>
            ))}
          </div>

          <div className="plan-draft-actions">
            <button
              type="button"
              className="plan-btn plan-btn-primary"
              disabled={busyAction !== null}
              onClick={() => void acceptDraft()}
            >
              {busyAction === "accept" ? "Accepting..." : "Accept draft"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
