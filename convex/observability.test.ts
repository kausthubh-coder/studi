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

describe("observability and quotas", () => {
  it("sanitizes telemetry metadata and exposes recent failures", async () => {
    const t = testConvex();

    await t.mutation(internal.telemetry.insertTelemetryEventInternal, {
      userId: "user_a",
      threadId: "thread_a",
      source: "voice",
      name: "create_openai_realtime_session",
      status: "failed",
      errorCategory: "auth",
      retriable: false,
      metadata: {
        apiKey: "sk-live-secret",
        nested: {
          authorization: "Bearer real-token",
          prompt: "x".repeat(800),
        },
      },
    });

    const failures = await t
      .withIdentity({ subject: "user_a" })
      .query(api.telemetry.getCurrentUserRecentFailures, { limit: 5 });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      source: "voice",
      name: "create_openai_realtime_session",
      status: "failed",
      errorCategory: "auth",
    });
    expect(failures[0]!.metadata).toMatchObject({
      apiKey: "[redacted]",
      nested: {
        authorization: "[redacted]",
      },
    });
    expect(
      String(
        (failures[0]!.metadata as { nested: { prompt: string } }).nested.prompt,
      ).length,
    ).toBeLessThanOrEqual(500);
  });

  it("sanitizes raw provider usage metadata before storing it", async () => {
    const t = testConvex();

    await t.mutation(internal.telemetry.insertRawUsageInternal, {
      userId: "user_a",
      threadId: "thread_a",
      agentName: "spark_worker:scene:initial",
      model: "openrouter/test",
      provider: "openrouter",
      usage: {
        totalTokens: 10,
        raw: {
          clientSecret: "super-secret",
        },
      },
      providerMetadata: {
        token: "provider-token",
        totalCostUsd: 0.01,
      },
    });

    const rawUsage = await t.run(async (ctx) => {
      return await ctx.db.query("rawUsage").collect();
    });

    expect(rawUsage).toHaveLength(1);
    expect(rawUsage[0]!.usage.raw).toMatchObject({
      clientSecret: "[redacted]",
    });
    expect(rawUsage[0]!.providerMetadata).toMatchObject({
      token: "[redacted]",
      totalCostUsd: 0.01,
    });
  });

  it("denies daily quota overages with a typed telemetry failure", async () => {
    const t = testConvex();

    await t.mutation(internal.quotas.reserveDailyQuotaInternal, {
      userId: "user_a",
      action: "voice_session",
      amount: 12,
      threadId: "thread_a",
      name: "voice_test",
    });

    const denial = await t.mutation(internal.quotas.reserveDailyQuotaInternal, {
      userId: "user_a",
      action: "voice_session",
      threadId: "thread_a",
      name: "voice_test",
    });

    expect(denial).toMatchObject({
      allowed: false,
      code: "QUOTA_EXCEEDED",
      message: "Voice sessions daily limit reached. Try again tomorrow.",
    });

    const quotaUsage = await t
      .withIdentity({ subject: "user_a" })
      .query(api.quotas.getCurrentUserDailyQuotaUsage, {});
    expect(
      quotaUsage.find((quota) => quota.action === "voice_session"),
    ).toMatchObject({
      count: 12,
      limit: 12,
      remaining: 0,
    });

    const failures = await t
      .withIdentity({ subject: "user_a" })
      .query(api.telemetry.getCurrentUserRecentFailures, { limit: 5 });
    expect(failures[0]).toMatchObject({
      source: "quota",
      status: "failed",
      errorCategory: "quota_exceeded",
    });
  });

  it("tracks daily quota counters for each expensive action domain", async () => {
    const t = testConvex();
    const actions = [
      "spark_create",
      "lab_runtime",
      "voice_session",
      "track_generation",
    ] as const;

    for (const action of actions) {
      await t.mutation(internal.quotas.reserveDailyQuotaInternal, {
        userId: "user_a",
        action,
        threadId: "thread_a",
        name: `${action}_test`,
      });
    }

    const quotaUsage = await t
      .withIdentity({ subject: "user_a" })
      .query(api.quotas.getCurrentUserDailyQuotaUsage, {});

    for (const action of actions) {
      expect(quotaUsage.find((quota) => quota.action === action)).toMatchObject(
        {
          action,
          count: 1,
        },
      );
    }
  });
});
