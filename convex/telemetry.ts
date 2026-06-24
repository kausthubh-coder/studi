import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { sanitizeTelemetryValue } from "../lib/observability/contracts";

const THREAD_PLACEHOLDER = "__none__";

function normalizeThreadId(threadId: string | undefined): string {
  const trimmed = threadId?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : THREAD_PLACEHOLDER;
}

function getBillingPeriod(at: number): string {
  const now = new Date(at);
  const start = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return start.toISOString().split("T")[0];
}

const usageValidator = v.object({
  totalTokens: v.optional(v.number()),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  cachedInputTokens: v.optional(v.number()),
  inputTokenDetails: v.optional(v.any()),
  outputTokenDetails: v.optional(v.any()),
  raw: v.optional(v.any()),
});

const telemetrySourceValidator = v.union(
  v.literal("agent_usage"),
  v.literal("agent_runtime"),
  v.literal("spark"),
  v.literal("lab"),
  v.literal("voice"),
  v.literal("track"),
  v.literal("quota"),
);

const telemetryStatusValidator = v.union(
  v.literal("success"),
  v.literal("failed"),
);

const summaryReturnsValidator = v.object({
  usage: v.object({
    calls: v.number(),
    totalTokens: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
  }),
  telemetry: v.object({
    events: v.number(),
    failures: v.number(),
    sparkFailures: v.number(),
    runtimeFailures: v.number(),
    lastFailureAt: v.optional(v.number()),
  }),
});

const monthlyUsageSummaryReturnsValidator = v.object({
  billingPeriod: v.string(),
  totals: v.object({
    calls: v.number(),
    totalTokens: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    reasoningTokens: v.number(),
    cachedInputTokens: v.number(),
    estimatedCostUsd: v.number(),
    avgTokensPerCall: v.number(),
  }),
  modelBreakdown: v.array(
    v.object({
      model: v.string(),
      provider: v.string(),
      calls: v.number(),
      totalTokens: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      estimatedCostUsd: v.number(),
    }),
  ),
  threadBreakdown: v.array(
    v.object({
      threadId: v.string(),
      threadTitle: v.string(),
      calls: v.number(),
      totalTokens: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
    }),
  ),
  lastCallAt: v.optional(v.number()),
});

const threadUsageBreakdownReturnsValidator = v.object({
  totals: v.object({
    calls: v.number(),
    totalTokens: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    reasoningTokens: v.number(),
    cachedInputTokens: v.number(),
    estimatedCostUsd: v.number(),
  }),
  byModel: v.array(
    v.object({
      model: v.string(),
      provider: v.string(),
      calls: v.number(),
      totalTokens: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      reasoningTokens: v.number(),
      cachedInputTokens: v.number(),
      estimatedCostUsd: v.number(),
      lastCallAt: v.optional(v.number()),
    }),
  ),
  byAgent: v.array(
    v.object({
      agentName: v.string(),
      calls: v.number(),
      totalTokens: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      reasoningTokens: v.number(),
      cachedInputTokens: v.number(),
      estimatedCostUsd: v.number(),
      lastCallAt: v.optional(v.number()),
    }),
  ),
});

const telemetryEventSummaryValidator = v.object({
  _id: v.id("telemetryEvents"),
  _creationTime: v.number(),
  threadId: v.string(),
  source: telemetrySourceValidator,
  name: v.string(),
  status: telemetryStatusValidator,
  durationMs: v.optional(v.number()),
  errorCategory: v.optional(v.string()),
  retriable: v.optional(v.boolean()),
  model: v.optional(v.string()),
  metadata: v.optional(v.any()),
  createdAt: v.number(),
});

function readNumericCandidate(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function extractEstimatedCostUsd(providerMetadata: unknown): number {
  if (!providerMetadata || typeof providerMetadata !== "object") {
    return 0;
  }

  const stack: Record<string, unknown>[] = [
    providerMetadata as Record<string, unknown>,
  ];
  const seen = new Set<Record<string, unknown>>();
  const keys = [
    "totalCostUsd",
    "total_cost_usd",
    "totalCost",
    "total_cost",
    "costUsd",
    "cost_usd",
    "cost",
  ];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || seen.has(node)) {
      continue;
    }
    seen.add(node);

    for (const key of keys) {
      const found = readNumericCandidate(node, key);
      if (found !== undefined) {
        return found;
      }
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        stack.push(value as Record<string, unknown>);
      }
    }
  }

  return 0;
}

