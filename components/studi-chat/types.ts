import type { Id } from "@/convex/_generated/dataModel";
import type { SparkArtifact } from "@/lib/sparks/contracts";

export type PendingAttachment = {
  attachmentId: Id<"attachments">;
  filename?: string;
  mimeType: string;
  size: number;
  previewUrl?: string;
};

export type ThreadSummary = {
  threadId: string;
  title?: string;
  lastMessageAt?: number;
  hasLab: boolean;
  hasActiveLab: boolean;
  hasPlan: boolean;
  planProgressPercent?: number;
  planPhase?: "discovery" | "draft_review" | "active" | "completed";
};

export type LearningPlanItem = {
  id: string;
  text: string;
  status: "todo" | "doing" | "done";
  note?: string;
};

export type LearningPlanNode = {
  id: string;
  title: string;
  kind?: string;
  summary?: string;
  checklist: LearningPlanItem[];
};

export type LearningPlanDocument = {
  title: string;
  goal: string;
  overview?: string;
  nodes: LearningPlanNode[];
};

export type ThreadPlan = {
  threadId: string;
  phase: "discovery" | "draft_review" | "active" | "completed";
  revision: number;
  title?: string;
  hasDraft: boolean;
  latestChangeRequest?: string;
  progressPercent: number;
  totalItems: number;
  completedItems: number;
  draftPlan?: LearningPlanDocument;
  acceptedPlan?: LearningPlanDocument;
  updatedAt: number;
};

export type ExpandedSpark = {
  artifact: SparkArtifact;
  threadId: string | null;
  sparkInstanceId: string;
};
