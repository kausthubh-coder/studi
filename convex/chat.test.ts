import { convexTest } from "convex-test";
import { register as registerAgent } from "@convex-dev/agent/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

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
