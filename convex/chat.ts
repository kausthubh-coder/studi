import {
  abortStream,
  listUIMessages,
  listStreams,
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
  type MutationCtx,
} from "./_generated/server";

const internalApi = internal as unknown as {
  billing: {
    assertCanSendMessageInternal: FunctionReference<"mutation", "internal">;
    assertCanUseAttachmentsInternal: FunctionReference<"mutation", "internal">;
    incrementFreeOnboardingUsageInternal: FunctionReference<"mutation", "internal">;
    recordTextAiCostInternal: FunctionReference<"mutation", "internal">;
  };
  chat: {
    continueDeleteThreadCodeSparksInternal: FunctionReference<
      "mutation",
      "internal"
    >;
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

const cleanupFailedAssistantTurnResultValidator = v.object({
  promptFound: v.boolean(),
  deletedMessages: v.number(),
  deletedStreams: v.number(),
  meaningfulContentFound: v.boolean(),
  retryEligible: v.boolean(),
  visibleAssistantTextFound: v.boolean(),
  visibleToolContentFound: v.boolean(),
});

const assistantGenerationFailureText =
  "I hit a snag while generating that reply. Please try again in a moment.";
const assistantGenerationCanceledText =
  "You stopped this response. Ask a follow-up whenever you're ready.";
const assistantGenerationLeaseMs = 15 * 60 * 1000;

const generationStateValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("cancel_requested"),
);

const generationControlValidator = v.union(
  v.null(),
  v.object({
    order: v.number(),
    state: generationStateValidator,
  }),
);

function truncateTitle(value: string): string {
  return value.length > 60 ? `${value.slice(0, 60)}...` : value;
}

function hasVisibleText(message: { text?: string }): boolean {
  return typeof message.text === "string" && message.text.trim().length > 0;
}

function hasMeaningfulContent(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.some((part) => hasMeaningfulContent(part));
  }

  if (typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text.trim().length > 0;
  }
  if (record.type === "tool-call") {
    // A tool call is only an intent to produce something. Until a tool result
    // or visible assistant text exists, a failed turn is still retryable.
    return false;
  }
  if (record.isError === true) {
    return true;
  }

  for (const key of ["output", "result", "value", "experimental_content"]) {
    if (key in record && hasMeaningfulContent(record[key])) {
      return true;
    }
  }

  for (const key of ["data", "image", "url"]) {
    if (!(key in record)) {
      continue;
    }
    const content = record[key];
    if (typeof content === "string") {
      return content.trim().length > 0;
    }
    if (content !== null && content !== undefined) {
      return true;
    }
  }

  const metadataOnlyKeys = new Set([
    "type",
    "toolCallId",
    "toolName",
    "providerExecuted",
    "providerMetadata",
    "providerOptions",
  ]);
  return Object.entries(record).some(([key, child]) => {
    return !metadataOnlyKeys.has(key) && hasMeaningfulContent(child);
  });
}

