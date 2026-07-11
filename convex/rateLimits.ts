import { ConvexError } from "convex/values";
import {
  MINUTE,
  RateLimiter,
  SECOND,
  isRateLimitError,
} from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
import type { BillingPlanKey } from "./billing";

export const WAITLIST_JOIN_BURST_CAPACITY = 20;

const rateLimiter = new RateLimiter(components.rateLimiter, {
  chatSendFreeOnboarding: {
    kind: "token bucket",
    rate: 1,
    period: 3 * SECOND,
    capacity: 2,
  },
  chatSendIntro: {
    kind: "token bucket",
    rate: 1,
    period: 2 * SECOND,
    capacity: 4,
  },
  chatSendPro: {
    kind: "token bucket",
    rate: 1,
    period: SECOND,
    capacity: 6,
  },
  waitlistJoinPublic: {
    kind: "token bucket",
    rate: 60,
    period: MINUTE,
    capacity: WAITLIST_JOIN_BURST_CAPACITY,
  },
});

function toRateLimitError(error: unknown, args: {
  surface: "chat";
  planKey: BillingPlanKey;
}) {
  if (!isRateLimitError(error)) {
    throw error;
  }

  throw new ConvexError({
    code: "RATE_LIMITED",
    surface: args.surface,
    planKey: args.planKey,
    message: "You are sending messages too quickly. Please wait a moment.",
    upgradeTarget:
      args.planKey === "free_onboarding"
        ? "intro"
        : args.planKey === "intro"
          ? "pro"
          : undefined,
    retryAfter: error.data.retryAfter,
  });
}

function chatRateLimitName(planKey: BillingPlanKey) {
  if (planKey === "pro") {
    return "chatSendPro";
  }
  if (planKey === "intro") {
    return "chatSendIntro";
  }
  return "chatSendFreeOnboarding";
}

type RateLimitCtx = {
  runMutation: Parameters<typeof rateLimiter.limit>[0]["runMutation"];
  runQuery: Parameters<typeof rateLimiter.limit>[0]["runQuery"];
};

export async function enforceChatSendRateLimit(
  ctx: RateLimitCtx,
  planKey: BillingPlanKey,
  userId: string,
) {
  try {
    await rateLimiter.limit(ctx, chatRateLimitName(planKey), {
      key: userId,
      throws: true,
    });
  } catch (error) {
    toRateLimitError(error, {
      surface: "chat",
      planKey,
    });
  }
}

export async function enforcePublicWaitlistRateLimit(ctx: RateLimitCtx) {
  return rateLimiter.limit(ctx, "waitlistJoinPublic");
}
