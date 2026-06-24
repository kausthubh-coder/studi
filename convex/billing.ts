/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { enforceChatSendRateLimit } from "./rateLimits";

export type BillingPlanKey = "free_onboarding" | "intro" | "pro";
export type BillingStatus =
  | "onboarding"
  | "active"
  | "past_due"
  | "canceled"
  | "inactive";

type BillingUsageRecord = {
  textPromptCount: number;
  textAiCostUsd: number;
  totalEstimatedCostUsd: number;
};

type BillingCaps = {
  freePromptLimit: number;
  freeTextAiCostUsdLimit: number;
  textAiCostUsdLimit: number;
  totalEstimatedCostUsdLimit: number;
};

const billingPlanKeyValidator = v.union(
  v.literal("free_onboarding"),
  v.literal("intro"),
  v.literal("pro"),
);

const billingStatusValidator = v.union(
  v.literal("onboarding"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("inactive"),
);

const billingCapsValidator = v.object({
  freePromptLimit: v.number(),
  freeTextAiCostUsdLimit: v.number(),
  textAiCostUsdLimit: v.number(),
  totalEstimatedCostUsdLimit: v.number(),
});

const billingUsageValidator = v.object({
  textPromptCount: v.number(),
  textAiCostUsd: v.number(),
  totalEstimatedCostUsd: v.number(),
});

const viewerBillingStateValidator = v.object({
  planKey: billingPlanKeyValidator,
  status: billingStatusValidator,
  billingPeriod: v.string(),
  caps: billingCapsValidator,
  usage: v.object({
    textPromptCount: v.number(),
    textAiCostUsd: v.number(),
    totalEstimatedCostUsd: v.number(),
    lifetimeFreePromptCount: v.number(),
    lifetimeFreeTextAiCostUsd: v.number(),
  }),
  remaining: v.object({
    textAiCostUsd: v.number(),
    totalEstimatedCostUsd: v.number(),
    lifetimeFreePromptCount: v.number(),
  }),
  lockedSurfaces: v.object({
    chat: v.boolean(),
    attachments: v.boolean(),
  }),
  upgradeReason: v.optional(v.string()),
});

const billingProfileSnapshotValidator = v.object({
  planKey: billingPlanKeyValidator,
  status: billingStatusValidator,
});

const PLAN_CAPS: Record<BillingPlanKey, BillingCaps> = {
  free_onboarding: {
    freePromptLimit: 3,
    freeTextAiCostUsdLimit: 0.15,
    textAiCostUsdLimit: 0.15,
    totalEstimatedCostUsdLimit: 0.15,
  },
  intro: {
    freePromptLimit: 0,
    freeTextAiCostUsdLimit: 0,
    textAiCostUsdLimit: 1.5,
    totalEstimatedCostUsdLimit: 2,
  },
  pro: {
    freePromptLimit: 0,
    freeTextAiCostUsdLimit: 0,
    textAiCostUsdLimit: 4.5,
    totalEstimatedCostUsdLimit: 6,
  },
};

function getBillingPeriod(at: number) {
  const now = new Date(at);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return start.toISOString().split("T")[0]!;
}

function roundUsd(value: number) {
  return Number(value.toFixed(8));
}

function clampRemaining(limit: number, used: number) {
  return Math.max(0, roundUsd(limit - used));
}

function clampRemainingCount(limit: number, used: number) {
  return Math.max(0, Math.floor(limit - used));
}

function createEmptyUsage(): BillingUsageRecord {
  return {
    textPromptCount: 0,
    textAiCostUsd: 0,
    totalEstimatedCostUsd: 0,
  };
}

function toUsageRecord(
  usageDoc: Doc<"billingUsagePeriods"> | null | undefined,
): BillingUsageRecord {
  if (!usageDoc) {
    return createEmptyUsage();
  }

  return {
    textPromptCount: usageDoc.textPromptCount,
    textAiCostUsd: usageDoc.textAiCostUsd,
    totalEstimatedCostUsd: usageDoc.totalEstimatedCostUsd,
  };
}

function normalizePlanKey(value: string | undefined | null): BillingPlanKey {
  if (value === "intro" || value === "pro") return value;
  return "free_onboarding";
}

function normalizeStatus(value: string | undefined | null): BillingStatus {
  if (value === "active" || value === "past_due" || value === "canceled") {
    return value;
  }
  if (value === "inactive") return "inactive";
  return "onboarding";
}

function maybeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function extractPlanHintFromIdentity(identity: unknown): BillingPlanKey | undefined {
  if (!identity || typeof identity !== "object") return undefined;

  const stack: unknown[] = [identity];
  const seen = new Set<object>();

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (typeof node === "string") {
      if (node === "intro" || node === "pro") return node;
      continue;
    }
    if (typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (
        key === "pla" ||
        key === "plan" ||
        key === "planKey" ||
        key === "planSlug" ||
        key === "slug"
      ) {
        const candidate = maybeString(value);
        if (candidate === "intro" || candidate === "pro") return candidate;
      }

      if (Array.isArray(value)) {
        stack.push(...value);
      } else if (value && typeof value === "object") {
        stack.push(value);
      } else if (value === "intro" || value === "pro") {
        return value;
      }
    }
  }

  return undefined;
}

