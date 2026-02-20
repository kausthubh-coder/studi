import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  userThreads: defineTable({
    userId: v.string(),
    threadId: v.string(),
    title: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_threadId", ["userId", "threadId"]),

  attachments: defineTable({
    userId: v.string(),
    storageId: v.id("_storage"),
    filename: v.optional(v.string()),
    mimeType: v.string(),
    size: v.number(),
  }).index("by_userId", ["userId"]),
});
