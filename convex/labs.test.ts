import { register as registerAgent } from "@convex-dev/agent/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

function testConvex() {
  const t = convexTest(schema, modules);
  registerAgent(t);
  registerRateLimiter(t);
  return t;
}

describe("lab session Convex ownership", () => {
  it("stores and lists lab sessions only for the owning thread", async () => {
    const t = testConvex();

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Derivatives",
      lastMessageAt: 1,
    });
    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_b",
      threadId: "thread_b",
      title: "Integrals",
      lastMessageAt: 1,
    });

    const session = await t.mutation(internal.labs.createLabSessionInternal, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Slope lab",
      provider: "daytona",
      sandboxId: "sandbox_a",
      workspacePath: "/workspace",
      language: "python",
      status: "ready",
      previewUrls: [],
    });

    const authed = t.withIdentity({ subject: "user_a" });
    await expect(
      authed.query(api.labs.listLabSessions, {
        threadId: "thread_a",
      }),
    ).resolves.toMatchObject([
      {
        _id: session._id,
        sandboxId: "sandbox_a",
        workspacePath: "/workspace",
      },
    ]);

    await expect(
      t.withIdentity({ subject: "user_b" }).query(api.labs.getLabSession, {
        labSessionId: session._id,
      }),
    ).rejects.toThrow("Lab session not found");
  });

  it("records runtime errors and hides archived labs by default", async () => {
    const t = testConvex();

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Thread",
      lastMessageAt: 1,
    });

    const session = await t.mutation(internal.labs.createLabSessionInternal, {
      userId: "user_a",
      threadId: "thread_a",
      provider: "daytona",
      sandboxId: "sandbox_a",
      workspacePath: "/workspace",
      status: "ready",
    });

    await t.mutation(internal.labs.recordLabErrorInternal, {
      userId: "user_a",
      labSessionId: session._id,
      message: "provider timeout",
      category: "timeout",
      retriable: true,
    });

    await expect(
      t.withIdentity({ subject: "user_a" }).query(api.labs.getLabSession, {
        labSessionId: session._id,
      }),
    ).resolves.toMatchObject({
      status: "error",
      lastError: {
        message: "provider timeout",
        category: "timeout",
        retriable: true,
      },
    });

    await t.mutation(internal.labs.archiveLabSessionInternal, {
      userId: "user_a",
      labSessionId: session._id,
    });

    await expect(
      t.withIdentity({ subject: "user_a" }).query(api.labs.listLabSessions, {
        threadId: "thread_a",
      }),
    ).resolves.toEqual([]);

    await expect(
      t.withIdentity({ subject: "user_a" }).query(api.labs.listLabSessions, {
        threadId: "thread_a",
        includeArchived: true,
      }),
    ).resolves.toHaveLength(1);
  });
});
