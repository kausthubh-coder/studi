import type { FunctionReference } from "convex/server";
import { api } from "@/convex/_generated/api";
import type {
  LearningPlanDocument,
  LearningPlanItem,
  LearningPlanNode,
} from "@/components/studi-chat/types";

export const plansApi = (
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

export function normalizePlanDocument(
  value: unknown,
): LearningPlanDocument | null {
  if (!isRecord(value)) {
    return null;
  }

  const title =
    typeof value.title === "string" ? value.title : "Learning Plan";
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