async function buildThreadObservabilitySummary(
  ctx: QueryCtx,
  args: { userId: string; threadId: string; requireThreadRecord?: boolean },
) {
  const ownerUserId = await resolveThreadOwnerUserId(ctx, args);

  const usageRows = await ctx.db
    .query("rawUsage")
    .withIndex("by_userId_and_threadId_and_createdAt", (q) =>
      q.eq("userId", ownerUserId).eq("threadId", args.threadId),
    )
    .collect();

  const telemetryRows = await ctx.db
    .query("telemetryEvents")
    .withIndex("by_userId_and_threadId_and_createdAt", (q) =>
      q.eq("userId", ownerUserId).eq("threadId", args.threadId),
    )
    .collect();

  const usageSummary = usageRows.reduce(
    (acc, row) => {
      acc.calls += 1;
      acc.totalTokens += row.usage.totalTokens ?? 0;
      acc.inputTokens += row.usage.inputTokens ?? 0;
      acc.outputTokens += row.usage.outputTokens ?? 0;
      return acc;
    },
    {
      calls: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
  );

  let lastFailureAt: number | undefined;
  let sparkFailures = 0;
  let runtimeFailures = 0;
  let failures = 0;

  for (const row of telemetryRows) {
    if (row.status !== "failed") {
      continue;
    }
    failures += 1;
    if (!lastFailureAt || row.createdAt > lastFailureAt) {
      lastFailureAt = row.createdAt;
    }
    if (row.source === "spark") {
      sparkFailures += 1;
    } else if (row.source === "agent_runtime") {
      runtimeFailures += 1;
    }
  }

  return {
    usage: usageSummary,
    telemetry: {
      events: telemetryRows.length,
      failures,
      sparkFailures,
      runtimeFailures,
      lastFailureAt,
    },
  };
}

async function resolveThreadOwnerUserId(
  ctx: QueryCtx,
  args: { userId: string; threadId: string; requireThreadRecord?: boolean },
) {
  if (args.requireThreadRecord === false) {
    return args.userId;
  }

  const ownedThread = await ctx.db
    .query("userThreads")
    .withIndex("by_userId_and_threadId", (q) =>
      q.eq("userId", args.userId).eq("threadId", args.threadId),
    )
    .unique();

  const thread =
    ownedThread ??
    (await ctx.db
      .query("userThreads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .unique());

  if (!thread) {
    throw new Error("Thread not found");
  }

  return thread.userId;
}

async function buildThreadUsageBreakdown(
  ctx: QueryCtx,
  args: { userId: string; threadId: string; requireThreadRecord?: boolean },
) {
  const ownerUserId = await resolveThreadOwnerUserId(ctx, args);
  const usageRows = await ctx.db
    .query("rawUsage")
    .withIndex("by_userId_and_threadId_and_createdAt", (q) =>
      q.eq("userId", ownerUserId).eq("threadId", args.threadId),
    )
    .collect();

  const byModel = new Map<
    string,
    {
      model: string;
      provider: string;
      calls: number;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      cachedInputTokens: number;
      estimatedCostUsd: number;
      lastCallAt?: number;
    }
  >();
  const byAgent = new Map<
    string,
    {
      agentName: string;
      calls: number;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      cachedInputTokens: number;
      estimatedCostUsd: number;
      lastCallAt?: number;
    }
  >();

  let calls = 0;
  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let cachedInputTokens = 0;
  let estimatedCostUsd = 0;

  for (const row of usageRows) {
    const rowTotalTokens = row.usage.totalTokens ?? 0;
    const rowInputTokens = row.usage.inputTokens ?? 0;
    const rowOutputTokens = row.usage.outputTokens ?? 0;
    const rowReasoningTokens = row.usage.reasoningTokens ?? 0;
    const rowCachedInputTokens = row.usage.cachedInputTokens ?? 0;
    const rowEstimatedCostUsd = extractEstimatedCostUsd(row.providerMetadata);
    const agentName = row.agentName ?? "unknown";

    calls += 1;
    totalTokens += rowTotalTokens;
    inputTokens += rowInputTokens;
    outputTokens += rowOutputTokens;
    reasoningTokens += rowReasoningTokens;
    cachedInputTokens += rowCachedInputTokens;
    estimatedCostUsd += rowEstimatedCostUsd;

    const modelKey = `${row.provider}::${row.model}`;
    const modelBucket = byModel.get(modelKey) ?? {
      model: row.model,
      provider: row.provider,
      calls: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      estimatedCostUsd: 0,
      lastCallAt: undefined,
    };
    modelBucket.calls += 1;
    modelBucket.totalTokens += rowTotalTokens;
    modelBucket.inputTokens += rowInputTokens;
    modelBucket.outputTokens += rowOutputTokens;
    modelBucket.reasoningTokens += rowReasoningTokens;
    modelBucket.cachedInputTokens += rowCachedInputTokens;
    modelBucket.estimatedCostUsd += rowEstimatedCostUsd;
    if (!modelBucket.lastCallAt || row.createdAt > modelBucket.lastCallAt) {
      modelBucket.lastCallAt = row.createdAt;
    }
    byModel.set(modelKey, modelBucket);

    const agentBucket = byAgent.get(agentName) ?? {
      agentName,
      calls: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      estimatedCostUsd: 0,
      lastCallAt: undefined,
    };
    agentBucket.calls += 1;
    agentBucket.totalTokens += rowTotalTokens;
    agentBucket.inputTokens += rowInputTokens;
    agentBucket.outputTokens += rowOutputTokens;
    agentBucket.reasoningTokens += rowReasoningTokens;
    agentBucket.cachedInputTokens += rowCachedInputTokens;
    agentBucket.estimatedCostUsd += rowEstimatedCostUsd;
    if (!agentBucket.lastCallAt || row.createdAt > agentBucket.lastCallAt) {
      agentBucket.lastCallAt = row.createdAt;
    }
    byAgent.set(agentName, agentBucket);
  }

  return {
    totals: {
      calls,
      totalTokens,
      inputTokens,
      outputTokens,
      reasoningTokens,
      cachedInputTokens,
      estimatedCostUsd,
    },
    byModel: Array.from(byModel.values()).sort(
      (a, b) => b.estimatedCostUsd - a.estimatedCostUsd,
    ),
    byAgent: Array.from(byAgent.values()).sort(
      (a, b) => b.estimatedCostUsd - a.estimatedCostUsd,
    ),
  };
}

export const insertRawUsageInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.optional(v.string()),
    agentName: v.optional(v.string()),
    model: v.string(),
    provider: v.string(),
    usage: usageValidator,
    providerMetadata: v.optional(v.any()),
  },
  returns: v.id("rawUsage"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("rawUsage", {
      userId: args.userId,
      threadId: normalizeThreadId(args.threadId),
      agentName: args.agentName,
      model: args.model,
      provider: args.provider,
      usage: sanitizeTelemetryValue(args.usage) as typeof args.usage,
      providerMetadata: sanitizeTelemetryValue(args.providerMetadata),
      billingPeriod: getBillingPeriod(now),
      createdAt: now,
    });
  },
});

