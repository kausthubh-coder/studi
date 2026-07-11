import { convexTest } from "convex-test";
import { register as registerAgent } from "@convex-dev/agent/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import type { FunctionReference } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const internalBillingApi = internal as unknown as {
  billing: {
    assertCanSendMessageInternal: FunctionReference<"mutation", "internal">;
    assertCanUseAttachmentsInternal: FunctionReference<"mutation", "internal">;
    assertCanUseCodeSparkRunInternal: FunctionReference<"mutation", "internal">;
    devResetTestBillingUsageInternal: FunctionReference<"mutation", "internal">;
    incrementFreeOnboardingUsageInternal: FunctionReference<"mutation", "internal">;
    recordTextAiCostInternal: FunctionReference<"mutation", "internal">;
    syncBillingProfileInternal: FunctionReference<"mutation", "internal">;
  };
};

afterEach(() => {
  vi.unstubAllEnvs();
});

function testConvex() {
  const t = convexTest(schema, modules);
  registerAgent(t);
  registerRateLimiter(t);
  return t;
}

async function seedBillingUsage(
  t: ReturnType<typeof testConvex>,
  userId: string,
) {
  await t.mutation(internalBillingApi.billing.incrementFreeOnboardingUsageInternal, {
    userId,
    promptCount: 3,
    textAiCostUsd: 0.12,
  });
  await t.mutation(internalBillingApi.billing.recordTextAiCostInternal, {
    userId,
    textPromptCount: 3,
    textAiCostUsd: 0.12,
  });
}