function hasMeaningfulAssistantOrToolContent(message: {
  text?: string;
  message?: { role?: string; content?: unknown };
}): boolean {
  if (message.message?.role === "assistant") {
    return hasVisibleText(message) || hasMeaningfulContent(message.message.content);
  }

  if (message.message?.role === "tool") {
    return hasMeaningfulContent(message.message.content);
  }

  return false;
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
    const { messageId, message: promptMessage } = await saveMessage(
      ctx,
      components.agent,
      {
        threadId: args.threadId,
        userId: identity.subject,
        message: {
          role: "user",
          content,
        },
      },
    );

    await ctx.db.patch(ownedThread._id, {
      lastMessageAt: now,
      title:
        prompt && (!ownedThread.title || ownedThread.title === "New Thread")
          ? truncateTitle(prompt)
          : ownedThread.title,
      lastRequestId: args.requestId,
      lastPromptMessageId: messageId,
      activeGenerations: [
        ...(ownedThread.activeGenerations ?? []),
        {
          promptMessageId: messageId,
          order: promptMessage.order,
          state: "queued",
          createdAt: now,
          expiresAt: now + assistantGenerationLeaseMs,
        },
      ],
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
    await ctx.scheduler.runAfter(
      assistantGenerationLeaseMs,
      internal.chat.expireAssistantGenerationInternal,
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

export const cancelGeneration = mutation({
  args: {
    threadId: v.string(),
  },
  returns: v.object({ stopped: v.boolean() }),
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

    const activeGenerations = ownedThread.activeGenerations ?? [];
    if (activeGenerations.length === 0) {
      throw new Error("The response finished before it could be stopped.");
    }

    const activeOrders = new Set(
      activeGenerations.map((generation) => generation.order),
    );
    const streams = await listStreams(ctx, components.agent, {
      threadId: args.threadId,
      startOrder: Math.min(...activeOrders),
      includeStatuses: ["streaming"],
    });
    const activeStreams = streams.filter((stream) =>
      activeOrders.has(stream.order),
    );
    if (activeStreams.length === 0) {
      throw new Error(
        "The response is not ready to stop yet. Try again in a moment.",
      );
    }

    let stopped = false;
    for (const stream of activeStreams) {
      stopped =
        (await abortStream(ctx, components.agent, {
          streamId: stream.streamId,
          reason: "learner_requested_stop",
        })) || stopped;
    }
    if (!stopped) {
      throw new Error("The response finished before it could be stopped.");
    }

    await ctx.db.patch(ownedThread._id, {
      activeGenerations: activeGenerations.map((generation) => ({
        ...generation,
        state: "cancel_requested" as const,
        cancelRequestedAt: Date.now(),
      })),
    });
    return { stopped: true };
  },
});

export const beginAssistantGenerationInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const ownedThread = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();
    if (!ownedThread) throw new Error("Thread not found");
    const generationIndex = (ownedThread.activeGenerations ?? []).findIndex(
      (generation) => generation.promptMessageId === args.promptMessageId,
    );
    if (generationIndex < 0) {
      return false;
    }
    const generation = ownedThread.activeGenerations![generationIndex]!;
    if (generation.state === "cancel_requested") return false;
    const activeGenerations = [...ownedThread.activeGenerations!];
    activeGenerations[generationIndex] = {
      ...generation,
      state: "running",
    };
    await ctx.db.patch(ownedThread._id, {
      activeGenerations,
    });
    return true;
  },
});

export const getGenerationControlInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: generationControlValidator,
  handler: async (ctx, args) => {
    const ownedThread = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();
    const activeGeneration = ownedThread?.activeGenerations?.find(
      (generation) => generation.promptMessageId === args.promptMessageId,
    );
    if (!activeGeneration) {
      return null;
    }
    return {
      order: activeGeneration.order,
      state: activeGeneration.state,
    };
  },
});

export const completeAssistantGenerationInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownedThread = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();
    if (ownedThread?.activeGenerations) {
      const remainingGenerations = ownedThread.activeGenerations.filter(
        (generation) => generation.promptMessageId !== args.promptMessageId,
      );
      if (
        remainingGenerations.length !== ownedThread.activeGenerations.length
      ) {
        await ctx.db.patch(ownedThread._id, {
          activeGenerations:
            remainingGenerations.length > 0 ? remainingGenerations : undefined,
        });
      }
    }
    return null;
  },
});

export const expireAssistantGenerationInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownedThread = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();
    const generation = ownedThread?.activeGenerations?.find(
      (candidate) => candidate.promptMessageId === args.promptMessageId,
    );
    if (!ownedThread || !generation || generation.expiresAt > Date.now()) {
      return null;
    }

    const streams = await listStreams(ctx, components.agent, {
      threadId: args.threadId,
      startOrder: generation.order,
      includeStatuses: ["streaming"],
    });
    for (const stream of streams) {
      if (stream.order !== generation.order) continue;
      await abortStream(ctx, components.agent, {
        streamId: stream.streamId,
        reason: "generation_lease_expired",
      });
    }

    const remainingGenerations = ownedThread.activeGenerations!.filter(
      (candidate) => candidate.promptMessageId !== args.promptMessageId,
    );
    await ctx.db.patch(ownedThread._id, {
      activeGenerations:
        remainingGenerations.length > 0 ? remainingGenerations : undefined,
    });
    return null;
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

