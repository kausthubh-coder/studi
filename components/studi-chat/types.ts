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
};

export type ExpandedSpark = {
  artifact: SparkArtifact;
  threadId: string | null;
  sparkInstanceId: string;
};

export type ChatAdmissionBlock = {
  reason: "same_thread_active" | "another_thread_active";
  activeThread: {
    threadId: string;
    title?: string;
  };
};
