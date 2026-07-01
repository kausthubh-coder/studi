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
    cleanupFailedAssistantTurnInternal: FunctionReference<"mutation", "internal">;
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
