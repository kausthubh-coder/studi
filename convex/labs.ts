import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

const labLanguageValidator = v.union(
  v.literal("python"),
  v.literal("javascript"),
  v.literal("typescript"),
);

const labStatusValidator = v.union(
  v.literal("starting"),
  v.literal("ready"),
  v.literal("error"),
  v.literal("archived"),
);

const labPreviewValidator = v.object({
  port: v.number(),
  url: v.string(),
  token: v.optional(v.string()),
});

const labErrorValidator = v.object({
  message: v.string(),
  category: v.optional(v.string()),
  retriable: v.optional(v.boolean()),
  occurredAt: v.number(),
});

const labSessionValidator = v.object({
  _id: v.id("labSessions"),
  _creationTime: v.number(),
  userId: v.string(),
  threadId: v.string(),
  title: v.optional(v.string()),
  provider: v.literal("daytona"),
  sandboxId: v.string(),
  workspacePath: v.string(),
  language: v.optional(labLanguageValidator),
  status: labStatusValidator,
  previewUrls: v.optional(v.array(labPreviewValidator)),
  lastError: v.optional(labErrorValidator),
  lastActiveAt: v.number(),
  archivedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function requireThreadOwnership(
  ctx: QueryCtx | MutationCtx,
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

async function getOwnedLabSession(
  ctx: QueryCtx | MutationCtx,
  args: { userId: string; labSessionId: Id<"labSessions"> },
): Promise<Doc<"labSessions">> {
  const lab = await ctx.db.get(args.labSessionId);
  if (!lab || lab.userId !== args.userId) {
    throw new Error("Lab session not found");
  }
  return lab;
}

export const listLabSessions = query({
  args: {
    threadId: v.string(),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(labSessionValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    await requireThreadOwnership(ctx, {
      userId: identity.subject,
      threadId: args.threadId,
    });

    const sessions = await ctx.db
      .query("labSessions")
      .withIndex("by_userId_and_threadId_and_lastActiveAt", (q) =>
        q.eq("userId", identity.subject).eq("threadId", args.threadId),
      )
      .order("desc")
      .take(50);

    return args.includeArchived
      ? sessions
      : sessions.filter((session) => session.status !== "archived");
  },
});

export const getLabSession = query({
  args: {
    labSessionId: v.id("labSessions"),
  },
  returns: v.union(v.null(), labSessionValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const session = await getOwnedLabSession(ctx, {
      userId: identity.subject,
      labSessionId: args.labSessionId,
    });
    return session;
  },
});

export const createLabSessionInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    title: v.optional(v.string()),
    provider: v.literal("daytona"),
    sandboxId: v.string(),
    workspacePath: v.string(),
    language: v.optional(labLanguageValidator),
    status: labStatusValidator,
    previewUrls: v.optional(v.array(labPreviewValidator)),
  },
  returns: labSessionValidator,
  handler: async (ctx, args) => {
    await requireThreadOwnership(ctx, {
      userId: args.userId,
      threadId: args.threadId,
    });

    const now = Date.now();
    const id = await ctx.db.insert("labSessions", {
      userId: args.userId,
      threadId: args.threadId,
      title: args.title,
      provider: args.provider,
      sandboxId: args.sandboxId,
      workspacePath: args.workspacePath,
      language: args.language,
      status: args.status,
      previewUrls: args.previewUrls,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const created = await ctx.db.get(id);
    if (!created) throw new Error("Failed to create lab session");
    return created;
  },
});

export const patchLabSessionRuntimeInternal = internalMutation({
  args: {
    userId: v.string(),
    labSessionId: v.id("labSessions"),
    workspacePath: v.optional(v.string()),
    status: v.optional(labStatusValidator),
    previewUrls: v.optional(v.array(labPreviewValidator)),
    clearError: v.optional(v.boolean()),
  },
  returns: labSessionValidator,
  handler: async (ctx, args) => {
    const session = await getOwnedLabSession(ctx, args);
    const now = Date.now();
    await ctx.db.patch(session._id, {
      workspacePath: args.workspacePath ?? session.workspacePath,
      status: args.status ?? session.status,
      previewUrls: args.previewUrls ?? session.previewUrls,
      lastError: args.clearError ? undefined : session.lastError,
      lastActiveAt: now,
      updatedAt: now,
    });
    const updated = await ctx.db.get(session._id);
    if (!updated) throw new Error("Lab session not found");
    return updated;
  },
});

export const recordLabErrorInternal = internalMutation({
  args: {
    userId: v.string(),
    labSessionId: v.id("labSessions"),
    message: v.string(),
    category: v.optional(v.string()),
    retriable: v.optional(v.boolean()),
  },
  returns: labSessionValidator,
  handler: async (ctx, args) => {
    const session = await getOwnedLabSession(ctx, args);
    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: session.status === "archived" ? "archived" : "error",
      lastError: {
        message: args.message.slice(0, 800),
        category: args.category,
        retriable: args.retriable,
        occurredAt: now,
      },
      updatedAt: now,
    });
    const updated = await ctx.db.get(session._id);
    if (!updated) throw new Error("Lab session not found");
    return updated;
  },
});

export const archiveLabSessionInternal = internalMutation({
  args: {
    userId: v.string(),
    labSessionId: v.id("labSessions"),
  },
  returns: labSessionValidator,
  handler: async (ctx, args) => {
    const session = await getOwnedLabSession(ctx, args);
    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    });
    const updated = await ctx.db.get(session._id);
    if (!updated) throw new Error("Lab session not found");
    return updated;
  },
});

export const getLabSessionForUserInternal = internalQuery({
  args: {
    userId: v.string(),
    labSessionId: v.id("labSessions"),
  },
  returns: labSessionValidator,
  handler: async (ctx, args) => {
    return await getOwnedLabSession(ctx, args);
  },
});

export const assertLabSessionOwnerInternal = internalQuery({
  args: {
    userId: v.string(),
    labSessionId: v.id("labSessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getOwnedLabSession(ctx, args);
    return null;
  },
});

export const listLabSessionsForThreadInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.array(
    v.object({
      labSessionId: v.id("labSessions"),
      sandboxId: v.string(),
      provider: v.literal("daytona"),
    }),
  ),
  handler: async (ctx, args) => {
    await requireThreadOwnership(ctx, args);
    const sessions = await ctx.db
      .query("labSessions")
      .withIndex("by_userId_and_threadId_and_lastActiveAt", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .collect();

    return sessions
      .filter((session) => session.status !== "archived")
      .map((session) => ({
        labSessionId: session._id,
        sandboxId: session.sandboxId,
        provider: session.provider,
      }));
  },
});

export const renameLabSession = mutation({
  args: {
    labSessionId: v.id("labSessions"),
    title: v.string(),
  },
  returns: labSessionValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const session = await getOwnedLabSession(ctx, {
      userId: identity.subject,
      labSessionId: args.labSessionId,
    });
    await ctx.db.patch(session._id, {
      title: args.title.trim().slice(0, 120) || session.title,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(session._id);
    if (!updated) throw new Error("Lab session not found");
    return updated;
  },
});
