import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const { createWaitlistEntry } = vi.hoisted(() => ({
  createWaitlistEntry: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({
    waitlistEntries: {
      create: createWaitlistEntry,
    },
  }),
}));

function testConvex() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

describe("public waitlist signup boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_waitlist");
    createWaitlistEntry.mockReset();
    createWaitlistEntry.mockResolvedValue({ id: "wle_test" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    "not-an-email",
    "two@@example.com",
    ".learner@example.com",
    "learner..name@example.com",
    `${"a".repeat(65)}@example.com`,
    `learner@${"b".repeat(64)}.com`,
    `${"a".repeat(243)}@example.com`,
  ])("rejects malformed or oversized input before Clerk: %s", async (email) => {
    const t = testConvex();

    await expect(t.action(api.waitlistPublic.joinWaitlist, { email })).resolves.toEqual({
      success: false,
      error: "Please enter a valid email address.",
    });
    expect(createWaitlistEntry).not.toHaveBeenCalled();
  });

  it("trims and lowercases a valid address at the server boundary", async () => {
    const t = testConvex();

    await expect(
      t.action(api.waitlistPublic.joinWaitlist, {
        email: "  Learner.Name@Example.COM  ",
      }),
    ).resolves.toEqual({ success: true });
    expect(createWaitlistEntry).toHaveBeenCalledWith({
      emailAddress: "learner.name@example.com",
    });
  });

  it("enforces the public burst boundary before making another Clerk request", async () => {
    const t = testConvex();

    for (let index = 0; index < 20; index += 1) {
      await expect(
        t.action(api.waitlistPublic.joinWaitlist, {
          email: `learner-${index}@example.com`,
        }),
      ).resolves.toEqual({ success: true });
    }

    await expect(
      t.action(api.waitlistPublic.joinWaitlist, {
        email: "learner-over-limit@example.com",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Too many signup attempts right now. Please wait a moment and try again.",
    });
    expect(createWaitlistEntry).toHaveBeenCalledTimes(20);
  });

  it("allows a retry after the global limiter refills", async () => {
    const t = testConvex();

    for (let index = 0; index < 20; index += 1) {
      await t.action(api.waitlistPublic.joinWaitlist, {
        email: `burst-${index}@example.com`,
      });
    }

    await expect(
      t.action(api.waitlistPublic.joinWaitlist, {
        email: "retry@example.com",
      }),
    ).resolves.toMatchObject({ success: false });

    vi.advanceTimersByTime(1_001);

    await expect(
      t.action(api.waitlistPublic.joinWaitlist, {
        email: "retry@example.com",
      }),
    ).resolves.toEqual({ success: true });
  });

  it("returns the same generic success for a signup and an idempotent rejoin", async () => {
    const t = testConvex();
    createWaitlistEntry
      .mockResolvedValueOnce({ id: "wle_test" })
      .mockRejectedValueOnce(new Error("Email already exists on the waitlist"));

    const first = await t.action(api.waitlistPublic.joinWaitlist, {
      email: "learner@example.com",
    });
    const retry = await t.action(api.waitlistPublic.joinWaitlist, {
      email: "LEARNER@EXAMPLE.COM",
    });

    expect(first).toEqual({ success: true });
    expect(retry).toEqual(first);
    expect(first).not.toHaveProperty("alreadyOnList");
    expect(createWaitlistEntry).toHaveBeenCalledTimes(2);
  });

  it("does not consume all retries when Clerk has a transient failure", async () => {
    const t = testConvex();
    createWaitlistEntry
      .mockRejectedValueOnce(new Error("Clerk temporarily unavailable"))
      .mockResolvedValueOnce({ id: "wle_retry" });

    await expect(
      t.action(api.waitlistPublic.joinWaitlist, {
        email: "retry@example.com",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Something went wrong. Please try again.",
    });
    await expect(
      t.action(api.waitlistPublic.joinWaitlist, {
        email: "retry@example.com",
      }),
    ).resolves.toEqual({ success: true });
  });
});