export const insertTelemetryEventInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.optional(v.string()),
    source: telemetrySourceValidator,
    name: v.string(),
    status: telemetryStatusValidator,
    durationMs: v.optional(v.number()),
    errorCategory: v.optional(v.string()),
    retriable: v.optional(v.boolean()),
    model: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("telemetryEvents"),
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("telemetryEvents", {
      userId: args.userId,
      threadId: normalizeThreadId(args.threadId),
      source: args.source,
      name: args.name,
      status: args.status,
      durationMs: args.durationMs,
      errorCategory: args.errorCategory,
      retriable: args.retriable,
      model: args.model,
      metadata: sanitizeTelemetryValue(args.metadata),
      createdAt: now,
    });
  },
});

export const getCurrentUserRecentEvents = query({
  args: {
    limit: v.optional(v.number()),
    failuresOnly: v.optional(v.boolean()),
  },
  returns: v.array(telemetryEventSummaryValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const limit = Math.max(1, Math.min(args.limit ?? 20, 50));
    const rows = await ctx.db
      .query("telemetryEvents")
      .withIndex("by_userId_and_createdAt", (q) =>
        q.eq("userId", identity.subject),
      )
      .order("desc")
      .take(args.failuresOnly ? limit * 3 : limit);

    return rows
      .filter((row) => !args.failuresOnly || row.status === "failed")
      .slice(0, limit)
      .map((row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        threadId: row.threadId,
        source: row.source,
        name: row.name,
        status: row.status,
        durationMs: row.durationMs,
        errorCategory: row.errorCategory,
        retriable: row.retriable,
        model: row.model,
        metadata: row.metadata,
        createdAt: row.createdAt,
      }));
  },
});

export const getCurrentUserRecentFailures = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(telemetryEventSummaryValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const limit = Math.max(1, Math.min(args.limit ?? 20, 50));
    const rows = await ctx.db
      .query("telemetryEvents")
      .withIndex("by_userId_and_createdAt", (q) =>
        q.eq("userId", identity.subject),
      )
      .order("desc")
      .take(limit * 3);

    return rows
      .filter((row) => row.status === "failed")
      .slice(0, limit)
      .map((row) => ({
        _id: row._id,
        _creationTime: row._creationTime,
        threadId: row.threadId,
        source: row.source,
        name: row.name,
        status: row.status,
        durationMs: row.durationMs,
        errorCategory: row.errorCategory,
        retriable: row.retriable,
        model: row.model,
        metadata: row.metadata,
        createdAt: row.createdAt,
      }));
  },
});

