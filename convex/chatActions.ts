"use node";

import { v } from "convex/values";
import { abortStream, listStreams } from "@convex-dev/agent";
import type { FunctionReference } from "convex/server";
import { NoOutputGeneratedError, type ModelMessage } from "ai";
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
    beginAssistantGenerationInternal: FunctionReference<"mutation", "internal">;
    completeAssistantGenerationInternal: FunctionReference<
      "mutation",
      "internal"
    >;
    cleanupFailedAssistantTurnInternal: FunctionReference<
      "mutation",
      "internal"
    >;
    getGenerationControlInternal: FunctionReference<"query", "internal">;
    saveAssistantCancellationMessageInternal: FunctionReference<
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

type GenerationControl = {
  order: number;
  state: "queued" | "running" | "cancel_requested";
} | null;

type GenerationStream = {
  streamId: string;
  order: number;
  status: "streaming" | "finished" | "aborted";
};

export async function pollGenerationCancellation({
  abortController,
  order,
  readControl,
  listStreams: readStreams,
  abortComponentStream,
}: {
  abortController: AbortController;
  order: number;
  readControl: () => Promise<GenerationControl>;
  listStreams: () => Promise<GenerationStream[]>;
  abortComponentStream: (streamId: string) => Promise<boolean>;
}): Promise<boolean> {
  if (abortController.signal.aborted) return true;
  const control = await readControl();
  if (!control) {
    abortController.abort(
      new DOMException("Generation control expired", "AbortError"),
    );
    return true;
  }
  if (control.state !== "cancel_requested" || control.order !== order) {
    return false;
  }

  const currentStream = (await readStreams()).find(
    (stream) => stream.order === order,
  );
  if (currentStream) {
    await abortComponentStream(currentStream.streamId);
  }

  abortController.abort(
    new DOMException("Learner stopped response generation", "AbortError"),
  );
  return true;
}

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

export function getAssistantGenerationFailureMetadata(
  error: unknown,
): SafeModelFailureMetadata {
  return getSafeModelFailureMetadata(error);
}

export function createAssistantGenerationFailureError(): Error {
  return new Error(
    "Assistant generation failed after model provider attempts.",
  );
}

export function shouldRetryAssistantGeneration(
  error: unknown,
  cancellationRequested: boolean,
): boolean {
  return (
    !cancellationRequested &&
    getAssistantGenerationFailureMetadata(error).kind !== "cancelled"
  );
}

type AssistantGenerationStepSummary = {
  text?: unknown;
  toolResults?: readonly unknown[];
};

