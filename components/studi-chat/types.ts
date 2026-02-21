import type { Id } from "@/convex/_generated/dataModel";

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
