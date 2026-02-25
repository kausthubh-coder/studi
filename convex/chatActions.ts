"use node";

import { v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { studiAgent, studiLabAgent } from "./agent";

async function requireAuthenticatedUserId(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity.subject;
}

export const createThread = action({
  args: {
    title: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);

    const { threadId } = await studiAgent.createThread(ctx, {
      userId,
      title: args.title,
    });

    await ctx.runMutation(internal.chat.createThreadRecord, {
      userId,
      threadId,
      title: args.title,
      lastMessageAt: Date.now(),
    });

    return threadId;
  },
});

export const sendFirstMessage = action({
  args: {
    prompt: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.id("attachments"))),
    requestId: v.string(),
  },
  returns: v.object({
    threadId: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);

    const { threadId } = await studiAgent.createThread(ctx, {
      userId,
    });

    await ctx.runMutation(internal.chat.createThreadRecord, {
      userId,
      threadId,
      lastMessageAt: Date.now(),
    });

    await ctx.runMutation(api.chat.sendMessage, {
      threadId,
      prompt: args.prompt,
      attachmentIds: args.attachmentIds,
      requestId: args.requestId,
    });

    return { threadId };
  },
});

export const sendMessage = action({
  args: {
    threadId: v.string(),
    prompt: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.id("attachments"))),
    requestId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const requestId = args.requestId ?? crypto.randomUUID();

    await ctx.runMutation(api.chat.sendMessage, {
      threadId: args.threadId,
      prompt: args.prompt,
      attachmentIds: args.attachmentIds,
      requestId,
    });

    return null;
  },
});

export const generateAssistantReply = internalAction({
  args: {
    threadId: v.string(),
    userId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.chat.assertThreadOwner, {
      userId: args.userId,
      threadId: args.threadId,
    });

    const labSession = await ctx.runQuery(
      internal.labs.getLabSessionByThreadForUserInternal,
      {
        userId: args.userId,
        threadId: args.threadId,
      },
    );

    const activeAgent =
      labSession && !labSession.archivedAt ? studiLabAgent : studiAgent;

    const { thread } = await activeAgent.continueThread(ctx, {
      threadId: args.threadId,
      userId: args.userId,
    });

    await thread.streamText(
      { promptMessageId: args.promptMessageId },
      {
        saveStreamDeltas: {
          chunking: "line",
          throttleMs: 120,
        },
      },
    );

    await ctx.runMutation(internal.chat.touchThread, {
      userId: args.userId,
      threadId: args.threadId,
      lastMessageAt: Date.now(),
    });

    return null;
  },
});