export function hasMeaningfulAssistantGenerationSteps(
  steps: readonly AssistantGenerationStepSummary[],
): boolean {
  return steps.some(
    (step) =>
      (typeof step.text === "string" && step.text.trim().length > 0) ||
      (Array.isArray(step.toolResults) && step.toolResults.length > 0),
  );
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

    const generationStarted = await ctx.runMutation(
      internalApi.chat.beginAssistantGenerationInternal,
      {
        userId: args.userId,
        threadId: args.threadId,
        promptMessageId: args.promptMessageId,
      },
    );
    const initialControl = (await ctx.runQuery(
      internalApi.chat.getGenerationControlInternal,
      {
        userId: args.userId,
        threadId: args.threadId,
        promptMessageId: args.promptMessageId,
      },
    )) as GenerationControl;
    if (!generationStarted || initialControl?.state === "cancel_requested") {
      if (initialControl?.state === "cancel_requested") {
        await ctx.runMutation(
          internalApi.chat.saveAssistantCancellationMessageInternal,
          {
            userId: args.userId,
            threadId: args.threadId,
            promptMessageId: args.promptMessageId,
          },
        );
      }
      await ctx.runMutation(
        internalApi.chat.completeAssistantGenerationInternal,
        {
          userId: args.userId,
          threadId: args.threadId,
          promptMessageId: args.promptMessageId,
        },
      );
      return null;
    }
    if (!initialControl) {
      await ctx.runMutation(
        internalApi.chat.completeAssistantGenerationInternal,
        {
          userId: args.userId,
          threadId: args.threadId,
          promptMessageId: args.promptMessageId,
        },
      );
      return null;
    }

    const generationAbortController = new AbortController();
    let cancellationPollInFlight = false;
    const pollForCancellation = async () => {
      if (
        cancellationPollInFlight ||
        generationAbortController.signal.aborted
      ) {
        return;
      }
      cancellationPollInFlight = true;
      try {
        await pollGenerationCancellation({
          abortController: generationAbortController,
          order: initialControl.order,
          readControl: async () =>
            (await ctx.runQuery(internalApi.chat.getGenerationControlInternal, {
              userId: args.userId,
              threadId: args.threadId,
              promptMessageId: args.promptMessageId,
            })) as GenerationControl,
          listStreams: async () =>
            await listStreams(ctx, components.agent, {
              threadId: args.threadId,
              startOrder: initialControl.order,
              includeStatuses: ["streaming", "aborted"],
            }),
          abortComponentStream: async (streamId) =>
            await abortStream(ctx, components.agent, {
              streamId,
              reason: "learner_requested_stop",
            }),
        });
      } catch (error) {
        console.error("Failed to propagate generation cancellation", error);
      } finally {
        cancellationPollInFlight = false;
      }
    };
    const cancellationPoll = setInterval(() => {
      void pollForCancellation();
    }, 1000);

    try {
      const { buildStudiToolset, getStudiAgentAttempts } =
        await import("./agent");
      const agentAttempts = getStudiAgentAttempts(activeModelProfile);
      const firstAttempt = agentAttempts[0];
      if (!firstAttempt) {
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
      let wasCanceled = false;
      let lastAttempt = firstAttempt;

      for (let index = 0; index < agentAttempts.length; index += 1) {
        const agentAttempt = agentAttempts[index];
        if (!agentAttempt) continue;
        lastAttempt = agentAttempt;
        attempts = index + 1;
        try {
          const controlBeforeAttempt = (await ctx.runQuery(
            internalApi.chat.getGenerationControlInternal,
            {
              userId: args.userId,
              threadId: args.threadId,
              promptMessageId: args.promptMessageId,
            },
          )) as GenerationControl;
          if (!controlBeforeAttempt) {
            throw new DOMException(
              "Generation control expired",
              "AbortError",
            );
          }
          if (controlBeforeAttempt.state === "cancel_requested") {
            throw new DOMException(
              "Learner stopped response generation",
              "AbortError",
            );
          }

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
              abortSignal: generationAbortController.signal,
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
          const completedSteps = await result.steps;
          if (!hasMeaningfulAssistantGenerationSteps(completedSteps)) {
            throw new NoOutputGeneratedError({
              message: "The model provider completed without learner-visible output.",
            });
          }

          const controlAfterStream = (await ctx.runQuery(
            internalApi.chat.getGenerationControlInternal,
            {
              userId: args.userId,
              threadId: args.threadId,
              promptMessageId: args.promptMessageId,
            },
          )) as GenerationControl;
          if (controlAfterStream?.state === "cancel_requested") {
            throw new DOMException(
              "Learner stopped response generation",
              "AbortError",
            );
          }
          if (!controlAfterStream) {
            throw new DOMException(
              "Generation control expired",
              "AbortError",
            );
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
          lastFailureMetadata = getAssistantGenerationFailureMetadata(error);
          const generationControl = (await ctx.runQuery(
            internalApi.chat.getGenerationControlInternal,
            {
              userId: args.userId,
              threadId: args.threadId,
              promptMessageId: args.promptMessageId,
            },
          )) as GenerationControl;
          wasCanceled = generationControl?.state === "cancel_requested";
          const nextAttempt = agentAttempts[index + 1];
          const changesProvider =
            nextAttempt !== undefined &&
            nextAttempt.endpoint.provider !== agentAttempt.endpoint.provider;
          const providerRetryEligible = changesProvider
            ? isCrossProviderFallbackEligible(error)
            : isRetriableModelFailure(error);
          lastErrorRetriable =
            shouldRetryAssistantGeneration(error, wasCanceled) &&
            providerRetryEligible;

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
            if (!cleanupResult.retryEligible) break;

            const controlBeforeRetry = (await ctx.runQuery(
              internalApi.chat.getGenerationControlInternal,
              {
                userId: args.userId,
                threadId: args.threadId,
                promptMessageId: args.promptMessageId,
              },
            )) as GenerationControl;
            if (controlBeforeRetry?.state === "cancel_requested") {
              wasCanceled = true;
              lastErrorRetriable = false;
              break;
            }
            if (!controlBeforeRetry) {
              lastError = new DOMException(
                "Generation control expired",
                "AbortError",
              );
              lastFailureMetadata =
                getAssistantGenerationFailureMetadata(lastError);
              lastErrorRetriable = false;
              break;
            }
            continue;
          }

          break;
        }
      }

      const durationMs = Date.now() - startedAt;
      if (wasCanceled) {
        await ctx
          .runMutation(
            internalApi.chat.saveAssistantCancellationMessageInternal,
            {
              userId: args.userId,
              threadId: args.threadId,
              promptMessageId: args.promptMessageId,
            },
          )
          .catch((saveError) => {
            console.error("Failed to save cancellation message", saveError);
          });
        await ctx
          .runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
            userId: args.userId,
            threadId: args.threadId,
            source: "agent_runtime",
            name: "generate_assistant_reply",
            status: "failed",
            durationMs,
            errorCategory: "user_cancel",
            retriable: false,
            metadata: {
              attempts,
              model: lastAttempt.endpoint.model,
              modelProfile: activeModelProfile,
              provider: lastAttempt.endpoint.provider,
              fallbackUsed: attempts > 1,
            },
          })
          .catch((telemetryError) => {
            console.error(
              "Failed to record generation cancellation telemetry",
              telemetryError,
            );
          });
        return null;
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

      if (cleanupResult?.promptFound && !cleanupResult.meaningfulContentFound) {
        await ctx
          .runMutation(internal.chat.saveAssistantFailureMessageInternal, {
            userId: args.userId,
            threadId: args.threadId,
            promptMessageId: args.promptMessageId,
          })
          .catch((saveError) => {
            console.error(
              "Failed to save assistant failure message",
              saveError,
            );
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

      throw createAssistantGenerationFailureError();
    } finally {
      clearInterval(cancellationPoll);
      await ctx.runMutation(
        internalApi.chat.completeAssistantGenerationInternal,
        {
          userId: args.userId,
          threadId: args.threadId,
          promptMessageId: args.promptMessageId,
        },
      );
    }
  },
});