function throwBillingError(args: {
  code:
    | "BILLING_REQUIRED"
    | "PLAN_REQUIRED"
    | "USAGE_BUDGET_EXHAUSTED";
  surface: "chat" | "attachments" | "labs";
  planKey: BillingPlanKey;
  message: string;
  upgradeTarget?: "intro" | "pro";
}) {
  throw new ConvexError({
    code: args.code,
    surface: args.surface,
    planKey: args.planKey,
    message: args.message,
    upgradeTarget: args.upgradeTarget,
  });
}

async function getBillingProfileDoc(
  ctx: any,
  userId: string,
): Promise<Doc<"billingProfiles"> | null> {
  return await ctx.db
    .query("billingProfiles")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .unique();
}

async function getBillingUsageDoc(
  ctx: any,
  userId: string,
  billingPeriod: string,
): Promise<Doc<"billingUsagePeriods"> | null> {
  return await ctx.db
    .query("billingUsagePeriods")
    .withIndex("by_userId_and_billingPeriod", (q: any) =>
      q.eq("userId", userId).eq("billingPeriod", billingPeriod),
    )
    .unique();
}

async function getBillingOnboardingDoc(
  ctx: any,
  userId: string,
): Promise<Doc<"billingOnboarding"> | null> {
  return await ctx.db
    .query("billingOnboarding")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .unique();
}

async function resolvePlanState(args: {
  ctx: Parameters<typeof getBillingProfileDoc>[0];
  userId: string;
  planHint?: string;
}) {
  const profile = await getBillingProfileDoc(args.ctx, args.userId);
  const hintedPlanKey = normalizePlanKey(args.planHint);
  const planKey =
    args.planHint && hintedPlanKey !== "free_onboarding"
      ? hintedPlanKey
      : profile?.planKey ?? "free_onboarding";
  const status =
    planKey === "free_onboarding"
      ? "onboarding"
      : profile?.status ?? "active";

  return {
    planKey,
    status: normalizeStatus(status),
  };
}

function getUpgradeTarget(planKey: BillingPlanKey): "intro" | "pro" | undefined {
  if (planKey === "free_onboarding") return "intro";
  if (planKey === "intro") return "pro";
  return undefined;
}

function buildViewerBillingState(args: {
  planKey: BillingPlanKey;
  status: BillingStatus;
  billingPeriod: string;
  usage: BillingUsageRecord;
  onboarding: {
    lifetimeFreePromptCount: number;
    lifetimeFreeTextAiCostUsd: number;
  };
}) {
  const caps = PLAN_CAPS[args.planKey];
  const totalBudgetExceeded =
    args.usage.totalEstimatedCostUsd >= caps.totalEstimatedCostUsdLimit;

  const freeChatLocked =
    args.onboarding.lifetimeFreePromptCount >= caps.freePromptLimit ||
    args.onboarding.lifetimeFreeTextAiCostUsd >= caps.freeTextAiCostUsdLimit;
  const paidChatLocked =
    args.usage.textAiCostUsd >= caps.textAiCostUsdLimit || totalBudgetExceeded;
  const chatLocked =
    args.planKey === "free_onboarding" ? freeChatLocked : paidChatLocked;

  let upgradeReason: string | undefined;
  if (args.planKey === "free_onboarding") {
    upgradeReason = chatLocked
      ? "You've used your free onboarding chats. Choose a plan to keep going."
      : "Choose a paid plan to unlock uploads.";
  } else if (args.planKey === "intro") {
    if (chatLocked) {
      upgradeReason =
        "You've reached this month's Intro usage limit. Upgrade to Pro for higher monthly capacity.";
    }
  } else if (chatLocked) {
    upgradeReason =
      "You've reached this month's Pro usage limit. Contact support if you need a higher cap.";
  }

  return {
    planKey: args.planKey,
    status: args.status,
    billingPeriod: args.billingPeriod,
    caps,
    usage: {
      ...args.usage,
      lifetimeFreePromptCount: args.onboarding.lifetimeFreePromptCount,
      lifetimeFreeTextAiCostUsd: args.onboarding.lifetimeFreeTextAiCostUsd,
    },
    remaining: {
      textAiCostUsd: clampRemaining(
        caps.textAiCostUsdLimit,
        args.usage.textAiCostUsd,
      ),
      totalEstimatedCostUsd: clampRemaining(
        caps.totalEstimatedCostUsdLimit,
        args.usage.totalEstimatedCostUsd,
      ),
      lifetimeFreePromptCount: clampRemainingCount(
        caps.freePromptLimit,
        args.onboarding.lifetimeFreePromptCount,
      ),
    },
    lockedSurfaces: {
      chat: chatLocked,
      attachments: args.planKey === "free_onboarding",
    },
    upgradeReason,
  };
}

