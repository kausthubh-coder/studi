import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";

const internalApi = internal as {
  billing: {
    recordLabActivityInternal: typeof internal.billing.recordLabActivityInternal;
    recordLabUsageInternal: typeof internal.billing.recordLabUsageInternal;
  };
};

const labMetadataValidator = v.object({
  topic: v.optional(v.string()),
  objective: v.optional(v.string()),
  language: v.optional(v.string()),
  framework: v.optional(v.string()),
  template: v.optional(v.string()),
  runtimeProfileId: v.optional(v.string()),
});

const labSessionValidator = v.object({
  _id: v.id("labSessions"),
  _creationTime: v.number(),
  userId: v.string(),
  threadId: v.string(),
  sandboxId: v.string(),
  metadata: labMetadataValidator,
  createdAt: v.number(),
  updatedAt: v.number(),
  lastActiveAt: v.number(),
  archivedAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
});

type LabMetadata = {
  topic?: string;
  objective?: string;
  language?: string;
  framework?: string;
  template?: string;
  runtimeProfileId?: string;
};

function mergeMetadata(
  existing: LabMetadata,
  incoming?: LabMetadata,
): LabMetadata {
  return {
    topic: incoming?.topic ?? existing.topic,
    objective: incoming?.objective ?? existing.objective,
    language: incoming?.language ?? existing.language,
    framework: incoming?.framework ?? existing.framework,
    template: incoming?.template ?? existing.template,
    runtimeProfileId: incoming?.runtimeProfileId ?? existing.runtimeProfileId,
  };
}

export const getLabSession = query({
  args: {
    threadId: v.string(),
  },
  returns: v.union(v.null(), labSessionValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const session = await ctx.db
      .query("labSessions")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", identity.subject).eq("threadId", args.threadId),
      )
      .unique();

    if (!session) {
      return null;
    }

    return session;
  },
});

export const getLabSessionByThreadForUserInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.union(v.null(), labSessionValidator),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("labSessions")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (!session) {
      return null;
    }

    return session;
  },
});

export const upsertLabSessionInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    sandboxId: v.string(),
    metadata: v.optional(labMetadataValidator),
  },
  returns: v.object({
    labSessionId: v.id("labSessions"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("labSessions")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        sandboxId: args.sandboxId,
        metadata: mergeMetadata(existing.metadata, args.metadata),
        updatedAt: now,
        lastActiveAt: now,
        archivedAt: undefined,
      });
      return {
        labSessionId: existing._id,
        created: false,
      };
    }

    const labSessionId = await ctx.db.insert("labSessions", {
      userId: args.userId,
      threadId: args.threadId,
      sandboxId: args.sandboxId,
      metadata: {
        topic: args.metadata?.topic,
        objective: args.metadata?.objective,
        language: args.metadata?.language,
        framework: args.metadata?.framework,
        template: args.metadata?.template,
        runtimeProfileId: args.metadata?.runtimeProfileId,
      },
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
      archivedAt: undefined,
    });

    await ctx.runMutation(internalApi.billing.recordLabUsageInternal, {
      userId: args.userId,
      labSessionCount: 1,
    });

    return {
      labSessionId,
      created: true,
    };
  },
});

export const touchLabSessionInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("labSessions")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (!session) {
      throw new Error("Lab session not found");
    }

    const now = Date.now();
    await ctx.runMutation(internalApi.billing.recordLabActivityInternal, {
      userId: args.userId,
      threadId: args.threadId,
      lastActiveAt: session.lastActiveAt,
      now,
    });
    await ctx.db.patch(session._id, {
      updatedAt: now,
      lastActiveAt: now,
    });

    return null;
  },
});

export const deleteLabSessionInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("labSessions")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (!session) {
      return false;
    }

    await ctx.db.delete(session._id);
    return true;
  },
});
