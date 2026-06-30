import { v } from "convex/values";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";

const maxCodeLength = 22_000;
const maxOutputLength = 6_000;
const maxErrorLength = 4_000;
const maxTitleLength = 120;

const runStatusValidator = v.union(
  v.literal("idle"),
  v.literal("success"),
  v.literal("error"),
);

const runResultValidator = v.object({
  status: runStatusValidator,
  stdout: v.optional(v.string()),
  stderr: v.optional(v.string()),
  error: v.optional(v.string()),
});

const codeSparkLanguageValidator = v.union(
  v.literal("python"),
  v.literal("javascript"),
  v.literal("typescript"),
);

const sparkStateValidator = v.object({
  sparkInstanceId: v.string(),
  sparkTitle: v.optional(v.string()),
  language: v.optional(v.string()),
  code: v.optional(v.string()),
  runCount: v.number(),
  lastStatus: runStatusValidator,
  lastStdout: v.optional(v.string()),
  lastStderr: v.optional(v.string()),
  lastError: v.optional(v.string()),
  lastRunAt: v.optional(v.number()),
  lastUpdatedAt: v.number(),
});

function trimTo(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, maxLength);
}

function sliceTo(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.slice(0, maxLength);
}

async function requireThreadOwnership(
  ctx: MutationCtx,
  args: { userId: string; threadId: string },
) {
  const ownedThread = await ctx.db
    .query("userThreads")
    .withIndex("by_userId_and_threadId", (q) =>
      q.eq("userId", args.userId).eq("threadId", args.threadId),
    )
    .unique();

  if (!ownedThread) {
    throw new Error("Thread not found");
  }
}

export const upsertCodeSparkDraft = mutation({
  args: {
    threadId: v.string(),
    sparkInstanceId: v.string(),
    sparkTitle: v.optional(v.string()),
    language: codeSparkLanguageValidator,
    code: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    await requireThreadOwnership(ctx, {
      userId: identity.subject,
      threadId: args.threadId,
    });

    const now = Date.now();
    const existing = await ctx.db
      .query("sparkInteractions")
      .withIndex("by_userId_and_threadId_and_sparkInstanceId", (q) =>
        q
          .eq("userId", identity.subject)
          .eq("threadId", args.threadId)
          .eq("sparkInstanceId", args.sparkInstanceId),
      )
      .unique();

    const normalizedCode = sliceTo(args.code, maxCodeLength);
    const normalizedTitle = trimTo(args.sparkTitle, maxTitleLength);

    if (existing) {
      await ctx.db.patch(existing._id, {
        sparkTitle: normalizedTitle ?? existing.sparkTitle,
        language: args.language,
        code: normalizedCode,
        lastUpdatedAt: now,
      });
      return null;
    }

    await ctx.db.insert("sparkInteractions", {
      userId: identity.subject,
      threadId: args.threadId,
      sparkInstanceId: args.sparkInstanceId,
      sparkType: "code_playground",
      sparkTitle: normalizedTitle,
      language: args.language,
      code: normalizedCode,
      runCount: 0,
      lastStatus: "idle",
      lastUpdatedAt: now,
    });

    return null;
  },
});

export const recordCodeSparkRun = mutation({
  args: {
    threadId: v.string(),
    sparkInstanceId: v.string(),
    sparkTitle: v.optional(v.string()),
    language: codeSparkLanguageValidator,
    code: v.string(),
    result: runResultValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    await requireThreadOwnership(ctx, {
      userId: identity.subject,
      threadId: args.threadId,
    });

    const now = Date.now();
    const existing = await ctx.db
      .query("sparkInteractions")
      .withIndex("by_userId_and_threadId_and_sparkInstanceId", (q) =>
        q
          .eq("userId", identity.subject)
          .eq("threadId", args.threadId)
          .eq("sparkInstanceId", args.sparkInstanceId),
      )
      .unique();

    const nextRunCount = existing ? existing.runCount + 1 : 1;
    const normalizedTitle = trimTo(args.sparkTitle, maxTitleLength);

    const patch = {
      sparkTitle: normalizedTitle ?? existing?.sparkTitle,
      language: args.language,
      code: sliceTo(args.code, maxCodeLength),
      runCount: nextRunCount,
      lastStatus: args.result.status,
      lastStdout: sliceTo(args.result.stdout, maxOutputLength),
      lastStderr: sliceTo(args.result.stderr, maxOutputLength),
      lastError: sliceTo(args.result.error, maxErrorLength),
      lastRunAt: now,
      lastUpdatedAt: now,
    } as const;

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return null;
    }

    await ctx.db.insert("sparkInteractions", {
      userId: identity.subject,
      threadId: args.threadId,
      sparkInstanceId: args.sparkInstanceId,
      sparkType: "code_playground",
      ...patch,
    });

    return null;
  },
});

export const getCodeSparkState = query({
  args: {
    threadId: v.string(),
    sparkInstanceId: v.string(),
  },
  returns: v.union(v.null(), sparkStateValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const ownedThread = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", identity.subject).eq("threadId", args.threadId),
      )
      .unique();
    if (!ownedThread) {
      throw new Error("Thread not found");
    }

    const existing = await ctx.db
      .query("sparkInteractions")
      .withIndex("by_userId_and_threadId_and_sparkInstanceId", (q) =>
        q
          .eq("userId", identity.subject)
          .eq("threadId", args.threadId)
          .eq("sparkInstanceId", args.sparkInstanceId),
      )
      .unique();

    if (!existing) {
      return null;
    }

    return {
      sparkInstanceId: existing.sparkInstanceId,
      sparkTitle: existing.sparkTitle,
      language: existing.language,
      code: existing.code,
      runCount: existing.runCount,
      lastStatus: existing.lastStatus,
      lastStdout: existing.lastStdout,
      lastStderr: existing.lastStderr,
      lastError: existing.lastError,
      lastRunAt: existing.lastRunAt,
      lastUpdatedAt: existing.lastUpdatedAt,
    };
  },
});

export const getRecentCodeSparkContextInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(sparkStateValidator),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 3, 8));
    const rows = await ctx.db
      .query("sparkInteractions")
      .withIndex("by_userId_and_threadId_and_lastUpdatedAt", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .order("desc")
      .take(limit);

    return rows.map((row) => ({
      sparkInstanceId: row.sparkInstanceId,
      sparkTitle: row.sparkTitle,
      language: row.language,
      code: row.code,
      runCount: row.runCount,
      lastStatus: row.lastStatus,
      lastStdout: row.lastStdout,
      lastStderr: row.lastStderr,
      lastError: row.lastError,
      lastRunAt: row.lastRunAt,
      lastUpdatedAt: row.lastUpdatedAt,
    }));
  },
});
