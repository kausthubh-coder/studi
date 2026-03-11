"use node";

import {
  createClerkClient,
  type BillingSubscriptionItem,
} from "@clerk/backend";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { capturePosthogEvent } from "./posthog";

const internalApi = internal as unknown as {
  billing: {
    resolveCurrentPlanInternal: FunctionReference<"query", "internal">;
  };
};

function normalizePlanKey(
  value: string | undefined | null,
): "free_onboarding" | "intro" | "pro" {
  if (value === "intro" || value === "pro") {
    return value;
  }
  return "free_onboarding" as const;
}

function normalizeStatus(
  value: string | undefined | null,
): "onboarding" | "active" | "past_due" | "canceled" | "inactive" {
  if (value === "active" || value === "past_due" || value === "canceled") {
    return value;
  }
  if (value === "inactive") {
    return "inactive";
  }
  return "onboarding" as const;
}

function extractPlanHintFromIdentity(
  identity: unknown,
): "intro" | "pro" | undefined {
  if (!identity || typeof identity !== "object") {
    return undefined;
  }

  const stack: unknown[] = [identity];
  const seen = new Set<object>();

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) {
      continue;
    }

    if (typeof node === "string") {
      if (node === "intro" || node === "pro") {
        return node;
      }
      continue;
    }

    if (typeof node !== "object") {
      continue;
    }

    if (seen.has(node)) {
      continue;
    }
    seen.add(node);

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (
        (key === "pla" ||
          key === "plan" ||
          key === "planKey" ||
          key === "planSlug" ||
          key === "slug") &&
        (value === "intro" || value === "pro")
      ) {
        return value;
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          stack.push(item);
        }
      } else if (value && typeof value === "object") {
        stack.push(value);
      } else if (value === "intro" || value === "pro") {
        return value;
      }
    }
  }

  return undefined;
}

function choosePaidSubscriptionItem(items: BillingSubscriptionItem[]) {
  const priority = ["active", "past_due", "upcoming"];
  for (const status of priority) {
    const match = items.find((item) => {
      const slug = item.plan?.slug;
      return item.status === status && (slug === "intro" || slug === "pro");
    });
    if (match) {
      return match;
    }
  }
  return null;
}

function shouldCaptureCheckoutCompleted(args: {
  previous: {
    planKey: "free_onboarding" | "intro" | "pro";
    status: "onboarding" | "active" | "past_due" | "canceled" | "inactive";
  };
  next: {
    planKey: "free_onboarding" | "intro" | "pro";
    status: "onboarding" | "active" | "past_due" | "canceled" | "inactive";
  };
}) {
  if (args.next.planKey === "free_onboarding" || args.next.status !== "active") {
    return false;
  }

  if (
    args.previous.planKey === "free_onboarding" &&
    (args.next.planKey === "intro" || args.next.planKey === "pro")
  ) {
    return true;
  }

  return args.previous.status !== "active";
}

export const syncCurrentUserBillingProfile = action({
  args: {},
  returns: v.object({
    planKey: v.union(
      v.literal("free_onboarding"),
      v.literal("intro"),
      v.literal("pro"),
    ),
    status: v.union(
      v.literal("onboarding"),
      v.literal("active"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("inactive"),
    ),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const planHint = extractPlanHintFromIdentity(identity);
    const previousState = await ctx.runQuery(
      internalApi.billing.resolveCurrentPlanInternal,
      {
        userId: identity.subject,
        planHint,
      },
    );
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      return {
        planKey: planHint ?? "free_onboarding",
        status: planHint ? "active" : "onboarding",
      } as const;
    }

    const clerkClient = createClerkClient({ secretKey });

    try {
      const subscription = await clerkClient.billing.getUserBillingSubscription(
        identity.subject,
      );
      const paidItem = choosePaidSubscriptionItem(subscription.subscriptionItems);
      const planKey = normalizePlanKey(paidItem?.plan?.slug);
      const status =
        planKey === "free_onboarding"
          ? "onboarding"
          : normalizeStatus(paidItem?.status ?? subscription.status);

      await ctx.runMutation(internal.billing.syncBillingProfileInternal, {
        userId: identity.subject,
        planKey,
        status,
        clerkSubscriptionId: subscription.id,
        clerkSubscriptionItemId: paidItem?.id,
        currentPeriodStart: paidItem?.periodStart ?? undefined,
        currentPeriodEnd: paidItem?.periodEnd ?? undefined,
      });

      if (
        shouldCaptureCheckoutCompleted({
          previous: previousState,
          next: { planKey, status },
        })
      ) {
        await capturePosthogEvent({
          event: "checkout_completed",
          distinctId: identity.subject,
          properties: {
            previous_plan_key: previousState.planKey,
            next_plan_key: planKey,
            previous_status: previousState.status,
            next_status: status,
            billing_provider: "clerk",
          },
        });
      }

      return {
        planKey,
        status,
      } as const;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.toLowerCase().includes("404") ||
        message.toLowerCase().includes("not found")
      ) {
        await ctx.runMutation(internal.billing.syncBillingProfileInternal, {
          userId: identity.subject,
          planKey: "free_onboarding",
          status: "onboarding",
        });
        return {
          planKey: "free_onboarding",
          status: "onboarding",
        } as const;
      }
      throw error;
    }
  },
});