async function cleanupFailedAssistantTurnState(
  ctx: MutationCtx,
  args: {
    userId: string;
    threadId: string;
    promptMessageId: string;
  },
): Promise<{
  promptFound: boolean;
  deletedMessages: number;
  deletedStreams: number;
  meaningfulContentFound: boolean;
  retryEligible: boolean;
  visibleAssistantTextFound: boolean;
  visibleToolContentFound: boolean;
}> {
  const ownedThread = await ctx.db
    .query("userThreads")
    .withIndex("by_userId_and_threadId", (q) =>
      q.eq("userId", args.userId).eq("threadId", args.threadId),
    )
    .unique();

  if (!ownedThread) {
    throw new Error("Thread not found");
  }

  const [promptMessage] = await ctx.runQuery(
    components.agent.messages.getMessagesByIds,
    {
      messageIds: [args.promptMessageId],
    },
  );

  if (
    !promptMessage ||
    promptMessage.threadId !== args.threadId ||
    promptMessage.message?.role !== "user"
  ) {
    return {
      promptFound: false,
      deletedMessages: 0,
      deletedStreams: 0,
      meaningfulContentFound: false,
      retryEligible: false,
      visibleAssistantTextFound: false,
      visibleToolContentFound: false,
    };
  }

  const promptTurnMessages = await ctx.runQuery(
    components.agent.messages.listMessagesByThreadId,
    {
      threadId: args.threadId,
      order: "desc",
      statuses: ["pending", "success", "failed"],
      upToAndIncludingMessageId: args.promptMessageId,
      paginationOpts: {
        cursor: null,
        numItems: 256,
      },
    },
  );

  const samePromptTurnMessages = promptTurnMessages.page.filter(
    (message) => message.order === promptMessage.order,
  );
  const visibleAssistantTextFound = samePromptTurnMessages.some((message) => {
    return message.message?.role === "assistant" && hasVisibleText(message);
  });
  const visibleToolContentFound = samePromptTurnMessages.some((message) => {
    return (
      message.message?.role === "tool" &&
      hasMeaningfulContent(message.message.content)
    );
  });
  const meaningfulContentFound = samePromptTurnMessages.some((message) => {
    return hasMeaningfulAssistantOrToolContent(message);
  });
  const emptyAssistantMessageIds = samePromptTurnMessages
    .filter((message) => {
      return (
        message.message?.role === "assistant" &&
        (message.status === "pending" || message.status === "failed") &&
        !hasVisibleText(message) &&
        !hasMeaningfulContent(message.message.content)
      );
    })
    .map((message) => message._id);

  if (emptyAssistantMessageIds.length > 0) {
    await ctx.runMutation(components.agent.messages.deleteByIds, {
      messageIds: emptyAssistantMessageIds,
    });
  }

  let deletedStreams = 0;
  if (emptyAssistantMessageIds.length > 0 && !meaningfulContentFound) {
    const promptStreams = await ctx.runQuery(components.agent.streams.list, {
      threadId: args.threadId,
      startOrder: promptMessage.order,
      statuses: ["streaming", "finished", "aborted"],
    });

    for (const stream of promptStreams) {
      if (stream.order !== promptMessage.order) {
        continue;
      }
      await ctx.runMutation(components.agent.streams.deleteStreamSync, {
        streamId: stream.streamId,
      });
      deletedStreams += 1;
    }
  }

  return {
    promptFound: true,
    deletedMessages: emptyAssistantMessageIds.length,
    deletedStreams,
    meaningfulContentFound,
    retryEligible: !meaningfulContentFound,
    visibleAssistantTextFound,
    visibleToolContentFound,
  };
}

export const cleanupFailedAssistantTurnInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: cleanupFailedAssistantTurnResultValidator,
  handler: async (ctx, args) => {
    return await cleanupFailedAssistantTurnState(ctx, args);
  },
});

export const saveAssistantFailureMessageInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cleanupResult = await cleanupFailedAssistantTurnState(ctx, args);

    if (!cleanupResult.promptFound || cleanupResult.meaningfulContentFound) {
      return null;
    }

    const ownedThread = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (!ownedThread) {
      throw new Error("Thread not found");
    }

    await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      userId: args.userId,
      promptMessageId: args.promptMessageId,
      message: {
        role: "assistant",
        content: assistantGenerationFailureText,
      },
    });

    await ctx.db.patch(ownedThread._id, {
      lastMessageAt: Date.now(),
    });
    return null;
  },
});

export const saveAssistantCancellationMessageInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cleanupResult = await cleanupFailedAssistantTurnState(ctx, args);
    if (!cleanupResult.promptFound || cleanupResult.meaningfulContentFound) {
      return null;
    }

    const ownedThread = await ctx.db
      .query("userThreads")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();
    if (!ownedThread) throw new Error("Thread not found");

    await saveMessage(ctx, components.agent, {
      threadId: args.threadId,
      userId: args.userId,
      promptMessageId: args.promptMessageId,
      message: {
        role: "assistant",
        content: assistantGenerationCanceledText,
      },
    });
    await ctx.db.patch(ownedThread._id, { lastMessageAt: Date.now() });
    return null;
  },
});

const codeSparkSessionsPerDeleteBatch = 4;
const codeSparkRowsPerDeleteBatch = 64;

async function deleteCodeSparkThreadBatch(
  ctx: MutationCtx,
  args: { userId: string; threadId: string },
) {
  const sessions = await ctx.db
    .query("codeSparkSessions")
    .withIndex("by_userId_and_threadId", (q) =>
      q.eq("userId", args.userId).eq("threadId", args.threadId),
    )
    .take(codeSparkSessionsPerDeleteBatch);

  for (const session of sessions) {
    const [files, checks, runs] = await Promise.all([
      ctx.db
        .query("codeSparkFiles")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
        .take(codeSparkRowsPerDeleteBatch),
      ctx.db
        .query("codeSparkChecks")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
        .take(codeSparkRowsPerDeleteBatch),
      ctx.db
        .query("codeSparkRuns")
        .withIndex("by_sessionId_and_createdAt", (q) =>
          q.eq("sessionId", session._id),
        )
        .take(codeSparkRowsPerDeleteBatch),
    ]);
    for (const row of [...files, ...checks, ...runs]) {
      await ctx.db.delete(row._id);
    }

    const [remainingFile, remainingCheck, remainingRun] = await Promise.all([
      ctx.db
        .query("codeSparkFiles")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
        .first(),
      ctx.db
        .query("codeSparkChecks")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
        .first(),
      ctx.db
        .query("codeSparkRuns")
        .withIndex("by_sessionId_and_createdAt", (q) =>
          q.eq("sessionId", session._id),
        )
        .first(),
    ]);
    if (!remainingFile && !remainingCheck && !remainingRun) {
      await ctx.db.delete(session._id);
    }
  }

  // Admission and operational-usage rows are deliberately user-global and
  // survive thread deletion until their independent bounded-retention cleanup.
  // Deleting them here would let a learner reset the active admission window.
  const remainingSession = await ctx.db
    .query("codeSparkSessions")
    .withIndex("by_userId_and_threadId", (q) =>
      q.eq("userId", args.userId).eq("threadId", args.threadId),
    )
    .first();

  return Boolean(remainingSession);
}

export const continueDeleteThreadCodeSparksInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hasMore = await deleteCodeSparkThreadBatch(ctx, args);
    if (hasMore) {
      await ctx.scheduler.runAfter(
        0,
        internalApi.chat.continueDeleteThreadCodeSparksInternal,
        args,
      );
    }
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

    const hasMoreCodeSparkData = await deleteCodeSparkThreadBatch(ctx, args);
    await ctx.db.delete(thread._id);
    if (hasMoreCodeSparkData) {
      await ctx.scheduler.runAfter(
        0,
        internalApi.chat.continueDeleteThreadCodeSparksInternal,
        args,
      );
    }
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