async function buildViewerBillingStateForUser(args: {
  ctx: Parameters<typeof getBillingProfileDoc>[0] &
    Parameters<typeof getBillingUsageDoc>[0] &
    Parameters<typeof getBillingOnboardingDoc>[0];
  userId: string;
  planHint?: string;
}) {
  const billingPeriod = getBillingPeriod(Date.now());
  const [{ planKey, status }, usageDoc, onboardingDoc] = await Promise.all([
    resolvePlanState({
      ctx: args.ctx,
      userId: args.userId,
      planHint: args.planHint,
    }),
    getBillingUsageDoc(args.ctx, args.userId, billingPeriod),
    getBillingOnboardingDoc(args.ctx, args.userId),
  ]);

  return buildViewerBillingState({
    planKey,
    status,
    billingPeriod,
    usage: toUsageRecord(usageDoc),
    onboarding: {
      lifetimeFreePromptCount: onboardingDoc?.lifetimeFreePromptCount ?? 0,
      lifetimeFreeTextAiCostUsd: onboardingDoc?.lifetimeFreeTextAiCostUsd ?? 0,
    },
  });
}

async function ensureUsageRow(
  ctx: any,
  args: {
    userId: string;
    billingPeriod: string;
  },
) {
  const existing = await getBillingUsageDoc(
    ctx,
    args.userId,
    args.billingPeriod,
  );
  if (existing) return existing;

  const id = await ctx.db.insert("billingUsagePeriods", {
    userId: args.userId,
    billingPeriod: args.billingPeriod,
    textPromptCount: 0,
    textAiCostUsd: 0,
    totalEstimatedCostUsd: 0,
    updatedAt: Date.now(),
  });
  return await ctx.db.get(id);
}

async function patchUsageDelta(
  ctx: any,
  args: {
    userId: string;
    billingPeriod?: string;
    textPromptCount?: number;
    textAiCostUsd?: number;
  },
) {
  const billingPeriod = args.billingPeriod ?? getBillingPeriod(Date.now());
  const current = await ensureUsageRow(ctx, {
    userId: args.userId,
    billingPeriod,
  });
  if (!current) throw new Error("Failed to create billing usage row");

  await ctx.db.patch(current._id, {
    textPromptCount: current.textPromptCount + (args.textPromptCount ?? 0),
    textAiCostUsd: roundUsd(current.textAiCostUsd + (args.textAiCostUsd ?? 0)),
    totalEstimatedCostUsd: roundUsd(
      current.totalEstimatedCostUsd + (args.textAiCostUsd ?? 0),
    ),
    updatedAt: Date.now(),
  });
}

