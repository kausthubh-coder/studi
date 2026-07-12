"use node";

import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import type { ModelMessage } from "ai";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { api, components, internal } from "./_generated/api";
import { activeModelProfile } from "../lib/model-config";
import { sanitizeStudiModelMessages } from "../lib/agent-message-sanitizer";
import {
  getSafeModelFailureMetadata,
  isCrossProviderFallbackEligible,
  isRetriableModelFailure,
  shouldPublishModelAttemptStream,
  type SafeModelFailureMetadata,
} from "../lib/model-provider-guardrails";

const queuedSendResultValidator = v.object({
  promptMessageId: v.string(),
  deduped: v.boolean(),
});

const internalApi = internal as unknown as {
  chat: {
    cleanupFailedAssistantTurnInternal: FunctionReference<
      "mutation",
      "internal"
    >;
  };
  telemetry: {
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

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

    const { buildStudiToolset, getStudiAgentAttempts } =
      await import("./agent");
    const agentAttempts = getStudiAgentAttempts(activeModelProfile);
    if (agentAttempts.length === 0) {
      throw new Error(
        "No configured Studi text model provider. Set FREEMODEL_API_KEY or OPENROUTER_API_KEY.",
      );
    }
    const tools = buildStudiToolset(activeModelProfile);

    let lastError: unknown;
    let lastErrorRetriable = false;
    let lastFailureMetadata: SafeModelFailureMetadata = { kind: "other" };
    let attempts = 0;
    let cleanupResult: CleanupFailedAssistantTurnResult | null = null;
    let lastAttempt = agentAttempts[0];

    for (let index = 0; index < agentAttempts.length; index += 1) {
      const agentAttempt = agentAttempts[index];
      lastAttempt = agentAttempt;
      attempts = index + 1;
      try {
        const { thread } = await agentAttempt.agent.continueThread(ctx, {
          threadId: args.threadId,
          userId: args.userId,
        });

        const publishStreamDeltas = shouldPublishModelAttemptStream(
          agentAttempt.endpoint.provider,
          agentAttempts[index + 1]?.endpoint.provider,
        );
        const result = await thread.streamText(
          {
            promptMessageId: args.promptMessageId,
            tools,
            maxOutputTokens: 4000,
            prepareStep: prepareStudiStreamStep,
          },
          publishStreamDeltas
            ? {
                saveStreamDeltas: {
                  chunking: "line",
                  throttleMs: 120,
                },
              }
            : undefined,
        );
        if (!publishStreamDeltas) {
          await result.text;
        }

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
              attempts,
              model: agentAttempt.endpoint.model,
              modelProfile: activeModelProfile,
              provider: agentAttempt.endpoint.provider,
              fallbackUsed: index > 0,
            },
          },
        );
        return null;
      } catch (error) {
        lastError = error;
        lastFailureMetadata = getSafeModelFailureMetadata(error);
        const nextAttempt = agentAttempts[index + 1];
        const changesProvider =
          nextAttempt !== undefined &&
          nextAttempt.endpoint.provider !== agentAttempt.endpoint.provider;
        lastErrorRetriable = changesProvider
          ? isCrossProviderFallbackEligible(error)
          : isRetriableModelFailure(error);

        if (lastErrorRetriable && index < agentAttempts.length - 1) {
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
        errorCategory: lastFailureMetadata.kind,
        retriable: lastErrorRetriable,
        metadata: {
          attempts,
          model: lastAttempt.endpoint.model,
          meaningfulContentFound:
            cleanupResult?.meaningfulContentFound ?? false,
          failure: lastFailureMetadata,
          modelProfile: activeModelProfile,
          provider: lastAttempt.endpoint.provider,
          fallbackUsed: attempts > 1,
        },
      })
      .catch((telemetryError) => {
        console.error(
          "Failed to record assistant failure telemetry",
          telemetryError,
        );
      });

    if (lastError) {
      throw new Error(
        "Assistant generation failed after model provider attempts.",
      );
    }

    throw new Error("Assistant generation failed");
  },
});
