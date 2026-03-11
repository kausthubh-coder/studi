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
    .index("by_threadId", ["threadId"])
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
      language: v.optional(v.string()),
      framework: v.optional(v.string()),
      template: v.optional(v.string()),
      runtimeProfileId: v.optional(v.string()),
      workspacePath: v.optional(v.string()),
      templateKey: v.optional(v.string()),
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

  learningPlans: defineTable({
    userId: v.string(),
    threadId: v.string(),
    phase: v.union(
      v.literal("discovery"),
      v.literal("draft_review"),
      v.literal("active"),
      v.literal("completed"),
    ),
    revision: v.number(),
    title: v.optional(v.string()),
    acceptedPlan: v.optional(v.any()),
    draftPlan: v.optional(v.any()),
    latestChangeRequest: v.optional(v.string()),
    progressPercent: v.number(),
    totalItems: v.number(),
    completedItems: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId_and_threadId", ["userId", "threadId"])
    .index("by_userId_and_updatedAt", ["userId", "updatedAt"]),

  billingProfiles: defineTable({
    userId: v.string(),
    planKey: v.union(
      v.literal("free_onboarding"),
      v.literal("intro"),
      v.literal("pro"),
    ),
    status: v.union(
      v.literal("onboarding"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("inactive"),
    ),
    clerkSubscriptionId: v.optional(v.string()),
    clerkSubscriptionItemId: v.optional(v.string()),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    trialEndsAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  billingUsagePeriods: defineTable({
    userId: v.string(),
    billingPeriod: v.string(),
    textPromptCount: v.number(),
    textAiCostUsd: v.number(),
    voiceSeconds: v.number(),
    voiceEstimatedCostUsd: v.number(),
    labSessionCount: v.number(),
    labActiveSeconds: v.number(),
    labEstimatedCostUsd: v.number(),
    totalEstimatedCostUsd: v.number(),
    lastLabActivityAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_userId_and_billingPeriod", ["userId", "billingPeriod"]),

  billingOnboarding: defineTable({
    userId: v.string(),
    lifetimeFreePromptCount: v.number(),
    lifetimeFreeTextAiCostUsd: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  rawUsage: defineTable({
    userId: v.string(),
    threadId: v.string(),
    agentName: v.optional(v.string()),
    model: v.string(),
    provider: v.string(),
    usage: v.object({
      totalTokens: v.optional(v.number()),
      inputTokens: v.optional(v.number()),
      outputTokens: v.optional(v.number()),
      reasoningTokens: v.optional(v.number()),
      cachedInputTokens: v.optional(v.number()),
      inputTokenDetails: v.optional(v.any()),
      outputTokenDetails: v.optional(v.any()),
      raw: v.optional(v.any()),
    }),
    providerMetadata: v.optional(v.any()),
    billingPeriod: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId_and_threadId_and_createdAt", [
      "userId",
      "threadId",
      "createdAt",
    ])
    .index("by_billingPeriod_and_userId", ["billingPeriod", "userId"]),

  telemetryEvents: defineTable({
    userId: v.string(),
    threadId: v.string(),
    source: v.union(
      v.literal("agent_usage"),
      v.literal("agent_runtime"),
      v.literal("spark"),
      v.literal("lab_tool"),
      v.literal("plan_tool"),
      v.literal("voice"),
    ),
    name: v.string(),
    status: v.union(v.literal("success"), v.literal("failed")),
    durationMs: v.optional(v.number()),
    errorCategory: v.optional(v.string()),
    retriable: v.optional(v.boolean()),
    model: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_userId_and_threadId_and_createdAt", [
      "userId",
      "threadId",
      "createdAt",
    ])
    .index("by_userId_and_source_and_createdAt", [
      "userId",
      "source",
      "createdAt",
    ]),

  waitlistWebhookEvents: defineTable({
    source: v.literal("tally_waitlist"),
    dedupeKey: v.string(),
    eventId: v.optional(v.string()),
    submissionId: v.optional(v.string()),
    formId: v.optional(v.string()),
    emailAddress: v.string(),
    payload: v.any(),
    status: v.union(
      v.literal("queued"),
      v.literal("synced"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    clerkWaitlistEntryId: v.optional(v.string()),
    receivedAt: v.number(),
    lastAttemptAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
  })
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_eventId", ["eventId"])
    .index("by_submissionId", ["submissionId"])
    .index("by_status_and_receivedAt", ["status", "receivedAt"])
    .index("by_emailAddress_and_receivedAt", ["emailAddress", "receivedAt"]),
});