async function ensureOnboardingRow(
  ctx: any,
  userId: string,
) {
  const existing = await getBillingOnboardingDoc(ctx, userId);
  if (existing) return existing;

  const now = Date.now();
  const id = await ctx.db.insert("billingOnboarding", {
    userId,
    lifetimeFreePromptCount: 0,
    lifetimeFreeTextAiCostUsd: 0,
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(id);
}

export const getViewerBillingState = query({
  args: {},
  returns: viewerBillingStateValidator,
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    return await buildViewerBillingStateForUser({
      ctx,
      userId: identity.subject,
      planHint: extractPlanHintFromIdentity(identity),
    });
  },
});

export const resolveCurrentPlanInternal = internalQuery({
  args: {
    userId: v.string(),
    planHint: v.optional(v.string()),
  },
  returns: billingProfileSnapshotValidator,
  handler: async (ctx, args) => {
    return await resolvePlanState({
      ctx,
      userId: args.userId,
      planHint: args.planHint,
    });
  },
});

export const getBillingUsageForCurrentPeriodInternal = internalQuery({
  args: {
    userId: v.string(),
  },
  returns: billingUsageValidator,
  handler: async (ctx, args) => {
    return toUsageRecord(
      await getBillingUsageDoc(ctx, args.userId, getBillingPeriod(Date.now())),
    );
  },
});

export const syncBillingProfileInternal = internalMutation({
  args: {
    userId: v.string(),
    planKey: billingPlanKeyValidator,
    status: billingStatusValidator,
    clerkSubscriptionId: v.optional(v.string()),
    clerkSubscriptionItemId: v.optional(v.string()),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    trialEndsAt: v.optional(v.number()),
  },
  returns: billingProfileSnapshotValidator,
  handler: async (ctx, args) => {
    const existing = await getBillingProfileDoc(ctx, args.userId);
    const patch = {
      planKey: args.planKey,
      status: args.status,
      clerkSubscriptionId: args.clerkSubscriptionId,
      clerkSubscriptionItemId: args.clerkSubscriptionItemId,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      trialEndsAt: args.trialEndsAt,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("billingProfiles", {
        userId: args.userId,
        ...patch,
      });
    }

    return {
      planKey: args.planKey,
      status: args.status,
    };
  },
});

export const recordTextAiCostInternal = internalMutation({
  args: {
    userId: v.string(),
    billingPeriod: v.optional(v.string()),
    textPromptCount: v.optional(v.number()),
    textAiCostUsd: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await patchUsageDelta(ctx, {
      userId: args.userId,
      billingPeriod: args.billingPeriod,
      textPromptCount: args.textPromptCount ?? 0,
      textAiCostUsd: args.textAiCostUsd ?? 0,
    });
    return null;
  },
});

export const incrementFreeOnboardingUsageInternal = internalMutation({
  args: {
    userId: v.string(),
    promptCount: v.optional(v.number()),
    textAiCostUsd: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ensureOnboardingRow(ctx, args.userId);
    if (!row) throw new Error("Failed to create onboarding usage row");

    await ctx.db.patch(row._id, {
      lifetimeFreePromptCount:
        row.lifetimeFreePromptCount + (args.promptCount ?? 0),
      lifetimeFreeTextAiCostUsd: roundUsd(
        row.lifetimeFreeTextAiCostUsd + (args.textAiCostUsd ?? 0),
      ),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const assertCanSendMessageInternal = internalMutation({
  args: {
    userId: v.string(),
    planHint: v.optional(v.string()),
    attachmentCount: v.optional(v.number()),
  },
  returns: billingProfileSnapshotValidator,
  handler: async (ctx, args) => {
    const state = await buildViewerBillingStateForUser({
      ctx,
      userId: args.userId,
      planHint: args.planHint,
    });

    if (state.planKey === "free_onboarding" && (args.attachmentCount ?? 0) > 0) {
      throwBillingError({
        code: "PLAN_REQUIRED",
        surface: "attachments",
        planKey: state.planKey,
        message: "Uploads are available on paid plans only.",
        upgradeTarget: "intro",
      });
    }

    if (state.lockedSurfaces.chat) {
      throwBillingError({
        code:
          state.planKey === "free_onboarding"
            ? "BILLING_REQUIRED"
            : "USAGE_BUDGET_EXHAUSTED",
        surface: "chat",
        planKey: state.planKey,
        message:
          state.upgradeReason ??
          "You have reached your current plan limit for text tutoring.",
        upgradeTarget: getUpgradeTarget(state.planKey),
      });
    }

    await enforceChatSendRateLimit(ctx, state.planKey, args.userId);

    return {
      planKey: state.planKey,
      status: state.status,
    };
  },
});

export const assertCanUseAttachmentsInternal = internalMutation({
  args: {
    userId: v.string(),
    planHint: v.optional(v.string()),
  },
  returns: billingProfileSnapshotValidator,
  handler: async (ctx, args) => {
    const state = await buildViewerBillingStateForUser({
      ctx,
      userId: args.userId,
      planHint: args.planHint,
    });

    if (state.lockedSurfaces.attachments) {
      throwBillingError({
        code: "PLAN_REQUIRED",
        surface: "attachments",
        planKey: state.planKey,
        message: "Uploads are available on paid plans only.",
        upgradeTarget: "intro",
      });
    }

    return {
      planKey: state.planKey,
      status: state.status,
    };
  },
});

export const assertCanUseLabsInternal = internalMutation({
  args: {
    userId: v.string(),
    planHint: v.optional(v.string()),
  },
  returns: billingProfileSnapshotValidator,
  handler: async (ctx, args) => {
    const state = await buildViewerBillingStateForUser({
      ctx,
      userId: args.userId,
      planHint: args.planHint,
    });

    if (state.planKey === "free_onboarding") {
      throwBillingError({
        code: "PLAN_REQUIRED",
        surface: "labs",
        planKey: state.planKey,
        message: "Labs are available on paid plans only.",
        upgradeTarget: "intro",
      });
    }

    if (state.lockedSurfaces.chat) {
      throwBillingError({
        code: "USAGE_BUDGET_EXHAUSTED",
        surface: "labs",
        planKey: state.planKey,
        message:
          state.upgradeReason ??
          "You have reached your current plan limit for lab runtime usage.",
        upgradeTarget: getUpgradeTarget(state.planKey),
      });
    }

    return {
      planKey: state.planKey,
      status: state.status,
    };
  },
});
