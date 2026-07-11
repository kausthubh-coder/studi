"use node";

import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import type { ModelMessage } from "ai";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { api, components, internal } from "./_generated/api";
import { activeModelProfile } from "../lib/model-config";
import { sanitizeStudiModelMessages } from "../lib/agent-message-sanitizer";

const queuedSendResultValidator = v.object({
  promptMessageId: v.string(),
  deduped: v.boolean(),
});

const internalApi = internal as unknown as {
  chat: {
    cleanupFailedAssistantTurnInternal: FunctionReference<"mutation", "internal">;
  };
  telemetry: {
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

const maxAssistantGenerationAttempts = 2;

type CleanupFailedAssistantTurnResult = {
  promptFound: boolean;
  meaningfulContentFound: boolean;
  retryEligible: boolean;
};

export function prepareStudiStreamStep(options: {
  messages: ModelMessage[];
  [key: string]: unknown;
}): { messages: ModelMessage[] } {
  return {
    messages: sanitizeStudiModelMessages(options.messages),
  };
}

async function requireAuthenticatedUserId(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity.subject;
}

function isRetriableAssistantGenerationError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") {
    return false;
  }

  const message = error instanceof Error ? error.message : String(error);
  return !/(?:unauthorized|thread not found)/i.test(message);
}

export const createThread = action({
  args: {
    title: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const { getStudiAgent } = await import("./agent");

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
    const { getStudiAgent } = await import("./agent");

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

export const sendMessage: ReturnType<typeof action> = action({
  args: {
    threadId: v.string(),
    prompt: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.id("attachments"))),
    requestId: v.optional(v.string()),
  },
  returns: queuedSendResultValidator,
  handler: async (ctx, args) => {
    return await ctx.runMutation(api.chat.sendMessage, {
      threadId: args.threadId,
      prompt: args.prompt,
      attachmentIds: args.attachmentIds,
      requestId: args.requestId ?? crypto.randomUUID(),
    });
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

    const { buildStudiToolset, getStudiAgent } = await import("./agent");
    const activeAgent = getStudiAgent();
    const tools = buildStudiToolset(activeModelProfile);
    const { thread } = await activeAgent.continueThread(ctx, {
      threadId: args.threadId,
      userId: args.userId,
    });

    let lastError: unknown;
    let lastErrorRetriable = false;
    let attempts = 0;
    let cleanupResult: CleanupFailedAssistantTurnResult | null = null;

    for (let attempt = 1; attempt <= maxAssistantGenerationAttempts; attempt += 1) {
      attempts = attempt;
      try {
        await thread.streamText(
          {
            promptMessageId: args.promptMessageId,
            tools,
            maxOutputTokens: 4000,
            prepareStep: prepareStudiStreamStep,
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
              attempts: attempt,
              modelProfile: activeModelProfile,
            },
          },
        );
        return null;
      } catch (error) {
        lastError = error;
        lastErrorRetriable = isRetriableAssistantGenerationError(error);

        if (
          lastErrorRetriable &&
          attempt < maxAssistantGenerationAttempts
        ) {
          try {
            cleanupResult = (await ctx.runMutation(
              internalApi.chat.cleanupFailedAssistantTurnInternal,
              {
                userId: args.userId,
                threadId: args.threadId,
                promptMessageId: args.promptMessageId,
              },
            )) as CleanupFailedAssistantTurnResult;
          } catch (cleanupError) {
            console.error(
              "Failed to clean up assistant turn before retry",
              cleanupError,
            );
            break;
          }
          if (!cleanupResult.retryEligible) {
            break;
          }
          continue;
        }

        break;
      }
    }

    if (!cleanupResult?.meaningfulContentFound) {
      try {
        cleanupResult = (await ctx.runMutation(
          internalApi.chat.cleanupFailedAssistantTurnInternal,
          {
            userId: args.userId,
            threadId: args.threadId,
            promptMessageId: args.promptMessageId,
          },
        )) as CleanupFailedAssistantTurnResult;
      } catch (cleanupError) {
        console.error(
          "Failed to clean up assistant turn before fallback",
          cleanupError,
        );
        cleanupResult = null;
      }
    }

    const durationMs = Date.now() - startedAt;
    if (cleanupResult?.promptFound && !cleanupResult.meaningfulContentFound) {
      await ctx
        .runMutation(internal.chat.saveAssistantFailureMessageInternal, {
          userId: args.userId,
          threadId: args.threadId,
          promptMessageId: args.promptMessageId,
        })
        .catch((saveError) => {
          console.error("Failed to save assistant failure message", saveError);
        });
    }
    await ctx
      .runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
        userId: args.userId,
        threadId: args.threadId,
        source: "agent_runtime",
        name: "generate_assistant_reply",
        status: "failed",
        durationMs,
        errorCategory: "runtime_error",
        retriable: lastErrorRetriable,
        metadata: {
          attempts,
          meaningfulContentFound:
            cleanupResult?.meaningfulContentFound ?? false,
          error: lastError instanceof Error ? lastError.message : String(lastError),
          modelProfile: activeModelProfile,
        },
      })
      .catch((telemetryError) => {
        console.error(
          "Failed to record assistant failure telemetry",
          telemetryError,
        );
      });

    if (lastError) {
      throw lastError;
    }

    throw new Error("Assistant generation failed");
  },
});
