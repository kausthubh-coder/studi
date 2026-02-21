import { listUIMessages, syncStreams, vStreamArgs } from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

const threadSummaryValidator = v.object({
  _id: v.id("userThreads"),
  _creationTime: v.number(),
  threadId: v.string(),
  title: v.optional(v.string()),
  lastMessageAt: v.optional(v.number()),
});

const imageAttachmentForModelValidator = v.object({
  kind: v.literal("image"),
  url: v.string(),
  mimeType: v.string(),
  filename: v.optional(v.string()),
});

const fileAttachmentForModelValidator = v.object({
  kind: v.literal("file"),
  url: v.string(),
  mimeType: v.string(),
  filename: v.optional(v.string()),
});

export const listThreads = query({
  args: {},
  returns: v.array(threadSummaryValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const threads = await ctx.db
      .query("userThreads")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();

    return threads.map((thread) => ({
      _id: thread._id,
      _creationTime: thread._creationTime,
      threadId: thread.threadId,
      title: thread.title,
      lastMessageAt: thread.lastMessageAt,
    }));
  },
});

export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  returns: v.any(),
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

    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });

    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    });

    return { ...paginated, streams };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    return await ctx.storage.generateUploadUrl();
  },
});

export const saveAttachment = mutation({
  args: {
    storageId: v.id("_storage"),
    filename: v.optional(v.string()),
    mimeType: v.string(),
    size: v.number(),
  },
  returns: v.object({
    attachmentId: v.id("attachments"),
    filename: v.optional(v.string()),
    mimeType: v.string(),
    size: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const attachmentId = await ctx.db.insert("attachments", {
      userId: identity.subject,
      storageId: args.storageId,
      filename: args.filename,
      mimeType: args.mimeType,
      size: args.size,
    });

    return {
      attachmentId,
      filename: args.filename,
      mimeType: args.mimeType,
      size: args.size,
    };
  },
});

export const createThreadRecord = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    title: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("userThreads", {
      userId: args.userId,
      threadId: args.threadId,
      title: args.title,
      lastMessageAt: args.lastMessageAt,
    });
    return null;
  },
});

export const updateThreadTitle = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();
    if (!thread) throw new Error("Thread not found");
    if (!thread.title || thread.title === "New Thread") {
      await ctx.db.patch(thread._id, { title: args.title });
    }
    return null;
  },
});

export const touchThread = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    lastMessageAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (!thread) {
      throw new Error("Thread not found");
    }

    await ctx.db.patch(thread._id, {
      lastMessageAt: args.lastMessageAt,
    });
    return null;
  },
});

export const assertThreadOwner = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (!thread) {
      throw new Error("Thread not found");
    }

    return null;
  },
});

export const resolveAttachments = internalQuery({
  args: {
    userId: v.string(),
    attachmentIds: v.array(v.id("attachments")),
  },
  returns: v.array(
    v.union(imageAttachmentForModelValidator, fileAttachmentForModelValidator),
  ),
  handler: async (ctx, args) => {
    const results: Array<
      | {
          kind: "image";
          url: string;
          mimeType: string;
          filename?: string;
        }
      | {
          kind: "file";
          url: string;
          mimeType: string;
          filename?: string;
        }
    > = [];

    for (const attachmentId of args.attachmentIds) {
      const attachment = await ctx.db.get(attachmentId);
      if (!attachment) {
        throw new Error("Attachment not found");
      }
      if (attachment.userId !== args.userId) {
        throw new Error("Attachment access denied");
      }

      const url = await ctx.storage.getUrl(attachment.storageId);
      if (!url) {
        throw new Error("Attachment URL unavailable");
      }

      if (attachment.mimeType.startsWith("image/")) {
        results.push({
          kind: "image",
          url,
          mimeType: attachment.mimeType,
          filename: attachment.filename,
        });
      } else {
        results.push({
          kind: "file",
          url,
          mimeType: attachment.mimeType,
          filename: attachment.filename,
        });
      }
    }

    return results;
  },
});
