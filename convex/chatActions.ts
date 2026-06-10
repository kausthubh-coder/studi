"use node";

import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { api, components, internal } from "./_generated/api";
import { activeModelProfile } from "../lib/model-config";
import { buildStudiToolset, getStudiAgent } from "./agent";

const internalApi = internal as unknown as {
  telemetry: {
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

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

    const { threadId } = await getStudiAgent().createThread(ctx, {
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

    const { threadId } = await getStudiAgent().createThread(ctx, { userId });

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
    await ctx.runMutation(api.chat.sendMessage, {
      threadId: args.threadId,
      prompt: args.prompt,
      attachmentIds: args.attachmentIds,
      requestId: args.requestId ?? crypto.randomUUID(),
    });

    return null;
  },
});

export const deleteThread: ReturnType<typeof action> = action({
  args: {
    threadId: v.string(),
  },
  returns: v.object({
    deleted: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{ deleted: boolean }> => {
    const userId = await requireAuthenticatedUserId(ctx);

    await ctx.runQuery(internal.chat.assertThreadOwner, {
      userId,
      threadId: args.threadId,
    });

    const thread = await ctx.runQuery(components.agent.threads.getThread, {
      threadId: args.threadId,
    });
    if (thread) {
      await ctx.runAction(components.agent.threads.deleteAllForThreadIdSync, {
        threadId: args.threadId,
      });
    }

    const deleted: boolean = await ctx.runMutation(
      internal.chat.deleteThreadRecordInternal,
      {
        userId,
        threadId: args.threadId,
      },
    );

    return { deleted };
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
    const startedAt = Date.now();

    await ctx.runQuery(internal.chat.assertThreadOwner, {
      userId: args.userId,
      threadId: args.threadId,
    });

    const activeAgent = getStudiAgent();
    const tools = buildStudiToolset(activeModelProfile);

    try {
      const { thread } = await activeAgent.continueThread(ctx, {
        threadId: args.threadId,
        userId: args.userId,
      });

      await thread.streamText(
        {
          promptMessageId: args.promptMessageId,
          tools,
          maxOutputTokens: 4000,
        },
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

      const durationMs = Date.now() - startedAt;
      await ctx.runMutation(
        internalApi.telemetry.insertTelemetryEventInternal,
        {
          userId: args.userId,
          threadId: args.threadId,
          source: "agent_runtime",
          name: "generate_assistant_reply",
          status: "success",
          durationMs,
          metadata: {
            modelProfile: activeModelProfile,
          },
        },
      );
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      await ctx.runMutation(
        internalApi.telemetry.insertTelemetryEventInternal,
        {
          userId: args.userId,
          threadId: args.threadId,
          source: "agent_runtime",
          name: "generate_assistant_reply",
          status: "failed",
          durationMs,
          errorCategory: "runtime_error",
          retriable: true,
          metadata: {
            error: error instanceof Error ? error.message : String(error),
            modelProfile: activeModelProfile,
          },
        },
      );

      throw error;
    }

    return null;
  },
});
