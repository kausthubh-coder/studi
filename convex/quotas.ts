import { v } from "convex/values";
import { internalMutation, query, type MutationCtx } from "./_generated/server";
import {
  quotaActionLabels,
  type QuotaAction,
} from "../lib/observability/contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

const quotaActionValidator = v.union(
  v.literal("spark_create"),
  v.literal("lab_runtime"),
  v.literal("voice_session"),
  v.literal("track_generation"),
);

const quotaCounterValidator = v.object({
  action: quotaActionValidator,
  label: v.string(),
  dayKey: v.string(),
  count: v.number(),
  limit: v.number(),
  remaining: v.number(),
  updatedAt: v.number(),
});

const quotaReservationValidator = v.object({
  allowed: v.boolean(),
  code: v.optional(v.literal("QUOTA_EXCEEDED")),
  action: quotaActionValidator,
  label: v.string(),
  dayKey: v.string(),
  count: v.number(),
  limit: v.number(),
  remaining: v.number(),
  resetAt: v.number(),
  updatedAt: v.number(),
  message: v.optional(v.string()),
});

const DAILY_LIMITS: Record<QuotaAction, number> = {
  spark_create: 24,
  lab_runtime: 30,
  voice_session: 12,
  track_generation: 20,
};

function getDayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function getResetAt(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00.000Z`).getTime() + DAY_MS;
}

function normalizeAmount(amount: number | undefined): number {
  if (!Number.isFinite(amount ?? 1)) return 1;
  return Math.max(1, Math.min(Math.floor(amount ?? 1), 100));
}

async function insertQuotaTelemetry(
  ctx: MutationCtx,
  args: {
    userId: string;
    threadId?: string;
    action: QuotaAction;
    name?: string;
    status: "success" | "failed";
    count: number;
    limit: number;
    requested: number;
    resetAt: number;
  },
) {
  await ctx.db.insert("telemetryEvents", {
    userId: args.userId,
    threadId: args.threadId?.trim() || "__none__",
    source: "quota",
    name: args.name ?? args.action,
    status: args.status,
    errorCategory: args.status === "failed" ? "quota_exceeded" : undefined,
    retriable: args.status === "failed" ? false : undefined,
    metadata: {
      action: args.action,
      label: quotaActionLabels[args.action],
      count: args.count,
      limit: args.limit,
      requested: args.requested,
      resetAt: args.resetAt,
    },
    createdAt: Date.now(),
  });
}

export const reserveDailyQuotaInternal = internalMutation({
  args: {
    userId: v.string(),
    action: quotaActionValidator,
    threadId: v.optional(v.string()),
    name: v.optional(v.string()),
    amount: v.optional(v.number()),
  },
  returns: quotaReservationValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const dayKey = getDayKey(now);
    const amount = normalizeAmount(args.amount);
    const limit = DAILY_LIMITS[args.action];
    const existing = await ctx.db
      .query("quotaCounters")
      .withIndex("by_userId_and_dayKey_and_action", (q) =>
        q
          .eq("userId", args.userId)
          .eq("dayKey", dayKey)
          .eq("action", args.action),
      )
      .unique();

    const currentCount = existing?.count ?? 0;
    const nextCount = currentCount + amount;
    const resetAt = getResetAt(dayKey);

    if (nextCount > limit) {
      await insertQuotaTelemetry(ctx, {
        userId: args.userId,
        threadId: args.threadId,
        action: args.action,
        name: args.name,
        status: "failed",
        count: currentCount,
        limit,
        requested: amount,
        resetAt,
      });
      const message = `${quotaActionLabels[args.action]} daily limit reached. Try again tomorrow.`;
      return {
        allowed: false,
        code: "QUOTA_EXCEEDED" as const,
        action: args.action,
        label: quotaActionLabels[args.action],
        dayKey,
        count: currentCount,
        limit,
        remaining: 0,
        resetAt,
        updatedAt: now,
        message,
      };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: nextCount,
        limit,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("quotaCounters", {
        userId: args.userId,
        dayKey,
        action: args.action,
        count: nextCount,
        limit,
        updatedAt: now,
      });
    }

    await insertQuotaTelemetry(ctx, {
      userId: args.userId,
      threadId: args.threadId,
      action: args.action,
      name: args.name,
      status: "success",
      count: nextCount,
      limit,
      requested: amount,
      resetAt,
    });

    return {
      allowed: true,
      action: args.action,
      label: quotaActionLabels[args.action],
      dayKey,
      count: nextCount,
      limit,
      remaining: Math.max(0, limit - nextCount),
      resetAt,
      updatedAt: now,
    };
  },
});

export const getCurrentUserDailyQuotaUsage = query({
  args: {},
  returns: v.array(quotaCounterValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const dayKey = getDayKey(Date.now());
    const rows = await ctx.db
      .query("quotaCounters")
      .withIndex("by_userId_and_dayKey", (q) =>
        q.eq("userId", identity.subject).eq("dayKey", dayKey),
      )
      .collect();

    const counters = new Map(rows.map((row) => [row.action, row]));
    return Object.keys(DAILY_LIMITS).map((key) => {
      const action = key as QuotaAction;
      const row = counters.get(action);
      const limit = DAILY_LIMITS[action];
      const count = row?.count ?? 0;
      return {
        action,
        label: quotaActionLabels[action],
        dayKey,
        count,
        limit,
        remaining: Math.max(0, limit - count),
        updatedAt: row?.updatedAt ?? 0,
      };
    });
  },
});
