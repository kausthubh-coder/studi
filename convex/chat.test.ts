import { convexTest } from "convex-test";
import { register as registerAgent } from "@convex-dev/agent/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import type { FunctionReference } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const internalTestApi = internal as unknown as {
  chat: {
    beginAssistantGenerationInternal: FunctionReference<"mutation", "internal">;
    completeAssistantGenerationInternal: FunctionReference<"mutation", "internal">;
    cleanupFailedAssistantTurnInternal: FunctionReference<"mutation", "internal">;
    deleteThreadRecordInternal: FunctionReference<"mutation", "internal">;
    expireAssistantGenerationInternal: FunctionReference<"mutation", "internal">;
    getGenerationControlInternal: FunctionReference<"query", "internal">;
    saveAssistantCancellationMessageInternal: FunctionReference<"mutation", "internal">;
  };
};

function testConvex() {
  const t = convexTest(schema, modules);
  registerAgent(t);
  registerRateLimiter(t);
  return t;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("chat Convex auth and ownership", () => {
  it("does not expose threads to unauthenticated users", async () => {
    const t = testConvex();

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Private thread",
      lastMessageAt: 1,
    });

    await expect(t.query(api.chat.listThreads, {})).resolves.toEqual([]);
  });

  it("lists only the authenticated user's thread records", async () => {
    const t = testConvex();

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Algebra",
      lastMessageAt: 10,
    });
    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_b",
      threadId: "thread_b",
      title: "Geometry",
      lastMessageAt: 20,
    });

    const threads = await t
      .withIdentity({ subject: "user_a" })
      .query(api.chat.listThreads, {});

    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      threadId: "thread_a",
      title: "Algebra",
    });
  });

  it("rejects protected message and billing operations without auth", async () => {
    const t = testConvex();

    await expect(
      t.mutation(api.chat.sendMessage, {
        threadId: "thread_a",
        prompt: "Hello",
        requestId: "request_a",
      }),
    ).rejects.toThrow("Unauthorized");

    await expect(
      t.mutation(api.chat.cancelGeneration, { threadId: "thread_a" }),
    ).rejects.toThrow("Unauthorized");

    await expect(t.query(api.billing.getViewerBillingState, {})).rejects.toThrow(
      "Unauthorized",
    );
  });

  it("blocks free uploads and allows paid attachment usage", async () => {
    const t = testConvex();

    const freeState = await t
      .withIdentity({ subject: "free_user" })
      .query(api.billing.getViewerBillingState, {});

    expect(freeState.lockedSurfaces.chat).toBe(false);
    expect(freeState.lockedSurfaces.attachments).toBe(true);

    await expect(
      t.mutation(internal.billing.assertCanUseAttachmentsInternal, {
        userId: "free_user",
      }),
    ).rejects.toThrow("Uploads are available on paid plans only.");

    await t.mutation(internal.billing.syncBillingProfileInternal, {
      userId: "paid_user",
      planKey: "intro",
      status: "active",
    });

    await expect(
      t.mutation(internal.billing.assertCanUseAttachmentsInternal, {
        userId: "paid_user",
      }),
    ).resolves.toMatchObject({
      planKey: "intro",
      status: "active",
    });
  });

  it("fails chat and both attachment upload stages closed for past-due plans", async () => {
    const t = testConvex();
    const ownedThread = await t.mutation(components.agent.threads.createThread, {
      userId: "past_due_user",
      title: "Owned",
    });
    await t.mutation(internal.chat.createThreadRecord, {
      userId: "past_due_user",
      threadId: ownedThread._id,
      title: "Owned",
      lastMessageAt: 1,
    });
    await t.mutation(internal.billing.syncBillingProfileInternal, {
      userId: "past_due_user",
      planKey: "intro",
      status: "past_due",
    });
    const storageId = await t.run(async (ctx) =>
      ctx.storage.store(new Blob(["diagram"], { type: "text/plain" })),
    );
    const authed = t.withIdentity({ subject: "past_due_user" });

    await expect(authed.mutation(api.chat.generateUploadUrl, {})).rejects.toThrow(
      "Uploads require an active paid plan.",
    );
    await expect(
      authed.mutation(api.chat.saveAttachment, {
        storageId,
        filename: "diagram.txt",
        mimeType: "text/plain",
        size: 7,
      }),
    ).rejects.toThrow("Uploads require an active paid plan.");
    await expect(
      authed.mutation(api.chat.sendMessage, {
        threadId: ownedThread._id,
        prompt: "Explain this diagram",
        requestId: "past_due_request",
      }),
    ).rejects.toThrow("Text tutoring requires an active paid plan.");

    const persisted = await t.run(async (ctx) => ({
      attachments: await ctx.db.query("attachments").collect(),
      receipts: await ctx.db.query("chatRequestReceipts").collect(),
    }));
    expect(persisted).toEqual({ attachments: [], receipts: [] });
  });

  it("enforces thread ownership helper boundaries", async () => {
    const t = testConvex();

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Owned",
      lastMessageAt: 1,
    });

    await expect(
      t.query(internal.chat.assertThreadOwner, {
        userId: "user_a",
        threadId: "thread_a",
      }),
    ).resolves.toBeNull();

    await expect(
      t.query(internal.chat.assertThreadOwner, {
        userId: "user_b",
        threadId: "thread_a",
      }),
    ).rejects.toThrow("Thread not found");
  });

  it("aborts only the authenticated learner's exact active response stream", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    const ownedThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "Owned",
    });

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: ownedThread._id,
      title: "Owned",
      lastMessageAt: 1,
    });
    const sent = await t.withIdentity({ subject: "user_a" }).mutation(api.chat.sendMessage, {
      threadId: ownedThread._id,
      prompt: "Show me why slope is rise over run",
      requestId: "request_cancel",
    });
    const [promptMessage] = await t.query(components.agent.messages.getMessagesByIds, {
      messageIds: [sent.promptMessageId],
    });
    if (!promptMessage) throw new Error("Prompt message was not saved");

    await t.mutation(components.agent.messages.addMessages, {
      threadId: ownedThread._id,
      userId: "user_a",
      promptMessageId: sent.promptMessageId,
      messages: [
        {
          message: { role: "assistant" as const, content: "" },
          status: "pending" as const,
        },
      ],
    });

    const activeStreamId = await t.mutation(components.agent.streams.create, {
      threadId: ownedThread._id,
      userId: "user_a",
      order: promptMessage.order,
      stepOrder: promptMessage.stepOrder,
      format: "UIMessageChunk",
    });
    const laterSent = await t.withIdentity({ subject: "user_a" }).mutation(api.chat.sendMessage, {
      threadId: ownedThread._id,
      prompt: "Now show a second example",
      requestId: "request_cancel_later",
    });
    const [laterPromptMessage] = await t.query(components.agent.messages.getMessagesByIds, {
      messageIds: [laterSent.promptMessageId],
    });
    if (!laterPromptMessage) throw new Error("Later prompt was not saved");
    const laterActiveStreamId = await t.mutation(components.agent.streams.create, {
      threadId: ownedThread._id,
      userId: "user_a",
      order: laterPromptMessage.order,
      stepOrder: laterPromptMessage.stepOrder,
      format: "UIMessageChunk",
    });
    const unrelatedStreamId = await t.mutation(components.agent.streams.create, {
      threadId: ownedThread._id,
      userId: "user_a",
      order: laterPromptMessage.order + 1,
      stepOrder: 0,
      format: "UIMessageChunk",
    });

    await expect(
      t.withIdentity({ subject: "user_b" }).mutation(api.chat.cancelGeneration, {
        threadId: ownedThread._id,
      }),
    ).rejects.toThrow("Thread not found");

    await expect(
      t.withIdentity({ subject: "user_a" }).mutation(api.chat.cancelGeneration, {
        threadId: ownedThread._id,
      }),
    ).resolves.toEqual({ stopped: true });

    const streams = await t.query(components.agent.streams.list, {
      threadId: ownedThread._id,
      statuses: ["streaming", "aborted"],
    });
    expect(streams.find((stream) => stream.streamId === activeStreamId)?.status).toBe("aborted");
    expect(streams.find((stream) => stream.streamId === laterActiveStreamId)?.status).toBe(
      "aborted",
    );
    expect(streams.find((stream) => stream.streamId === unrelatedStreamId)?.status).toBe(
      "streaming",
    );
    await expect(
      t.query(internalTestApi.chat.getGenerationControlInternal, {
        userId: "user_a",
        threadId: ownedThread._id,
        promptMessageId: sent.promptMessageId,
      }),
    ).resolves.toMatchObject({
      order: promptMessage.order,
      state: "cancel_requested",
    });

    await t.mutation(internalTestApi.chat.saveAssistantCancellationMessageInternal, {
      userId: "user_a",
      threadId: ownedThread._id,
      promptMessageId: sent.promptMessageId,
    });
    await expect(
      t.mutation(internalTestApi.chat.beginAssistantGenerationInternal, {
        userId: "user_a",
        threadId: ownedThread._id,
        promptMessageId: laterSent.promptMessageId,
      }),
    ).resolves.toBe(false);
    await t.mutation(internalTestApi.chat.completeAssistantGenerationInternal, {
      userId: "user_a",
      threadId: ownedThread._id,
      promptMessageId: sent.promptMessageId,
    });
    await expect(
      t.query(internalTestApi.chat.getGenerationControlInternal, {
        userId: "user_a",
        threadId: ownedThread._id,
        promptMessageId: laterSent.promptMessageId,
      }),
    ).resolves.toMatchObject({
      order: laterPromptMessage.order,
      state: "cancel_requested",
    });
    const messages = await t.query(components.agent.messages.listMessagesByThreadId, {
      threadId: ownedThread._id,
      order: "asc",
      excludeToolMessages: true,
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(messages.page.find((message) => message.message?.role === "assistant")?.text).toContain(
      "You stopped this response",
    );
  });

  it("records cancellation while a hidden provider attempt has no component stream", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    const ownedThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "Owned",
    });
    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: ownedThread._id,
      title: "Owned",
      lastMessageAt: 1,
    });
    const sent = await t.withIdentity({ subject: "user_a" }).mutation(api.chat.sendMessage, {
      threadId: ownedThread._id,
      prompt: "Explain vectors",
      requestId: "request_no_stream",
    });

    await expect(
      t.withIdentity({ subject: "user_a" }).mutation(api.chat.cancelGeneration, {
        threadId: ownedThread._id,
      }),
    ).resolves.toEqual({ stopped: true });
    await expect(
      t.query(internalTestApi.chat.getGenerationControlInternal, {
        userId: "user_a",
        threadId: ownedThread._id,
        promptMessageId: sent.promptMessageId,
      }),
    ).resolves.toMatchObject({ state: "cancel_requested" });
  });

  it("preserves meaningful partial output and appends one exact-turn stopped marker", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    const ownedThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "Owned",
    });
    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: ownedThread._id,
      title: "Owned",
      lastMessageAt: 1,
    });
    const authed = t.withIdentity({ subject: "user_a" });
    const canceledTurn = await authed.mutation(api.chat.sendMessage, {
      threadId: ownedThread._id,
      prompt: "Explain slope",
      requestId: "request_partial_cancel",
    });
    const laterTurn = await authed.mutation(api.chat.sendMessage, {
      threadId: ownedThread._id,
      prompt: "Explain vectors",
      requestId: "request_later_turn",
    });
    const savedPartial = await t.mutation(
      components.agent.messages.addMessages,
      {
        threadId: ownedThread._id,
        userId: "user_a",
        promptMessageId: canceledTurn.promptMessageId,
        messages: [
          {
            message: {
              role: "assistant" as const,
              content: "Slope compares vertical change to horizontal change, so",
            },
            status: "failed" as const,
          },
        ],
      },
    );

    await t.mutation(
      internalTestApi.chat.saveAssistantCancellationMessageInternal,
      {
        userId: "user_a",
        threadId: ownedThread._id,
        promptMessageId: canceledTurn.promptMessageId,
      },
    );
    await t.mutation(
      internalTestApi.chat.saveAssistantCancellationMessageInternal,
      {
        userId: "user_a",
        threadId: ownedThread._id,
        promptMessageId: canceledTurn.promptMessageId,
      },
    );

    const [canceledPrompt, laterPrompt] = await t.query(
      components.agent.messages.getMessagesByIds,
      { messageIds: [canceledTurn.promptMessageId, laterTurn.promptMessageId] },
    );
    if (!canceledPrompt || !laterPrompt) throw new Error("Prompts were not saved");
    const listed = await t.query(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: ownedThread._id,
        order: "asc",
        excludeToolMessages: true,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    const partial = listed.page.find(
      (message) => message._id === savedPartial.messages[0]!._id,
    );
    const stoppedMarkers = listed.page.filter(
      (message) =>
        message.message?.role === "assistant" &&
        message.text?.includes("You stopped this response"),
    );

    expect(partial?.text).toContain(
      "Slope compares vertical change to horizontal change",
    );
    expect(stoppedMarkers).toHaveLength(1);
    expect(stoppedMarkers[0]?.order).toBe(canceledPrompt.order);
    expect(stoppedMarkers[0]?.order).not.toBe(laterPrompt.order);
  });

  it("expires leaked generation control and aborts its exact stale stream", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
    const t = testConvex();
    const ownedThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "Owned",
    });
    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: ownedThread._id,
      title: "Owned",
      lastMessageAt: 1,
    });
    const sent = await t.withIdentity({ subject: "user_a" }).mutation(api.chat.sendMessage, {
      threadId: ownedThread._id,
      prompt: "Explain vectors",
      requestId: "request_expiry",
    });
    const [promptMessage] = await t.query(components.agent.messages.getMessagesByIds, {
      messageIds: [sent.promptMessageId],
    });
    if (!promptMessage) throw new Error("Prompt message was not saved");
    const streamId = await t.mutation(components.agent.streams.create, {
      threadId: ownedThread._id,
      userId: "user_a",
      order: promptMessage.order,
      stepOrder: promptMessage.stepOrder,
      format: "UIMessageChunk",
    });

    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    await t.mutation(internalTestApi.chat.expireAssistantGenerationInternal, {
      userId: "user_a",
      threadId: ownedThread._id,
      promptMessageId: sent.promptMessageId,
    });

    await expect(
      t.query(internalTestApi.chat.getGenerationControlInternal, {
        userId: "user_a",
        threadId: ownedThread._id,
        promptMessageId: sent.promptMessageId,
      }),
    ).resolves.toBeNull();
    const streams = await t.query(components.agent.streams.list, {
      threadId: ownedThread._id,
      statuses: ["streaming", "aborted"],
    });
    expect(streams.find((stream) => stream.streamId === streamId)?.status).toBe("aborted");
  });

  it("keeps attachment ownership on message payload resolution", async () => {
    const t = testConvex();
    const storageId = await t.run(async (ctx) => {
      return await ctx.storage.store(
        new Blob(["diagram"], { type: "text/plain" }),
      );
    });
    await t.mutation(internal.billing.syncBillingProfileInternal, {
      userId: "user_a",
      planKey: "intro",
      status: "active",
    });

    const saved = await t.withIdentity({ subject: "user_a" }).mutation(
      api.chat.saveAttachment,
      {
        storageId,
        filename: "diagram.txt",
        mimeType: "text/plain",
        size: 7,
      },
    );

    await expect(
      t.query(internal.chat.resolveAttachments, {
        userId: "user_a",
        attachmentIds: [saved.attachmentId],
      }),
    ).resolves.toMatchObject([
      {
        kind: "file",
        mimeType: "text/plain",
        filename: "diagram.txt",
      },
    ]);

    await expect(
      t.query(internal.chat.resolveAttachments, {
        userId: "user_b",
        attachmentIds: [saved.attachmentId],
      }),
    ).rejects.toThrow("Attachment access denied");
  });

  it("persists a user message, dedupes retries, and records onboarding usage", async () => {
    const t = testConvex();
    const agentThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "New Thread",
    });

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: agentThread._id,
      title: "New Thread",
      lastMessageAt: 1,
    });
    const authed = t.withIdentity({ subject: "user_a" });
    const first = await authed.mutation(api.chat.sendMessage, {
      threadId: agentThread._id,
      prompt: "Explain slope",
      requestId: "request_a",
    });
    const second = await authed.mutation(api.chat.sendMessage, {
      threadId: agentThread._id,
      prompt: "Explain slope",
      requestId: "request_a",
    });

    expect(first.deduped).toBe(false);
    expect(second).toEqual({
      promptMessageId: first.promptMessageId,
      deduped: true,
    });

    const threads = await authed.query(api.chat.listThreads, {});
    expect(threads[0]).toMatchObject({
      threadId: agentThread._id,
      title: "Explain slope",
    });

    const billing = await authed.query(api.billing.getViewerBillingState, {});
    expect(billing.usage.lifetimeFreePromptCount).toBe(1);
  });

  it("dedupes a non-adjacent A-to-B-to-A request replay for the same thread", async () => {
    const t = testConvex();
    const agentThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "New Thread",
    });
    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: agentThread._id,
      title: "New Thread",
      lastMessageAt: 1,
    });
    await t.mutation(internal.billing.syncBillingProfileInternal, {
      userId: "user_a",
      planKey: "pro",
      status: "active",
    });

    const authed = t.withIdentity({ subject: "user_a" });
    const first = await authed.mutation(api.chat.sendMessage, {
      threadId: agentThread._id,
      prompt: "Explain slope",
      requestId: "request_a",
    });
    // Simulate the final request written before the receipt table shipped.
    await t.run(async (ctx) => {
      const receipts = await ctx.db.query("chatRequestReceipts").collect();
      for (const receipt of receipts) {
        await ctx.db.delete(receipt._id);
      }
    });
    await authed.mutation(api.chat.sendMessage, {
      threadId: agentThread._id,
      prompt: "Now explain vectors",
      requestId: "request_b",
    });
    const replay = await authed.mutation(api.chat.sendMessage, {
      threadId: agentThread._id,
      prompt: "This changed payload must not create another turn",
      requestId: "request_a",
    });

    expect(replay).toEqual({
      promptMessageId: first.promptMessageId,
      deduped: true,
    });

    const messages = await t.query(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: agentThread._id,
        order: "asc",
        excludeToolMessages: true,
        paginationOpts: { cursor: null, numItems: 20 },
      },
    );
    const userMessages = messages.page.filter(
      (message) => message.message?.role === "user",
    );
    expect(userMessages).toHaveLength(2);
    expect(userMessages.map((message) => message.text)).not.toContain(
      "This changed payload must not create another turn",
    );

    const billing = await authed.query(api.billing.getViewerBillingState, {});
    expect(billing.usage.textPromptCount).toBe(2);

    const receipts = await t.run(async (ctx) =>
      ctx.db
        .query("chatRequestReceipts")
        .withIndex("by_userId_and_threadId", (q) =>
          q.eq("userId", "user_a").eq("threadId", agentThread._id),
        )
        .collect(),
    );
    expect(receipts).toHaveLength(2);
    expect(receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: "request_a",
          promptMessageId: first.promptMessageId,
          order: expect.any(Number),
        }),
        expect.objectContaining({
          requestId: "request_b",
          order: expect.any(Number),
        }),
      ]),
    );
  });

  it("cleans durable request receipts in bounded thread-deletion batches", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    const agentThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "Owned",
    });
    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: agentThread._id,
      title: "Owned",
      lastMessageAt: 1,
    });
    await t.run(async (ctx) => {
      for (let index = 0; index < 65; index += 1) {
        await ctx.db.insert("chatRequestReceipts", {
          userId: "user_a",
          threadId: agentThread._id,
          requestId: `request_${index}`,
          promptMessageId: `prompt_${index}`,
          order: index,
          createdAt: index,
        });
      }
    });

    await t.mutation(internalTestApi.chat.deleteThreadRecordInternal, {
      userId: "user_a",
      threadId: agentThread._id,
    });
    const afterFirstBatch = await t.run(async (ctx) =>
      ctx.db.query("chatRequestReceipts").collect(),
    );
    expect(afterFirstBatch).toHaveLength(1);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const remaining = await t.run(async (ctx) => ({
      receipts: await ctx.db.query("chatRequestReceipts").collect(),
      threads: await ctx.db.query("userThreads").collect(),
    }));
    expect(remaining).toEqual({ receipts: [], threads: [] });
  });

  it("scopes the same request id independently across threads", async () => {
    const t = testConvex();
    await t.mutation(internal.billing.syncBillingProfileInternal, {
      userId: "user_a",
      planKey: "pro",
      status: "active",
    });
    const firstThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "First",
    });
    const secondThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "Second",
    });
    for (const threadId of [firstThread._id, secondThread._id]) {
      await t.mutation(internal.chat.createThreadRecord, {
        userId: "user_a",
        threadId,
        title: "Owned",
        lastMessageAt: 1,
      });
    }

    const authed = t.withIdentity({ subject: "user_a" });
    const first = await authed.mutation(api.chat.sendMessage, {
      threadId: firstThread._id,
      prompt: "Explain slope",
      requestId: "shared_request_id",
    });
    const second = await authed.mutation(api.chat.sendMessage, {
      threadId: secondThread._id,
      prompt: "Explain vectors",
      requestId: "shared_request_id",
    });

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(false);
    expect(second.promptMessageId).not.toBe(first.promptMessageId);
  });

  it("queues distinct follow-up action sends in the same thread", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    const agentThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "New Thread",
    });

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: agentThread._id,
      title: "New Thread",
      lastMessageAt: 1,
    });

    const authed = t.withIdentity({ subject: "user_a" });
    const first = await authed.action(api.chatActions.sendMessage, {
      threadId: agentThread._id,
      prompt: "Explain slope",
      requestId: "request_a",
    });
    const second = await authed.action(api.chatActions.sendMessage, {
      threadId: agentThread._id,
      prompt: "Give me a second example",
      requestId: "request_b",
    });

    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(false);
    expect(second.promptMessageId).not.toBe(first.promptMessageId);

    const listed = await t.query(components.agent.messages.listMessagesByThreadId, {
      threadId: agentThread._id,
      order: "asc",
      excludeToolMessages: true,
      paginationOpts: {
        cursor: null,
        numItems: 10,
      },
    });
    expect(listed.page.map((message) => message.text)).toEqual([
      "Explain slope",
      "Give me a second example",
    ]);

    const billing = await authed.query(api.billing.getViewerBillingState, {});
    expect(billing.usage.lifetimeFreePromptCount).toBe(2);
  });

  it("dedupes chat action retries with the same request id without double billing", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    const agentThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "New Thread",
    });

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: agentThread._id,
      title: "New Thread",
      lastMessageAt: 1,
    });

    const authed = t.withIdentity({ subject: "user_a" });
    const first = await authed.action(api.chatActions.sendMessage, {
      threadId: agentThread._id,
      prompt: "Explain slope",
      requestId: "request_a",
    });
    const second = await authed.action(api.chatActions.sendMessage, {
      threadId: agentThread._id,
      prompt: "Explain slope",
      requestId: "request_a",
    });

    expect(first.deduped).toBe(false);
    expect(second).toEqual({
      promptMessageId: first.promptMessageId,
      deduped: true,
    });

    const listed = await t.query(components.agent.messages.listMessagesByThreadId, {
      threadId: agentThread._id,
      order: "asc",
      excludeToolMessages: true,
      paginationOpts: {
        cursor: null,
        numItems: 10,
      },
    });
    expect(listed.page.map((message) => message.text)).toEqual([
      "Explain slope",
    ]);

    const billing = await authed.query(api.billing.getViewerBillingState, {});
    expect(billing.usage.lifetimeFreePromptCount).toBe(1);
  });

  it("saves a visible assistant failure when queued generation cannot reply", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    const agentThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "New Thread",
    });

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: agentThread._id,
      title: "New Thread",
      lastMessageAt: 1,
    });

    const authed = t.withIdentity({ subject: "user_a" });
    const sent = await authed.mutation(api.chat.sendMessage, {
      threadId: agentThread._id,
      prompt: "Explain slope",
      requestId: "request_a",
    });
    const laterSent = await authed.mutation(api.chat.sendMessage, {
      threadId: agentThread._id,
      prompt: "Give me a second example",
      requestId: "request_b",
    });

    await t.mutation(internal.chat.saveAssistantFailureMessageInternal, {
      userId: "user_a",
      threadId: agentThread._id,
      promptMessageId: laterSent.promptMessageId,
    });
    await t.mutation(internal.chat.saveAssistantFailureMessageInternal, {
      userId: "user_a",
      threadId: agentThread._id,
      promptMessageId: sent.promptMessageId,
    });
    await t.mutation(internal.chat.saveAssistantFailureMessageInternal, {
      userId: "user_a",
      threadId: agentThread._id,
      promptMessageId: sent.promptMessageId,
    });

    const listed = await t.query(components.agent.messages.listMessagesByThreadId, {
      threadId: agentThread._id,
      order: "asc",
      excludeToolMessages: true,
      paginationOpts: {
        cursor: null,
        numItems: 10,
      },
    });

    const assistantMessages = listed.page.filter(
      (message) => message.message?.role === "assistant",
    );
    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages.map((message) => message.text)).toEqual([
      expect.stringContaining("I hit a snag while generating that reply."),
      expect.stringContaining("I hit a snag while generating that reply."),
    ]);
  });

  // The provider retry path is integration-level; these tests pin the deterministic cleanup/fallback contract it uses.
  it("removes an empty pending assistant before fallback and keeps fallback idempotent", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    const agentThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "New Thread",
    });

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: agentThread._id,
      title: "New Thread",
      lastMessageAt: 1,
    });

    const sent = await t.withIdentity({ subject: "user_a" }).mutation(
      api.chat.sendMessage,
      {
        threadId: agentThread._id,
        prompt: "Explain slope",
        requestId: "request_a",
      },
    );
    const [promptMessage] = await t.query(
      components.agent.messages.getMessagesByIds,
      {
        messageIds: [sent.promptMessageId],
      },
    );
    if (!promptMessage) {
      throw new Error("Prompt message was not saved");
    }

    const pending = await t.mutation(components.agent.messages.addMessages, {
      threadId: agentThread._id,
      userId: "user_a",
      promptMessageId: sent.promptMessageId,
      messages: [
        {
          message: {
            role: "assistant" as const,
            content: "",
          },
          status: "pending" as const,
        },
      ],
    });
    const pendingAssistantId = pending.messages[0]!._id;

    await t.mutation(components.agent.streams.create, {
      threadId: agentThread._id,
      userId: "user_a",
      order: promptMessage.order,
      stepOrder: promptMessage.stepOrder,
      format: "UIMessageChunk",
    });

    await expect(
      t.mutation(internalTestApi.chat.cleanupFailedAssistantTurnInternal, {
        userId: "user_a",
        threadId: agentThread._id,
        promptMessageId: sent.promptMessageId,
      }),
    ).resolves.toMatchObject({
      deletedMessages: 1,
      deletedStreams: 1,
      meaningfulContentFound: false,
      retryEligible: true,
    });
    await t.mutation(internal.chat.saveAssistantFailureMessageInternal, {
      userId: "user_a",
      threadId: agentThread._id,
      promptMessageId: sent.promptMessageId,
    });
    await t.mutation(internal.chat.saveAssistantFailureMessageInternal, {
      userId: "user_a",
      threadId: agentThread._id,
      promptMessageId: sent.promptMessageId,
    });

    const [deletedPendingAssistant] = await t.query(
      components.agent.messages.getMessagesByIds,
      {
        messageIds: [pendingAssistantId],
      },
    );
    expect(deletedPendingAssistant).toBeNull();

    const streams = await t.query(components.agent.streams.list, {
      threadId: agentThread._id,
      startOrder: promptMessage.order,
      statuses: ["streaming", "finished", "aborted"],
    });
    expect(
      streams.filter((stream) => stream.order === promptMessage.order),
    ).toEqual([]);

    const listed = await t.query(components.agent.messages.listMessagesByThreadId, {
      threadId: agentThread._id,
      order: "asc",
      excludeToolMessages: true,
      paginationOpts: {
        cursor: null,
        numItems: 10,
      },
    });
    const assistantMessages = listed.page.filter(
      (message) => message.message?.role === "assistant",
    );

    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.text).toContain(
      "I hit a snag while generating that reply.",
    );
  });

  it("treats an assistant tool call without a result as an incomplete failed turn", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    const agentThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "New Thread",
    });

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: agentThread._id,
      title: "New Thread",
      lastMessageAt: 1,
    });

    const sent = await t.withIdentity({ subject: "user_a" }).mutation(
      api.chat.sendMessage,
      {
        threadId: agentThread._id,
        prompt: "Create a Code Spark",
        requestId: "request_tool_call_only",
      },
    );
    const [promptMessage] = await t.query(
      components.agent.messages.getMessagesByIds,
      { messageIds: [sent.promptMessageId] },
    );
    if (!promptMessage) throw new Error("Prompt message was not saved");

    const saved = await t.mutation(components.agent.messages.addMessages, {
      threadId: agentThread._id,
      userId: "user_a",
      promptMessageId: sent.promptMessageId,
      messages: [
        {
          message: {
            role: "assistant" as const,
            content: [
              {
                type: "tool-call" as const,
                toolCallId: "spark_call_without_result",
                toolName: "create_spark",
                args: { kind: "code" },
              },
            ],
          },
          status: "failed" as const,
        },
      ],
    });
    const failedAssistantId = saved.messages[0]!._id;

    await t.mutation(components.agent.streams.create, {
      threadId: agentThread._id,
      userId: "user_a",
      order: promptMessage.order,
      stepOrder: promptMessage.stepOrder,
      format: "UIMessageChunk",
    });

    await expect(
      t.mutation(internalTestApi.chat.cleanupFailedAssistantTurnInternal, {
        userId: "user_a",
        threadId: agentThread._id,
        promptMessageId: sent.promptMessageId,
      }),
    ).resolves.toMatchObject({
      deletedMessages: 1,
      deletedStreams: 1,
      meaningfulContentFound: false,
      retryEligible: true,
      visibleAssistantTextFound: false,
      visibleToolContentFound: false,
    });

    const [deletedAssistant] = await t.query(
      components.agent.messages.getMessagesByIds,
      { messageIds: [failedAssistantId] },
    );
    expect(deletedAssistant).toBeNull();

    await t.mutation(internal.chat.saveAssistantFailureMessageInternal, {
      userId: "user_a",
      threadId: agentThread._id,
      promptMessageId: sent.promptMessageId,
    });
    const listed = await t.query(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: agentThread._id,
        order: "asc",
        excludeToolMessages: true,
        paginationOpts: { cursor: null, numItems: 10 },
      },
    );
    expect(
      listed.page.find((message) => message.message?.role === "assistant")
        ?.text,
    ).toContain("I hit a snag while generating that reply.");
  });

  it("preserves non-empty assistant text while cleaning failed empty state", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    const agentThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "New Thread",
    });

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: agentThread._id,
      title: "New Thread",
      lastMessageAt: 1,
    });

    const sent = await t.withIdentity({ subject: "user_a" }).mutation(
      api.chat.sendMessage,
      {
        threadId: agentThread._id,
        prompt: "Explain acceleration",
        requestId: "request_a",
      },
    );
    const savedAssistants = await t.mutation(
      components.agent.messages.addMessages,
      {
        threadId: agentThread._id,
        userId: "user_a",
        promptMessageId: sent.promptMessageId,
        messages: [
          {
            message: {
              role: "assistant" as const,
              content: "Let's reason from the graph first.",
            },
            status: "failed" as const,
          },
          {
            message: {
              role: "assistant" as const,
              content: "",
            },
            status: "failed" as const,
          },
        ],
      },
    );
    const visibleAssistantId = savedAssistants.messages[0]!._id;
    const emptyAssistantId = savedAssistants.messages[1]!._id;

    await expect(
      t.mutation(internalTestApi.chat.cleanupFailedAssistantTurnInternal, {
        userId: "user_a",
        threadId: agentThread._id,
        promptMessageId: sent.promptMessageId,
      }),
    ).resolves.toMatchObject({
      promptFound: true,
      deletedMessages: 1,
      meaningfulContentFound: true,
      retryEligible: false,
      visibleAssistantTextFound: true,
    });
    await t.mutation(internal.chat.saveAssistantFailureMessageInternal, {
      userId: "user_a",
      threadId: agentThread._id,
      promptMessageId: sent.promptMessageId,
    });

    const [visibleAssistant, deletedEmptyAssistant] = await t.query(
      components.agent.messages.getMessagesByIds,
      {
        messageIds: [visibleAssistantId, emptyAssistantId],
      },
    );
    expect(visibleAssistant?.text).toBe("Let's reason from the graph first.");
    expect(deletedEmptyAssistant).toBeNull();

    const listed = await t.query(components.agent.messages.listMessagesByThreadId, {
      threadId: agentThread._id,
      order: "asc",
      excludeToolMessages: true,
      paginationOpts: {
        cursor: null,
        numItems: 10,
      },
    });
    const assistantMessages = listed.page.filter(
      (message) => message.message?.role === "assistant",
    );

    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?._id).toBe(visibleAssistantId);
  });

  it("preserves tool content and does not save fallback for that prompt turn", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    const agentThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "New Thread",
    });

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: agentThread._id,
      title: "New Thread",
      lastMessageAt: 1,
    });

    const sent = await t.withIdentity({ subject: "user_a" }).mutation(
      api.chat.sendMessage,
      {
        threadId: agentThread._id,
        prompt: "Make a quick graph Spark",
        requestId: "request_a",
      },
    );
    const savedMessages = await t.mutation(components.agent.messages.addMessages, {
      threadId: agentThread._id,
      userId: "user_a",
      promptMessageId: sent.promptMessageId,
      messages: [
        {
          message: {
            role: "assistant" as const,
            content: "",
          },
          status: "pending" as const,
        },
        {
          message: {
            role: "tool" as const,
            content: [
              {
                type: "tool-result" as const,
                toolCallId: "spark_call",
                toolName: "renderSpark",
                output: {
                  type: "json" as const,
                  value: {
                    kind: "graph",
                    sparkId: "spark_1",
                  },
                },
              },
            ],
          },
          status: "success" as const,
        },
      ],
    });
    const emptyAssistantId = savedMessages.messages[0]!._id;
    const toolMessageId = savedMessages.messages[1]!._id;

    await expect(
      t.mutation(internalTestApi.chat.cleanupFailedAssistantTurnInternal, {
        userId: "user_a",
        threadId: agentThread._id,
        promptMessageId: sent.promptMessageId,
      }),
    ).resolves.toMatchObject({
      deletedMessages: 1,
      meaningfulContentFound: true,
      retryEligible: false,
      visibleToolContentFound: true,
    });
    await t.mutation(internal.chat.saveAssistantFailureMessageInternal, {
      userId: "user_a",
      threadId: agentThread._id,
      promptMessageId: sent.promptMessageId,
    });

    const [deletedAssistant, toolMessage] = await t.query(
      components.agent.messages.getMessagesByIds,
      {
        messageIds: [emptyAssistantId, toolMessageId],
      },
    );
    expect(deletedAssistant).toBeNull();
    expect(toolMessage?.message?.role).toBe("tool");

    const listed = await t.query(components.agent.messages.listMessagesByThreadId, {
      threadId: agentThread._id,
      order: "asc",
      paginationOpts: {
        cursor: null,
        numItems: 10,
      },
    });
    const assistantMessages = listed.page.filter(
      (message) => message.message?.role === "assistant",
    );
    const toolMessages = listed.page.filter(
      (message) => message.message?.role === "tool",
    );

    expect(assistantMessages).toEqual([]);
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0]?._id).toBe(toolMessageId);
  });

  it("does not duplicate fallback messages for prompts beyond the first page", async () => {
    const t = testConvex();
    const agentThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "New Thread",
    });

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: agentThread._id,
      title: "New Thread",
      lastMessageAt: 1,
    });

    const saved = await t.mutation(components.agent.messages.addMessages, {
      threadId: agentThread._id,
      userId: "user_a",
      messages: Array.from({ length: 105 }, (_, index) => ({
        message: {
          role: "user" as const,
          content: `filler ${index}`,
        },
      })),
    });
    const latePromptId = saved.messages[104]!._id;

    await t.mutation(internal.chat.saveAssistantFailureMessageInternal, {
      userId: "user_a",
      threadId: agentThread._id,
      promptMessageId: latePromptId,
    });
    await t.mutation(internal.chat.saveAssistantFailureMessageInternal, {
      userId: "user_a",
      threadId: agentThread._id,
      promptMessageId: latePromptId,
    });

    const listed = await t.query(components.agent.messages.listMessagesByThreadId, {
      threadId: agentThread._id,
      order: "asc",
      excludeToolMessages: true,
      paginationOpts: {
        cursor: null,
        numItems: 120,
      },
    });
    const assistantMessages = listed.page.filter(
      (message) => message.message?.role === "assistant",
    );

    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]?.text).toContain(
      "I hit a snag while generating that reply.",
    );
  });

  it("does not save a fallback when the prompt id belongs to another thread", async () => {
    const t = testConvex();
    const ownedThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "Owned",
    });
    const otherThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "Other",
    });

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: ownedThread._id,
      title: "Owned",
      lastMessageAt: 1,
    });

    const saved = await t.mutation(components.agent.messages.addMessages, {
      threadId: otherThread._id,
      userId: "user_a",
      messages: [
        {
          message: {
            role: "user" as const,
            content: "Other thread prompt",
          },
        },
      ],
    });

    await t.mutation(internal.chat.saveAssistantFailureMessageInternal, {
      userId: "user_a",
      threadId: ownedThread._id,
      promptMessageId: saved.messages[0]!._id,
    });

    const listed = await t.query(components.agent.messages.listMessagesByThreadId, {
      threadId: ownedThread._id,
      order: "asc",
      excludeToolMessages: true,
      paginationOpts: {
        cursor: null,
        numItems: 10,
      },
    });

    expect(listed.page).toEqual([]);
  });
});
