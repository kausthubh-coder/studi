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
};

export type ExpandedSpark = {
  artifact: SparkArtifact;
  threadId: string | null;
  sparkInstanceId: string;
};