export const getThreadObservabilitySummary = query({
  args: {
    threadId: v.string(),
  },
  returns: summaryReturnsValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    return await buildThreadObservabilitySummary(ctx, {
      userId: identity.subject,
      threadId: args.threadId,
      requireThreadRecord: true,
    });
  },
});

export const getThreadObservabilitySummaryInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: summaryReturnsValidator,
  handler: async (ctx, args) => {
    return await buildThreadObservabilitySummary(ctx, {
      ...args,
      requireThreadRecord: false,
    });
  },
});

export const getThreadUsageBreakdownInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: threadUsageBreakdownReturnsValidator,
  handler: async (ctx, args) => {
    return await buildThreadUsageBreakdown(ctx, {
      ...args,
      requireThreadRecord: true,
    });
  },
});

export const getCurrentUserMonthlyUsage = query({
  args: {},
  returns: monthlyUsageSummaryReturnsValidator,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const billingPeriod = getBillingPeriod(Date.now());
    const usageRows = await ctx.db
      .query("rawUsage")
      .withIndex("by_billingPeriod_and_userId", (q) =>
        q.eq("billingPeriod", billingPeriod).eq("userId", identity.subject),
      )
      .collect();

    const threadRows = await ctx.db
      .query("userThreads")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .collect();

    const threadTitleById = new Map<string, string>();
    for (const thread of threadRows) {
      threadTitleById.set(thread.threadId, thread.title ?? "New thread");
    }

    const modelBreakdownMap = new Map<
      string,
      {
        model: string;
        provider: string;
        calls: number;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
        estimatedCostUsd: number;
      }
    >();

    const threadBreakdownMap = new Map<
      string,
      {
        threadId: string;
        threadTitle: string;
        calls: number;
        totalTokens: number;
        inputTokens: number;
        outputTokens: number;
      }
    >();

    let calls = 0;
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let reasoningTokens = 0;
    let cachedInputTokens = 0;
    let estimatedCostUsd = 0;
    let lastCallAt: number | undefined;

    for (const row of usageRows) {
      const rowTotalTokens = row.usage.totalTokens ?? 0;
      const rowInputTokens = row.usage.inputTokens ?? 0;
      const rowOutputTokens = row.usage.outputTokens ?? 0;
      const rowReasoningTokens = row.usage.reasoningTokens ?? 0;
      const rowCachedInputTokens = row.usage.cachedInputTokens ?? 0;
      const rowEstimatedCostUsd = extractEstimatedCostUsd(row.providerMetadata);

      calls += 1;
      totalTokens += rowTotalTokens;
      inputTokens += rowInputTokens;
      outputTokens += rowOutputTokens;
      reasoningTokens += rowReasoningTokens;
      cachedInputTokens += rowCachedInputTokens;
      estimatedCostUsd += rowEstimatedCostUsd;

      if (!lastCallAt || row.createdAt > lastCallAt) {
        lastCallAt = row.createdAt;
      }

      const modelKey = `${row.provider}::${row.model}`;
      const modelBucket = modelBreakdownMap.get(modelKey) ?? {
        model: row.model,
        provider: row.provider,
        calls: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      };
      modelBucket.calls += 1;
      modelBucket.totalTokens += rowTotalTokens;
      modelBucket.inputTokens += rowInputTokens;
      modelBucket.outputTokens += rowOutputTokens;
      modelBucket.estimatedCostUsd += rowEstimatedCostUsd;
      modelBreakdownMap.set(modelKey, modelBucket);

      const resolvedThreadTitle =
        row.threadId === THREAD_PLACEHOLDER
          ? "General"
          : (threadTitleById.get(row.threadId) ?? "Deleted thread");
      const threadBucket = threadBreakdownMap.get(row.threadId) ?? {
        threadId: row.threadId,
        threadTitle: resolvedThreadTitle,
        calls: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
      threadBucket.calls += 1;
      threadBucket.totalTokens += rowTotalTokens;
      threadBucket.inputTokens += rowInputTokens;
      threadBucket.outputTokens += rowOutputTokens;
      threadBreakdownMap.set(row.threadId, threadBucket);
    }

    const modelBreakdown = Array.from(modelBreakdownMap.values()).sort(
      (a, b) => b.totalTokens - a.totalTokens,
    );

    const threadBreakdown = Array.from(threadBreakdownMap.values())
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 8);

    return {
      billingPeriod,
      totals: {
        calls,
        totalTokens,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedInputTokens,
        estimatedCostUsd,
        avgTokensPerCall: calls > 0 ? totalTokens / calls : 0,
      },
      modelBreakdown,
      threadBreakdown,
      lastCallAt,
    };
  },
});
