"use node";

import { v } from "convex/values";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { studiAgent } from "./agent";

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

export const sendMessage = action({
  args: {
    threadId: v.string(),
    prompt: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.id("attachments"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const prompt = args.prompt?.trim() ?? "";
    const attachmentIds = args.attachmentIds ?? [];

    if (!prompt && attachmentIds.length === 0) {
      throw new Error("Message cannot be empty");
    }

    await ctx.runQuery(internal.chat.assertThreadOwner, {
      userId,
      threadId: args.threadId,
    });

    const attachments = await ctx.runQuery(internal.chat.resolveAttachments, {
      userId,
      attachmentIds,
    });

    await ctx.runMutation(internal.chat.touchThread, {
      userId,
      threadId: args.threadId,
      lastMessageAt: Date.now(),
    });

    if (prompt) {
      const title = prompt.length > 60 ? prompt.slice(0, 60) + "…" : prompt;
      await ctx.runMutation(internal.chat.updateThreadTitle, {
        userId,
        threadId: args.threadId,
        title,
      });
    }

    const { thread } = await studiAgent.continueThread(ctx, {
      threadId: args.threadId,
      userId,
    });

    if (attachments.length === 0) {
      await thread.streamText(
        { prompt },
        {
          saveStreamDeltas: {
            chunking: "line",
            throttleMs: 120,
          },
        },
      );
    } else {
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

      await thread.streamText(
        {
          messages: [{ role: "user", content }],
        },
        {
          saveStreamDeltas: {
            chunking: "line",
            throttleMs: 120,
          },
        },
      );
    }

    await ctx.runMutation(internal.chat.touchThread, {
      userId,
      threadId: args.threadId,
      lastMessageAt: Date.now(),
    });

    return null;
  },
});