describe("dev test billing reset", () => {
  it("returns a bounded monthly Code Spark entitlement", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
    try {
      const t = testConvex();
      const entitlement = await t.mutation(
        internalBillingApi.billing.assertCanUseCodeSparkRunInternal,
        { userId: "user_target" },
      );

      expect(entitlement).toMatchObject({
        planKey: "free_onboarding",
        status: "onboarding",
        billingPeriod: "2026-07-01",
        monthlyRunLimit: 15,
      });
      expect(entitlement.billingPeriodStart).toBe(
        Date.parse("2026-07-01T00:00:00.000Z"),
      );
      expect(entitlement.billingPeriodEnd).toBe(
        Date.parse("2026-08-01T00:00:00.000Z"),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires current paid access before authorizing Code Spark provider spend", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
    try {
      const cases = [
        { status: "active", currentPeriodEnd: undefined, allowed: true },
        {
          status: "canceled",
          currentPeriodEnd: Date.parse("2026-08-01T00:00:00.000Z"),
          allowed: true,
        },
        {
          status: "canceled",
          currentPeriodEnd: Date.parse("2026-07-01T00:00:00.000Z"),
          allowed: false,
        },
        { status: "past_due", currentPeriodEnd: undefined, allowed: false },
        { status: "inactive", currentPeriodEnd: undefined, allowed: false },
      ] as const;

      for (const testCase of cases) {
        const t = testConvex();
        await t.mutation(internalBillingApi.billing.syncBillingProfileInternal, {
          userId: `user_${testCase.status}_${testCase.allowed}`,
          planKey: "intro",
          status: testCase.status,
          currentPeriodEnd: testCase.currentPeriodEnd,
        });

        const request = t.mutation(
          internalBillingApi.billing.assertCanUseCodeSparkRunInternal,
          { userId: `user_${testCase.status}_${testCase.allowed}` },
        );
        if (testCase.allowed) {
          await expect(request).resolves.toMatchObject({
            planKey: "intro",
            monthlyRunLimit: 200,
          });
        } else {
          await expect(request).rejects.toThrow(
            "Code Spark runs require an active paid plan.",
          );
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the paid subscription lifecycle for chat and attachment admission", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
    try {
      const cases = [
        { status: "active", currentPeriodEnd: undefined, allowed: true },
        {
          status: "canceled",
          currentPeriodEnd: Date.parse("2026-08-01T00:00:00.000Z"),
          allowed: true,
        },
        {
          status: "canceled",
          currentPeriodEnd: Date.parse("2026-07-01T00:00:00.000Z"),
          allowed: false,
        },
        { status: "past_due", currentPeriodEnd: undefined, allowed: false },
        { status: "inactive", currentPeriodEnd: undefined, allowed: false },
      ] as const;

      for (const [index, testCase] of cases.entries()) {
        const t = testConvex();
        const userId = `paid_lifecycle_${testCase.status}_${index}`;
        await t.mutation(internalBillingApi.billing.syncBillingProfileInternal, {
          userId,
          planKey: "intro",
          status: testCase.status,
          currentPeriodEnd: testCase.currentPeriodEnd,
        });

        const chatRequest = t.mutation(
          internalBillingApi.billing.assertCanSendMessageInternal,
          { userId },
        );
        const attachmentRequest = t.mutation(
          internalBillingApi.billing.assertCanUseAttachmentsInternal,
          { userId },
        );

        if (testCase.allowed) {
          await expect(chatRequest).resolves.toMatchObject({
            planKey: "intro",
            status: testCase.status,
          });
          await expect(attachmentRequest).resolves.toMatchObject({
            planKey: "intro",
            status: testCase.status,
          });
        } else {
          await expect(chatRequest).rejects.toThrow(
            "Text tutoring requires an active paid plan.",
          );
          await expect(attachmentRequest).rejects.toThrow(
            "Uploads require an active paid plan.",
          );
        }

        const viewerState = await t
          .withIdentity({ subject: userId })
          .query(api.billing.getViewerBillingState, {});
        expect(viewerState.lockedSurfaces).toEqual({
          chat: !testCase.allowed,
          attachments: !testCase.allowed,
        });
      }

      const freeT = testConvex();
      await expect(
        freeT.mutation(internalBillingApi.billing.assertCanSendMessageInternal, {
          userId: "guided_preview_user",
        }),
      ).resolves.toMatchObject({
        planKey: "free_onboarding",
        status: "onboarding",
      });
      await expect(
        freeT.mutation(internalBillingApi.billing.assertCanUseAttachmentsInternal, {
          userId: "guided_preview_user",
        }),
      ).rejects.toThrow("Uploads are available on paid plans only.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the canonical Starter name in capped-plan upgrade copy", async () => {
    const t = testConvex();
    await t.mutation(internalBillingApi.billing.syncBillingProfileInternal, {
      userId: "user_starter_limit",
      planKey: "intro",
      status: "active",
    });
    await t.mutation(internalBillingApi.billing.recordTextAiCostInternal, {
      userId: "user_starter_limit",
      textPromptCount: 4,
      textAiCostUsd: 1.5,
    });

    const state = await t
      .withIdentity({ subject: "user_starter_limit" })
      .query(api.billing.getViewerBillingState, {});

    expect(state.upgradeReason).toBe(
      "You've reached this month's Starter usage limit. Upgrade to Pro for higher monthly capacity.",
    );
    expect(state.upgradeReason).not.toMatch(/\bIntro\b/);
  });

  it("resets only the allowlisted Clerk test user usage in dev", async () => {
    vi.stubEnv(
      "DEV_TEST_BILLING_RESET_TARGETS",
      "studi-agent+clerk_test@example.com=user_target",
    );
    const t = testConvex();
    await seedBillingUsage(t, "user_target");
    await seedBillingUsage(t, "user_other");
    await t.run(async (ctx) => {
      for (const userId of ["user_target", "user_other"]) {
        const sessionId = await ctx.db.insert("codeSparkSessions", {
          userId,
          threadId: `thread_${userId}`,
          sparkId: `spark_${userId}`,
          title: "Test challenge",
          mode: "challenge",
          language: "typescript",
          provider: "local_fake",
          providerStatus: "test_only",
          status: "ready",
          activePath: "index.ts",
          runCommand: "node index.ts",
          testCommand: "node tests/index.check.ts",
          version: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAccessedAt: Date.now(),
        });
        const reservationId = await ctx.db.insert("codeSparkRunReservations", {
          userId,
          threadId: `thread_${userId}`,
          sparkId: `spark_${userId}`,
          sessionId,
          status: "completed",
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
          finalizedAt: Date.now(),
        });
        await ctx.db.insert("codeSparkUsage", {
          userId,
          threadId: `thread_${userId}`,
          sparkId: `spark_${userId}`,
          sessionId,
          reservationId,
          provider: "local_fake",
          status: "passed",
          durationMs: 1,
          timedOut: false,
          createdAt: Date.now(),
        });
      }
    });

    await expect(
      t
        .withIdentity({ subject: "user_target" })
        .query(api.billing.getViewerBillingState, {}),
    ).resolves.toMatchObject({
      lockedSurfaces: { chat: true },
      usage: {
        lifetimeFreePromptCount: 3,
        textPromptCount: 3,
      },
    });

    const result = await t.mutation(
      internalBillingApi.billing.devResetTestBillingUsageInternal,
      {
        clerkUserId: "user_target",
        email: "studi-agent+clerk_test@example.com",
        deployment: "dev:test-deployment",
      },
    );

    expect(result).toMatchObject({
      resetOnboarding: true,
      resetCurrentPeriod: true,
      resetCodeSparkReservations: 1,
      resetCodeSparkUsage: 1,
      before: {
        lifetimeFreePromptCount: 3,
        textPromptCount: 3,
      },
      after: {
        lifetimeFreePromptCount: 0,
        textPromptCount: 0,
      },
    });

    await expect(
      t
        .withIdentity({ subject: "user_target" })
        .query(api.billing.getViewerBillingState, {}),
    ).resolves.toMatchObject({
      lockedSurfaces: { chat: false },
      usage: {
        lifetimeFreePromptCount: 0,
        textPromptCount: 0,
        textAiCostUsd: 0,
        totalEstimatedCostUsd: 0,
      },
    });

    const codeSparkRows = await t.run(async (ctx) => ({
      reservations: await ctx.db.query("codeSparkRunReservations").collect(),
      usage: await ctx.db.query("codeSparkUsage").collect(),
    }));
    expect(codeSparkRows.reservations.map((row) => row.userId)).toEqual([
      "user_other",
    ]);
    expect(codeSparkRows.usage.map((row) => row.userId)).toEqual([
      "user_other",
    ]);

    await expect(
      t
        .withIdentity({ subject: "user_other" })
        .query(api.billing.getViewerBillingState, {}),
    ).resolves.toMatchObject({
      lockedSurfaces: { chat: true },
      usage: {
        lifetimeFreePromptCount: 3,
        textPromptCount: 3,
      },
      });
  });

  it("rejects a reset when the allowlisted email does not match the requested Clerk user id", async () => {
    vi.stubEnv(
      "DEV_TEST_BILLING_RESET_TARGETS",
      "studi-agent+clerk_test@example.com=user_target",
    );
    const t = testConvex();
    await seedBillingUsage(t, "user_victim");

    await expect(
      t.mutation(internalBillingApi.billing.devResetTestBillingUsageInternal, {
        clerkUserId: "user_victim",
        email: "studi-agent+clerk_test@example.com",
        deployment: "dev:test-deployment",
      }),
    ).rejects.toThrow(
      "Billing reset email does not match the requested Clerk user id.",
    );

    await expect(
      t
        .withIdentity({ subject: "user_victim" })
        .query(api.billing.getViewerBillingState, {}),
    ).resolves.toMatchObject({
      lockedSurfaces: { chat: true },
      usage: {
        lifetimeFreePromptCount: 3,
        textPromptCount: 3,
      },
    });
  });

  it("rejects non-test emails and non-dev deployment markers", async () => {
    const t = testConvex();

    await expect(
      t.mutation(internalBillingApi.billing.devResetTestBillingUsageInternal, {
        clerkUserId: "user_target",
        email: "learner@example.com",
        deployment: "dev:test-deployment",
      }),
    ).rejects.toThrow("Billing reset is limited to +clerk_test email addresses.");

    await expect(
      t.mutation(internalBillingApi.billing.devResetTestBillingUsageInternal, {
        clerkUserId: "user_target",
        email: "studi-agent+clerk_test@example.com",
        deployment: "prod:live-deployment",
      }),
    ).rejects.toThrow("Billing reset is limited to dev Convex deployments.");
  });

  it("rejects negative billing increments", async () => {
    const t = testConvex();

    await expect(
      t.mutation(internalBillingApi.billing.recordTextAiCostInternal, {
        userId: "user_target",
        textPromptCount: -1,
        textAiCostUsd: 0,
      }),
    ).rejects.toThrow("textPromptCount must be a nonnegative finite number.");

    await expect(
      t.mutation(internalBillingApi.billing.incrementFreeOnboardingUsageInternal, {
        userId: "user_target",
        promptCount: 0,
        textAiCostUsd: -0.01,
      }),
    ).rejects.toThrow("textAiCostUsd must be a nonnegative finite number.");
  });
});
