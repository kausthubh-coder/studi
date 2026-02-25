"use client";

import { useMemo, useState } from "react";
import type { FunctionReference } from "convex/server";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type {
  LearningPlanDocument,
  LearningPlanItem,
  LearningPlanNode,
  ThreadPlan,
} from "@/components/studi-chat/types";

const plansApi = (
  api as unknown as {
    plans: {
      startPlanMode: FunctionReference<"mutation", "public">;
      acceptDraftPlan: FunctionReference<"mutation", "public">;
      requestPlanChanges: FunctionReference<"mutation", "public">;
      setPlanItemStatus: FunctionReference<"mutation", "public">;
    };
  }
).plans;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePlanDocument(value: unknown): LearningPlanDocument | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = typeof value.title === "string" ? value.title : "Learning Plan";
  const goal = typeof value.goal === "string" ? value.goal : "";
  const overview =
    typeof value.overview === "string" ? value.overview : undefined;
  const rawNodes = Array.isArray(value.nodes) ? value.nodes : [];
  const nodes: LearningPlanNode[] = [];

  for (const [nodeIndex, rawNode] of rawNodes.entries()) {
    if (!isRecord(rawNode)) {
      continue;
    }

    const nodeTitle =
      typeof rawNode.title === "string" && rawNode.title.trim().length > 0
        ? rawNode.title
        : `Milestone ${nodeIndex + 1}`;

    const checklistSource = Array.isArray(rawNode.checklist)
      ? rawNode.checklist
      : [];
    const checklist: LearningPlanItem[] = [];

    for (const [itemIndex, rawItem] of checklistSource.entries()) {
      if (!isRecord(rawItem)) {
        continue;
      }

      const text =
        typeof rawItem.text === "string" ? rawItem.text : "Untitled step";
      const status =
        rawItem.status === "done" ||
        rawItem.status === "doing" ||
        rawItem.status === "todo"
          ? rawItem.status
          : "todo";

      checklist.push({
        id:
          typeof rawItem.id === "string" && rawItem.id.trim().length > 0
            ? rawItem.id
            : `n${nodeIndex + 1}-i${itemIndex + 1}`,
        text,
        status,
        note: typeof rawItem.note === "string" ? rawItem.note : undefined,
      });
    }

    if (checklist.length === 0) {
      continue;
    }

    nodes.push({
      id:
        typeof rawNode.id === "string" && rawNode.id.trim().length > 0
          ? rawNode.id
          : `node-${nodeIndex + 1}`,
      title: nodeTitle,
      kind: typeof rawNode.kind === "string" ? rawNode.kind : undefined,
      summary:
        typeof rawNode.summary === "string" ? rawNode.summary : undefined,
      checklist,
    });
  }

  if (nodes.length === 0) {
    return null;
  }

  return {
    title,
    goal,
    overview,
    nodes,
  };
}

