"use node";

import { v } from "convex/values";
import { abortStream, listStreams } from "@convex-dev/agent";
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

const maxAssistantGenerationAttempts = 2;

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
  if (!currentStream) {
    return false;
  }

  await abortComponentStream(currentStream.streamId);
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
    if (!initialControl) return null;

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
      let wasCanceled = false;

      for (
        let attempt = 1;
        attempt <= maxAssistantGenerationAttempts;
        attempt += 1
      ) {
        attempts = attempt;
        try {
          await thread.streamText(
            {
              promptMessageId: args.promptMessageId,
              tools,
              maxOutputTokens: 4000,
              prepareStep: prepareStudiStreamStep,
              abortSignal: generationAbortController.signal,
            },
            {
              saveStreamDeltas: {
                chunking: "line",
                throttleMs: 120,
              },
            },
          );

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
          const generationControl = (await ctx.runQuery(
            internalApi.chat.getGenerationControlInternal,
            {
              userId: args.userId,
              threadId: args.threadId,
              promptMessageId: args.promptMessageId,
            },
          )) as GenerationControl;
          wasCanceled = generationControl?.state === "cancel_requested";
          lastErrorRetriable =
            !wasCanceled && isRetriableAssistantGenerationError(error);

          if (lastErrorRetriable && attempt < maxAssistantGenerationAttempts) {
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
              modelProfile: activeModelProfile,
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
          errorCategory: "runtime_error",
          retriable: lastErrorRetriable,
          metadata: {
            attempts,
            meaningfulContentFound:
              cleanupResult?.meaningfulContentFound ?? false,
            error:
              lastError instanceof Error
                ? lastError.message
                : String(lastError),
            modelProfile: activeModelProfile,
          },
        })
        .catch((telemetryError) => {
          console.error(
            "Failed to record assistant failure telemetry",
            telemetryError,
          );
        });

      if (lastError) throw lastError;
      throw new Error("Assistant generation failed");
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
