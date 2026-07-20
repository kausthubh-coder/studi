import { register as registerAgent } from "@convex-dev/agent/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const internalTestApi = internal as unknown as {
  chatActions: {
    sendFirstMessageWithRaceTestInternal: FunctionReference<
      "action",
      "internal"
    >;
  };
};

function testConvex() {
  const t = convexTest(schema, modules);
  registerAgent(t);
  registerRateLimiter(t);
  return t;
}

afterEach(() => vi.useRealTimers());

describe("first-message admission cleanup", () => {
  it("commits paginated migration before the outer send action reports syncing", async () => {
    vi.useFakeTimers();
    const t = testConvex();
    for (let index = 0; index < 130; index += 1) {
      await t.mutation(internal.chat.createThreadRecord, {
        userId: "migration_user",
        threadId: `migration_thread_${index}`,
        title: `Legacy ${index}`,
        lastMessageAt: index,
      });
    }
    const authed = t.withIdentity({ subject: "migration_user" });

    await expect(
      authed.action(api.chatActions.sendMessage, {
        threadId: "migration_thread_0",
        prompt: "Start after migration",
        requestId: "migration_action_send",
      }),
    ).rejects.toThrow("preparing your lessons");

    const afterAction = await t.run(async (ctx) =>
      ctx.db
        .query("chatGenerationLeaseMigrations")
        .withIndex("by_userId", (q) => q.eq("userId", "migration_user"))
        .unique(),
    );
    expect(afterAction).toMatchObject({
      state: "running",
      cursor: expect.any(String),
    });

    await expect(
      authed.mutation(api.chat.sendMessage, {
        threadId: "migration_thread_0",
        prompt: "Direct bypass",
        requestId: "migration_direct_send",
      }),
    ).rejects.toThrow("preparing your lessons");
    const afterDirectRollback = await t.run(async (ctx) =>
      ctx.db
        .query("chatGenerationLeaseMigrations")
        .withIndex("by_userId", (q) => q.eq("userId", "migration_user"))
        .unique(),
    );
    expect(afterDirectRollback?.cursor).toBe(afterAction?.cursor);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const completed = await t.run(async (ctx) =>
      ctx.db
        .query("chatGenerationLeaseMigrations")
        .withIndex("by_userId", (q) => q.eq("userId", "migration_user"))
        .unique(),
    );
    expect(completed).toMatchObject({ state: "complete" });
  });

  it("commits migration progress before first-message action reports syncing", async () => {
    const t = testConvex();
    for (let index = 0; index < 65; index += 1) {
      await t.mutation(internal.chat.createThreadRecord, {
        userId: "first_migration_user",
        threadId: `first_migration_thread_${index}`,
        lastMessageAt: index,
      });
    }
    await expect(
      t.withIdentity({ subject: "first_migration_user" }).action(
        api.chatActions.sendFirstMessage,
        {
          prompt: "Start after migration",
          requestId: "first_migration_action",
        },
      ),
    ).rejects.toThrow("preparing your lessons");
    const migration = await t.run(async (ctx) =>
      ctx.db
        .query("chatGenerationLeaseMigrations")
        .withIndex("by_userId", (q) => q.eq("userId", "first_migration_user"))
        .unique(),
    );
    expect(migration).toMatchObject({
      state: "running",
      cursor: expect.any(String),
    });
  });

  it("removes both empty thread shells when admission rejects", async () => {
    const t = testConvex();
    await t.mutation(internal.billing.syncBillingProfileInternal, {
      userId: "user_a",
      planKey: "intro",
      status: "active",
    });
    const activeThread = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "Active lesson",
    });
    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: activeThread._id,
      title: "Active lesson",
      lastMessageAt: 1,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("chatGenerationLeases", {
        userId: "user_a",
        threadId: activeThread._id,
        promptMessageId: "active_prompt",
        state: "running",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
    });

    const authed = t.withIdentity({ subject: "user_a" });
    await expect(
      authed.query(api.chat.getChatAdmissionState, {}),
    ).resolves.toMatchObject({ canSend: false });
    await expect(
      authed.action(api.chatActions.sendFirstMessage, {
        prompt: "Teach me vectors",
        requestId: "blocked_first_message",
      }),
    ).rejects.toThrow();

    const [appThreads, agentThreads] = await Promise.all([
      authed.query(api.chat.listThreads, {}),
      t.query(components.agent.threads.listThreadsByUserId, {
        userId: "user_a",
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ]);
    expect(appThreads.map((thread) => thread.threadId)).toEqual([
      activeThread._id,
    ]);
    expect(agentThreads.page.map((thread) => thread._id)).toEqual([
      activeThread._id,
    ]);
  });

  it("removes both new shells when a competing lease wins after preflight", async () => {
    const t = testConvex();
    await t.mutation(internal.billing.syncBillingProfileInternal, {
      userId: "user_a",
      planKey: "intro",
      status: "active",
    });
    const competitor = await t.mutation(components.agent.threads.createThread, {
      userId: "user_a",
      title: "Competing lesson",
    });
    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: competitor._id,
      title: "Competing lesson",
      lastMessageAt: 1,
    });

    await expect(
      t.withIdentity({ subject: "user_a" }).action(
        internalTestApi.chatActions.sendFirstMessageWithRaceTestInternal,
        {
          prompt: "Teach me vectors",
          requestId: "post_preflight_race",
          competingThreadId: competitor._id,
        },
      ),
    ).rejects.toThrow();

    const [appThreads, agentThreads] = await Promise.all([
      t.withIdentity({ subject: "user_a" }).query(api.chat.listThreads, {}),
      t.query(components.agent.threads.listThreadsByUserId, {
        userId: "user_a",
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ]);
    expect(appThreads.map((thread) => thread.threadId)).toEqual([
      competitor._id,
    ]);
    expect(agentThreads.page.map((thread) => thread._id)).toEqual([
      competitor._id,
    ]);
  });
});
