import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const storedCodeSparkLanguageValidator = v.union(
  v.literal("typescript"),
  v.literal("python"),
  v.literal("c"),
  v.literal("rust"),
  v.literal("mixed"),
);

export default defineSchema({
  userThreads: defineTable({
    userId: v.string(),
    threadId: v.string(),
    title: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
    lastRequestId: v.optional(v.string()),
    lastPromptMessageId: v.optional(v.string()),
    activeGenerations: v.optional(
      v.array(
        v.object({
          promptMessageId: v.string(),
          order: v.number(),
          state: v.union(
            v.literal("queued"),
            v.literal("running"),
            v.literal("cancel_requested"),
          ),
          createdAt: v.number(),
          expiresAt: v.number(),
          cancelRequestedAt: v.optional(v.number()),
        }),
      ),
    ),
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
    totalEstimatedCostUsd: v.number(),
    voiceEstimatedCostUsd: v.optional(v.number()),
    voiceSeconds: v.optional(v.number()),
    voiceSessionCount: v.optional(v.number()),
    lastVoiceActivityAt: v.optional(v.number()),
    labActiveSeconds: v.optional(v.number()),
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
      v.literal("voice"),
      v.literal("lab"),
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

  codeSparkSessions: defineTable({
    userId: v.string(),
    threadId: v.string(),
    messageId: v.optional(v.string()),
    sparkId: v.string(),
    title: v.string(),
    mode: v.union(v.literal("workspace"), v.literal("challenge")),
    language: storedCodeSparkLanguageValidator,
    provider: v.union(
      v.literal("vercel_sandbox"),
      v.literal("daytona"),
      v.literal("e2b"),
      v.literal("local_fake"),
      v.literal("unavailable"),
    ),
    providerStatus: v.union(
      v.literal("configured"),
      v.literal("unconfigured"),
      v.literal("unavailable"),
      v.literal("test_only"),
    ),
    providerSessionId: v.optional(v.string()),
    providerSnapshotId: v.optional(v.string()),
    status: v.union(
      v.literal("creating"),
      v.literal("ready"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("archived"),
      v.literal("unavailable"),
    ),
    activePath: v.string(),
    runCommand: v.string(),
    testCommand: v.string(),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastAccessedAt: v.number(),
    expiresAt: v.optional(v.number()),
  })
    .index("by_userId_and_threadId", ["userId", "threadId"])
    .index("by_userId_threadId_sparkId", ["userId", "threadId", "sparkId"]),

  codeSparkFiles: defineTable({
    sessionId: v.id("codeSparkSessions"),
    path: v.string(),
    language: storedCodeSparkLanguageValidator,
    contents: v.string(),
    version: v.number(),
    hash: v.string(),
    editable: v.boolean(),
    role: v.union(
      v.literal("starter"),
      v.literal("solution"),
      v.literal("test"),
      v.literal("hidden_test"),
      v.literal("config"),
      v.literal("readme"),
    ),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_sessionId_and_path", ["sessionId", "path"]),

  codeSparkChecks: defineTable({
    sessionId: v.id("codeSparkSessions"),
    checkId: v.string(),
    label: v.string(),
    command: v.string(),
    hidden: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_sessionId_and_checkId", ["sessionId", "checkId"]),

  codeSparkRuns: defineTable({
    sessionId: v.id("codeSparkSessions"),
    version: v.number(),
    kind: v.union(
      v.literal("run"),
      v.literal("test"),
      v.literal("preview"),
      v.literal("inspect"),
    ),
    provider: v.union(
      v.literal("vercel_sandbox"),
      v.literal("daytona"),
      v.literal("e2b"),
      v.literal("local_fake"),
      v.literal("unavailable"),
    ),
    command: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("passed"),
      v.literal("failed"),
      v.literal("timed_out"),
      v.literal("unavailable"),
    ),
    stdout: v.optional(v.string()),
    stderr: v.optional(v.string()),
    exitCode: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    timedOut: v.boolean(),
    triggeredBy: v.union(v.literal("user"), v.literal("agent")),
    createdAt: v.number(),
  })
    .index("by_sessionId_and_createdAt", ["sessionId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  codeSparkRunReservations: defineTable({
    userId: v.string(),
    threadId: v.string(),
    sparkId: v.string(),
    sessionId: v.id("codeSparkSessions"),
    status: v.union(
      v.literal("reserved"),
      v.literal("completed"),
      v.literal("released"),
    ),
    createdAt: v.number(),
    expiresAt: v.number(),
    finalizedAt: v.optional(v.number()),
  })
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_userId_status_and_createdAt", [
      "userId",
      "status",
      "createdAt",
    ])
    .index("by_userId_status_expiresAt", ["userId", "status", "expiresAt"])
    .index("by_status_and_expiresAt", ["status", "expiresAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_threadId", ["threadId"])
    .index("by_sessionId", ["sessionId"]),

  // Operational execution telemetry only. It is not a billing ledger and does
  // not grant, price, or authorize Code Spark execution.
  codeSparkUsage: defineTable({
    userId: v.string(),
    threadId: v.string(),
    sparkId: v.string(),
    sessionId: v.id("codeSparkSessions"),
    reservationId: v.id("codeSparkRunReservations"),
    provider: v.union(
      v.literal("vercel_sandbox"),
      v.literal("daytona"),
      v.literal("e2b"),
      v.literal("local_fake"),
      v.literal("unavailable"),
    ),
    status: v.union(
      v.literal("passed"),
      v.literal("failed"),
      v.literal("timed_out"),
      v.literal("unavailable"),
    ),
    durationMs: v.number(),
    timedOut: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_threadId", ["threadId"])
    .index("by_reservationId", ["reservationId"])
    .index("by_userId_and_createdAt", ["userId", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

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