export function PlanPanel({
  threadId,
  threadPlan,
  onPrefillInput,
}: {
  threadId: string;
  threadPlan: ThreadPlan | null | undefined;
  onPrefillInput: (value: string) => void;
}) {
  const startPlanMode = useMutation(plansApi.startPlanMode);
  const acceptDraftPlan = useMutation(plansApi.acceptDraftPlan);
  const requestPlanChanges = useMutation(plansApi.requestPlanChanges);
  const setPlanItemStatus = useMutation(plansApi.setPlanItemStatus);

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [changeRequest, setChangeRequest] = useState("");

  const draftPlan = useMemo(
    () => normalizePlanDocument(threadPlan?.draftPlan),
    [threadPlan?.draftPlan],
  );
  const acceptedPlan = useMemo(
    () => normalizePlanDocument(threadPlan?.acceptedPlan),
    [threadPlan?.acceptedPlan],
  );

  if (threadPlan === undefined) {
    return null;
  }

  const beginPlan = async () => {
    setBusyAction("start");
    try {
      await startPlanMode({ threadId });
      onPrefillInput(
        [
          "Yes, let's make this a track.",
          "My goal:",
          "Current level:",
          "Timeline:",
          "Time per week:",
        ].join("\n"),
      );
    } finally {
      setBusyAction(null);
    }
  };

  const acceptDraft = async () => {
    setBusyAction("accept");
    try {
      await acceptDraftPlan({ threadId });
    } finally {
      setBusyAction(null);
    }
  };

  const requestChanges = async () => {
    if (!changeRequest.trim()) {
      return;
    }
    setBusyAction("changes");
    try {
      await requestPlanChanges({ threadId, feedback: changeRequest.trim() });
      onPrefillInput(
        `Please revise the plan with these changes:\n${changeRequest.trim()}`,
      );
      setChangeRequest("");
    } finally {
      setBusyAction(null);
    }
  };

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

  if (!threadPlan) {
    return (
      <section className="plan-panel plan-panel-intake">
        <p className="plan-panel-kicker">Plan Mode</p>
        <h3 className="plan-panel-title">
          Turn this thread into a learning track
        </h3>
        <p className="plan-panel-copy">
          Use plan mode for bigger topics that span multiple sessions. The tutor
          will ask a few questions, draft a plan, and iterate until you accept.
        </p>
        <div className="plan-panel-actions">
          <button
            type="button"
            className="plan-btn plan-btn-primary"
            disabled={busyAction !== null}
            onClick={() => void beginPlan()}
          >
            {busyAction === "start" ? "Starting..." : "Start plan mode"}
          </button>
        </div>
      </section>
    );
  }

  if (threadPlan.phase === "discovery") {
    return (
      <section className="plan-panel plan-panel-discovery">
        <p className="plan-panel-kicker">Plan Interview</p>
        <h3 className="plan-panel-title">Answer a few setup questions</h3>
        <p className="plan-panel-copy">
          The tutor will draft a personalized roadmap after collecting these
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
      </section>
    );
  }

  if (threadPlan.phase === "draft_review" && draftPlan) {
    return (
      <section className="plan-panel plan-panel-review">
        <p className="plan-panel-kicker">Draft Ready</p>
        <h3 className="plan-panel-title">{draftPlan.title}</h3>
        <p className="plan-panel-copy">{draftPlan.goal}</p>
        <div className="plan-milestone-list">
          {draftPlan.nodes.map((node) => (
            <article key={node.id} className="plan-milestone-card">
              <p className="plan-milestone-title">{node.title}</p>
              <p className="plan-milestone-meta">
                {node.checklist.length} checklist items
              </p>
            </article>
          ))}
        </div>
        <div className="plan-panel-actions">
          <button
            type="button"
            className="plan-btn plan-btn-primary"
            disabled={busyAction !== null}
            onClick={() => void acceptDraft()}
          >
            {busyAction === "accept" ? "Accepting..." : "Accept draft"}
          </button>
        </div>
        <div className="plan-change-box">
          <label className="plan-change-label" htmlFor="plan-change-request">
            Request changes
          </label>
          <textarea
            id="plan-change-request"
            className="plan-change-input"
            value={changeRequest}
            onChange={(event) => setChangeRequest(event.target.value)}
            placeholder="Add what to change in this draft..."
          />
          <button
            type="button"
            className="plan-btn"
            disabled={busyAction !== null || !changeRequest.trim()}
            onClick={() => void requestChanges()}
          >
            {busyAction === "changes" ? "Saving..." : "Request revision"}
          </button>
        </div>
      </section>
    );
  }

  if (!acceptedPlan) {
    return null;
  }

  return (
    <section
      className="plan-panel plan-panel-active"
      data-phase={threadPlan.phase}
    >
      <div className="plan-progress-header">
        <p className="plan-panel-kicker">Learning Track</p>
        <p className="plan-progress-text">
          {threadPlan.completedItems}/{threadPlan.totalItems} complete
        </p>
      </div>
      <h3 className="plan-panel-title">{acceptedPlan.title}</h3>
      <div className="plan-progress-bar" aria-hidden>
        <span style={{ width: `${threadPlan.progressPercent}%` }} />
      </div>
      <p className="plan-panel-copy">{threadPlan.progressPercent}% complete</p>
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
                    <span className="plan-item-state">{item.status}</span>
                  )}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
