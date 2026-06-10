import {
  listUIMessages,
  saveMessage,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { paginationOptsValidator, type FunctionReference } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

const internalApi = internal as unknown as {
  billing: {
    assertCanSendMessageInternal: FunctionReference<"mutation", "internal">;
    assertCanUseAttachmentsInternal: FunctionReference<"mutation", "internal">;
    incrementFreeOnboardingUsageInternal: FunctionReference<"mutation", "internal">;
    recordTextAiCostInternal: FunctionReference<"mutation", "internal">;
  };
};

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

const queuedSendResultValidator = v.object({
  promptMessageId: v.string(),
  deduped: v.boolean(),
});

function truncateTitle(value: string): string {
  return value.length > 60 ? `${value.slice(0, 60)}...` : value;
}

export const listThreads = query({
  args: {},
  returns: v.array(threadSummaryValidator),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const threads = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_lastMessageAt", (q) =>
        q.eq("userId", identity.subject),
      )
      .order("desc")
      .take(100);

    return threads.map((thread) => ({
      _id: thread._id,
      _creationTime: thread._creationTime,
      threadId: thread.threadId,
      title: thread.title,
      lastMessageAt: thread.lastMessageAt,
    }));
  },
});

export const backfillThreadActivityForCurrentUser = mutation({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.object({
    scanned: v.number(),
    patched: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const maxItems = Math.max(1, Math.min(args.limit ?? 200, 1000));
    const threads = await ctx.db
      .query("userThreads")
      .withIndex("by_userId", (q) => q.eq("userId", identity.subject))
      .take(maxItems);

    let scanned = 0;
    let patched = 0;

    for (const thread of threads) {
      scanned += 1;

      if (typeof thread.lastMessageAt === "number") {
        continue;
      }

      await ctx.db.patch(thread._id, {
        lastMessageAt: thread._creationTime,
      });
      patched += 1;
    }

    return { scanned, patched };
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

    await ctx.runMutation(internalApi.billing.assertCanUseAttachmentsInternal, {
      userId: identity.subject,
    });

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

    await ctx.runMutation(internalApi.billing.assertCanUseAttachmentsInternal, {
      userId: identity.subject,
    });

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

export const sendMessage = mutation({
  args: {
    threadId: v.string(),
    prompt: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.id("attachments"))),
    requestId: v.string(),
  },
  returns: queuedSendResultValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const prompt = args.prompt?.trim() ?? "";
    const attachmentIds = args.attachmentIds ?? [];
    if (!prompt && attachmentIds.length === 0) {
      throw new Error("Message cannot be empty");
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

    if (
      ownedThread.lastRequestId === args.requestId &&
      typeof ownedThread.lastPromptMessageId === "string"
    ) {
      return {
        promptMessageId: ownedThread.lastPromptMessageId,
        deduped: true,
      };
    }

    const billingSnapshot = await ctx.runMutation(
      internalApi.billing.assertCanSendMessageInternal,
      {
        userId: identity.subject,
        attachmentCount: attachmentIds.length,
      },
    );

    const attachments = await ctx.runQuery(internal.chat.resolveAttachments, {
      userId: identity.subject,
      attachmentIds,
    });

    const content: Array<
      | { type: "text"; text: string }
      | { type: "image"; image: string; mimeType: string }
      | { type: "file"; data: string; mediaType: string; filename?: string }
    > = [];

    if (prompt) {
      content.push({ type: "text", text: prompt });
    }

    for (const attachment of attachments) {
      if (attachment.kind === "image") {
        content.push({
          type: "image",
          image: attachment.url,
          mimeType: attachment.mimeType,
        });
      } else {
        content.push({
          type: "file",
          data: attachment.url,
          mediaType: attachment.mimeType,
          filename: attachment.filename,
        });
      }
    }

    const now = Date.now();
    const { messageId } = await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      userId: identity.subject,
      message: {
        role: "user",
        content,
      },
    });

    await ctx.db.patch(ownedThread._id, {
      lastMessageAt: now,
      title:
        prompt && (!ownedThread.title || ownedThread.title === "New Thread")
          ? truncateTitle(prompt)
          : ownedThread.title,
      lastRequestId: args.requestId,
      lastPromptMessageId: messageId,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.chatActions.generateAssistantReply,
      {
        threadId: args.threadId,
        userId: identity.subject,
        promptMessageId: messageId,
      },
    );

    if (billingSnapshot.planKey === "free_onboarding") {
      await ctx.runMutation(
        internalApi.billing.incrementFreeOnboardingUsageInternal,
        {
          userId: identity.subject,
          promptCount: 1,
        },
      );
    } else {
      await ctx.runMutation(internalApi.billing.recordTextAiCostInternal, {
        userId: identity.subject,
        textPromptCount: 1,
      });
    }

    return {
      promptMessageId: messageId,
      deduped: false,
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
    const existing = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        title:
          !existing.title && typeof args.title === "string"
            ? args.title
            : existing.title,
        lastMessageAt: args.lastMessageAt ?? existing.lastMessageAt,
      });
      return null;
    }

    await ctx.db.insert("userThreads", {
      userId: args.userId,
      threadId: args.threadId,
      title: args.title,
      lastMessageAt: args.lastMessageAt ?? Date.now(),
    });
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

export const deleteThreadRecordInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (!thread) {
      return false;
    }

    const sparkInteractions = await ctx.db
      .query("sparkInteractions")
      .withIndex("by_userId_and_threadId_and_lastUpdatedAt", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .collect();

    for (const interaction of sparkInteractions) {
      await ctx.db.delete(interaction._id);
    }

    await ctx.db.delete(thread._id);
    return true;
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
