import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  userThreads: defineTable({
    userId: v.string(),
    threadId: v.string(),
    title: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
    lastRequestId: v.optional(v.string()),
    lastPromptMessageId: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_lastMessageAt", ["userId", "lastMessageAt"])
    .index("by_userId_and_threadId", ["userId", "threadId"]),

  attachments: defineTable({
    userId: v.string(),
    storageId: v.id("_storage"),
    filename: v.optional(v.string()),
    mimeType: v.string(),
    size: v.number(),
  }).index("by_userId", ["userId"]),

  sparkInteractions: defineTable({
    userId: v.string(),
    threadId: v.string(),
    sparkInstanceId: v.string(),
    sparkType: v.string(),
    sparkTitle: v.optional(v.string()),
    language: v.optional(v.string()),
    code: v.optional(v.string()),
    runCount: v.number(),
    lastStatus: v.union(
      v.literal("idle"),
      v.literal("success"),
      v.literal("error"),
    ),
    lastStdout: v.optional(v.string()),
    lastStderr: v.optional(v.string()),
    lastError: v.optional(v.string()),
    lastRunAt: v.optional(v.number()),
    lastUpdatedAt: v.number(),
  })
    .index("by_userId_and_threadId_and_lastUpdatedAt", [
      "userId",
      "threadId",
      "lastUpdatedAt",
    ])
    .index("by_userId_and_threadId_and_sparkInstanceId", [
      "userId",
      "threadId",
      "sparkInstanceId",
    ]),

  labSessions: defineTable({
    userId: v.string(),
    threadId: v.string(),
    sandboxId: v.string(),
    metadata: v.object({
      topic: v.optional(v.string()),
      objective: v.optional(v.string()),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastActiveAt: v.number(),
    archivedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  })
    .index("by_userId", ["userId"])
    .index("by_threadId", ["threadId"])
    .index("by_userId_and_threadId", ["userId", "threadId"]),
});
