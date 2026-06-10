import { convexTest } from "convex-test";
import { register as registerAgent } from "@convex-dev/agent/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { describe, expect, it } from "vitest";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

function testConvex() {
  const t = convexTest(schema, modules);
  registerAgent(t);
  registerRateLimiter(t);
  return t;
}

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
});
