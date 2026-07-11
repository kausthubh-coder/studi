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

const DEFAULT_DEV_TEST_EMAIL = "studi-agent+clerk_test@example.com";
const CLERK_TEST_EMAIL_PATTERN = /^[^@\s+]+\+clerk_test@[^@\s]+\.[^@\s]+$/i;

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

const codeSparkRunEntitlementValidator = v.object({
  planKey: billingPlanKeyValidator,
  status: billingStatusValidator,
  billingPeriod: v.string(),
  billingPeriodStart: v.number(),
  billingPeriodEnd: v.number(),
  monthlyRunLimit: v.number(),
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

// A cumulative provider-execution ceiling complements the short burst limit.
// The defaults scale with each plan's total monthly budget and can be revisited
// once provider-level cost telemetry is available.
const CODE_SPARK_MONTHLY_RUN_LIMITS: Record<BillingPlanKey, number> = {
  free_onboarding: 15,
  intro: 200,
  pro: 600,
};

function getBillingPeriodBounds(at: number) {
  const now = new Date(at);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return {
    billingPeriod: new Date(start).toISOString().split("T")[0]!,
    billingPeriodStart: start,
    billingPeriodEnd: end,
  };
}

function getBillingPeriod(at: number) {
  return getBillingPeriodBounds(at).billingPeriod;
}

function roundUsd(value: number) {
  return Number(value.toFixed(8));
}

function assertNonNegativeFiniteNumber(name: string, value: number | undefined) {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0) {
    throw new ConvexError({
      code: "INVALID_BILLING_DELTA",
      message: `${name} must be a nonnegative finite number.`,
    });
  }
}

function isAllowedClerkTestEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return (
    normalized === DEFAULT_DEV_TEST_EMAIL ||
    CLERK_TEST_EMAIL_PATTERN.test(normalized)
  );
}

function parseDevTestBillingResetTargets(value: string | undefined) {
  const targets = new Map<string, string>();
  const raw = maybeString(value);
  if (!raw) return targets;

  const pairs: Array<[string, unknown]> = [];
  if (raw.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ConvexError({
        code: "INVALID_TEST_ACCOUNT_CONFIG",
        message: "Invalid DEV_TEST_BILLING_RESET_TARGETS configuration.",
      });
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ConvexError({
        code: "INVALID_TEST_ACCOUNT_CONFIG",
        message: "Invalid DEV_TEST_BILLING_RESET_TARGETS configuration.",
      });
    }
    pairs.push(...Object.entries(parsed));
  } else {
    for (const entry of raw.split(/[\n,;]/)) {
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) {
        throw new ConvexError({
          code: "INVALID_TEST_ACCOUNT_CONFIG",
          message: "Invalid DEV_TEST_BILLING_RESET_TARGETS configuration.",
        });
      }
      pairs.push([trimmed.slice(0, separator), trimmed.slice(separator + 1)]);
    }
  }

  for (const [email, userIdValue] of pairs) {
    const normalizedEmail = email.trim().toLowerCase();
    const userId = maybeString(userIdValue);
    if (!isAllowedClerkTestEmail(normalizedEmail) || !userId) {
      throw new ConvexError({
        code: "INVALID_TEST_ACCOUNT_CONFIG",
        message: "Invalid DEV_TEST_BILLING_RESET_TARGETS configuration.",
      });
    }
    targets.set(normalizedEmail, userId);
  }

  return targets;
}

function expectedDevTestClerkUserIdForEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const configuredTargets = parseDevTestBillingResetTargets(
    process.env.DEV_TEST_BILLING_RESET_TARGETS,
  );
  const configuredUserId = configuredTargets.get(normalizedEmail);
  if (configuredUserId) return configuredUserId;

  const defaultUserId = maybeString(process.env.DEV_TEST_CLERK_USER_ID);
  if (normalizedEmail === DEFAULT_DEV_TEST_EMAIL && defaultUserId) {
    return defaultUserId;
  }

  return undefined;
}

function isDevDeploymentMarker(value: string | undefined) {
  return typeof value === "string" && /^dev:[a-z0-9-]+$/i.test(value.trim());
}

function assertDevTestBillingResetAllowed(args: {
  email: string;
  deployment: string;
}) {
  const email = args.email.trim().toLowerCase();
  if (!isAllowedClerkTestEmail(email)) {
    throw new ConvexError({
      code: "UNSAFE_TEST_ACCOUNT",
      message: "Billing reset is limited to +clerk_test email addresses.",
    });
  }

  const deploymentMarkers = [
    maybeString(process.env.CONVEX_DEPLOYMENT),
    args.deployment,
  ].filter((value): value is string => Boolean(value));

  if (deploymentMarkers.length === 0) {
    throw new ConvexError({
      code: "UNSAFE_DEPLOYMENT",
      message: "Billing reset requires an explicit dev deployment marker.",
    });
  }

  for (const deployment of deploymentMarkers) {
    if (!isDevDeploymentMarker(deployment)) {
      throw new ConvexError({
        code: "UNSAFE_DEPLOYMENT",
        message: "Billing reset is limited to dev Convex deployments.",
      });
    }
  }
}

function assertDevTestBillingResetTarget(args: {
  email: string;
  clerkUserId: string;
}) {
  const expectedClerkUserId = expectedDevTestClerkUserIdForEmail(args.email);
  if (!expectedClerkUserId) {
    throw new ConvexError({
      code: "UNSAFE_TEST_ACCOUNT",
      message:
        "Billing reset requires DEV_TEST_BILLING_RESET_TARGETS to pair the test email with its Clerk user id.",
    });
  }

  if (args.clerkUserId !== expectedClerkUserId) {
    throw new ConvexError({
      code: "CLERK_USER_MISMATCH",
      message:
        "Billing reset email does not match the requested Clerk user id.",
    });
  }
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
  surface: "chat" | "attachments";
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
  return resolvePlanStateFromProfile({
    profile,
    planHint: args.planHint,
  });
}

function resolvePlanStateFromProfile(args: {
  profile: Doc<"billingProfiles"> | null;
  planHint?: string;
}) {
  const hintedPlanKey = normalizePlanKey(args.planHint);
  const planKey =
    args.planHint && hintedPlanKey !== "free_onboarding"
      ? hintedPlanKey
      : args.profile?.planKey ?? "free_onboarding";
  const status =
    planKey === "free_onboarding"
      ? "onboarding"
      : args.profile?.status ?? "active";

  return {
    planKey,
    status: normalizeStatus(status),
  };
}

function hasCurrentPlanAccess(args: {
  planKey: BillingPlanKey;
  status: BillingStatus;
  profile: Doc<"billingProfiles"> | null;
  at: number;
}) {
  if (args.planKey === "free_onboarding") {
    return true;
  }

  return (
    args.status === "active" ||
    (args.status === "canceled" &&
      typeof args.profile?.currentPeriodEnd === "number" &&
      args.profile.currentPeriodEnd > args.at)
  );
}

function getUpgradeTarget(planKey: BillingPlanKey): "intro" | "pro" | undefined {
  if (planKey === "free_onboarding") return "intro";
  if (planKey === "intro") return "pro";
  return undefined;
}

function buildViewerBillingState(args: {
  planKey: BillingPlanKey;
  status: BillingStatus;
  hasCurrentPlanAccess: boolean;
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
  const paidLifecycleLocked =
    args.planKey !== "free_onboarding" && !args.hasCurrentPlanAccess;
  const chatLocked =
    args.planKey === "free_onboarding"
      ? freeChatLocked
      : paidLifecycleLocked || paidChatLocked;

  let upgradeReason: string | undefined;
  if (paidLifecycleLocked) {
    upgradeReason =
      "Your paid plan is not active. Update billing to keep learning.";
  } else if (args.planKey === "free_onboarding") {
    upgradeReason = chatLocked
      ? "You've used your free onboarding chats. Choose a plan to keep going."
      : "Choose a paid plan to unlock uploads.";
  } else if (args.planKey === "intro") {
    if (chatLocked) {
      upgradeReason =
        "You've reached this month's Starter usage limit. Upgrade to Pro for higher monthly capacity.";
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
      attachments:
        args.planKey === "free_onboarding" || paidLifecycleLocked,
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
  return (await buildBillingContextForUser(args)).state;
}

async function buildBillingContextForUser(args: {
  ctx: Parameters<typeof getBillingProfileDoc>[0] &
    Parameters<typeof getBillingUsageDoc>[0] &
    Parameters<typeof getBillingOnboardingDoc>[0];
  userId: string;
  planHint?: string;
  at?: number;
}) {
  const now = args.at ?? Date.now();
  const billingPeriod = getBillingPeriod(now);
  const [profile, usageDoc, onboardingDoc] = await Promise.all([
    getBillingProfileDoc(args.ctx, args.userId),
    getBillingUsageDoc(args.ctx, args.userId, billingPeriod),
    getBillingOnboardingDoc(args.ctx, args.userId),
  ]);
  const { planKey, status } = resolvePlanStateFromProfile({
    profile,
    planHint: args.planHint,
  });
  const currentPlanAccess = hasCurrentPlanAccess({
    planKey,
    status,
    profile,
    at: now,
  });

  const state = buildViewerBillingState({
    planKey,
    status,
    hasCurrentPlanAccess: currentPlanAccess,
    billingPeriod,
    usage: toUsageRecord(usageDoc),
    onboarding: {
      lifetimeFreePromptCount: onboardingDoc?.lifetimeFreePromptCount ?? 0,
      lifetimeFreeTextAiCostUsd: onboardingDoc?.lifetimeFreeTextAiCostUsd ?? 0,
    },
  });

  return {
    state,
    hasCurrentPlanAccess: currentPlanAccess,
  };
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
  assertNonNegativeFiniteNumber("textPromptCount", args.textPromptCount);
  assertNonNegativeFiniteNumber("textAiCostUsd", args.textAiCostUsd);

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
    assertNonNegativeFiniteNumber("textPromptCount", args.textPromptCount);
    assertNonNegativeFiniteNumber("textAiCostUsd", args.textAiCostUsd);

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
    assertNonNegativeFiniteNumber("promptCount", args.promptCount);
    assertNonNegativeFiniteNumber("textAiCostUsd", args.textAiCostUsd);

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

export const devResetTestBillingUsageInternal = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    deployment: v.string(),
  },
  returns: v.object({
    billingPeriod: v.string(),
    resetOnboarding: v.boolean(),
    resetCurrentPeriod: v.boolean(),
    resetCodeSparkReservations: v.number(),
    resetCodeSparkUsage: v.number(),
    before: v.object({
      lifetimeFreePromptCount: v.number(),
      lifetimeFreeTextAiCostUsd: v.number(),
      textPromptCount: v.number(),
      textAiCostUsd: v.number(),
      totalEstimatedCostUsd: v.number(),
    }),
    after: v.object({
      lifetimeFreePromptCount: v.number(),
      lifetimeFreeTextAiCostUsd: v.number(),
      textPromptCount: v.number(),
      textAiCostUsd: v.number(),
      totalEstimatedCostUsd: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    assertDevTestBillingResetAllowed({
      email: args.email,
      deployment: args.deployment,
    });

    const clerkUserId = args.clerkUserId.trim();
    if (!clerkUserId) {
      throw new ConvexError({
        code: "INVALID_CLERK_USER_ID",
        message: "clerkUserId is required.",
      });
    }
    assertDevTestBillingResetTarget({
      email: args.email,
      clerkUserId,
    });

    const billingPeriod = getBillingPeriod(Date.now());
    const [usageDoc, onboardingDoc] = await Promise.all([
      getBillingUsageDoc(ctx, clerkUserId, billingPeriod),
      getBillingOnboardingDoc(ctx, clerkUserId),
    ]);

    const before = {
      lifetimeFreePromptCount: onboardingDoc?.lifetimeFreePromptCount ?? 0,
      lifetimeFreeTextAiCostUsd: onboardingDoc?.lifetimeFreeTextAiCostUsd ?? 0,
      textPromptCount: usageDoc?.textPromptCount ?? 0,
      textAiCostUsd: usageDoc?.textAiCostUsd ?? 0,
      totalEstimatedCostUsd: usageDoc?.totalEstimatedCostUsd ?? 0,
    };

    const now = Date.now();
    let resetOnboarding = false;
    let resetCurrentPeriod = false;

    if (onboardingDoc) {
      await ctx.db.patch(onboardingDoc._id, {
        lifetimeFreePromptCount: 0,
        lifetimeFreeTextAiCostUsd: 0,
        updatedAt: now,
      });
      resetOnboarding = true;
    }

    if (usageDoc) {
      await ctx.db.patch(usageDoc._id, {
        textPromptCount: 0,
        textAiCostUsd: 0,
        totalEstimatedCostUsd: 0,
        updatedAt: now,
      });
      resetCurrentPeriod = true;
    }

    const codeSparkUsage = await ctx.db
      .query("codeSparkUsage")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", clerkUserId))
      .collect();
    for (const usage of codeSparkUsage) {
      await ctx.db.delete(usage._id);
    }
    const codeSparkReservations = await ctx.db
      .query("codeSparkRunReservations")
      .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", clerkUserId))
      .collect();
    for (const reservation of codeSparkReservations) {
      await ctx.db.delete(reservation._id);
    }

    return {
      billingPeriod,
      resetOnboarding,
      resetCurrentPeriod,
      resetCodeSparkReservations: codeSparkReservations.length,
      resetCodeSparkUsage: codeSparkUsage.length,
      before,
      after: {
        lifetimeFreePromptCount: 0,
        lifetimeFreeTextAiCostUsd: 0,
        textPromptCount: 0,
        textAiCostUsd: 0,
        totalEstimatedCostUsd: 0,
      },
    };
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
    const { state, hasCurrentPlanAccess } = await buildBillingContextForUser({
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

    if (!hasCurrentPlanAccess && (args.attachmentCount ?? 0) > 0) {
      throwBillingError({
        code: "BILLING_REQUIRED",
        surface: "attachments",
        planKey: state.planKey,
        message: "Uploads require an active paid plan.",
        upgradeTarget: getUpgradeTarget(state.planKey),
      });
    }

    if (!hasCurrentPlanAccess) {
      throwBillingError({
        code: "BILLING_REQUIRED",
        surface: "chat",
        planKey: state.planKey,
        message: "Text tutoring requires an active paid plan.",
        upgradeTarget: getUpgradeTarget(state.planKey),
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
    const { state, hasCurrentPlanAccess } = await buildBillingContextForUser({
      ctx,
      userId: args.userId,
      planHint: args.planHint,
    });

    if (state.planKey === "free_onboarding") {
      throwBillingError({
        code: "PLAN_REQUIRED",
        surface: "attachments",
        planKey: state.planKey,
        message: "Uploads are available on paid plans only.",
        upgradeTarget: "intro",
      });
    }

    if (!hasCurrentPlanAccess) {
      throwBillingError({
        code: "BILLING_REQUIRED",
        surface: "attachments",
        planKey: state.planKey,
        message: "Uploads require an active paid plan.",
        upgradeTarget: getUpgradeTarget(state.planKey),
      });
    }

    return {
      planKey: state.planKey,
      status: state.status,
    };
  },
});

export const assertCanUseCodeSparkRunInternal = internalMutation({
  args: {
    userId: v.string(),
    planHint: v.optional(v.string()),
  },
  returns: codeSparkRunEntitlementValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const { state, hasCurrentPlanAccess } = await buildBillingContextForUser({
      ctx,
      userId: args.userId,
      planHint: args.planHint,
      at: now,
    });

    if (!hasCurrentPlanAccess) {
      throwBillingError({
        code: "BILLING_REQUIRED",
        surface: "chat",
        planKey: state.planKey,
        message: "Code Spark runs require an active paid plan.",
        upgradeTarget: getUpgradeTarget(state.planKey),
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
          "You have reached your current plan limit for Code Spark runs.",
        upgradeTarget: getUpgradeTarget(state.planKey),
      });
    }

    const period = getBillingPeriodBounds(now);
    return {
      planKey: state.planKey,
      status: state.status,
      ...period,
      monthlyRunLimit: CODE_SPARK_MONTHLY_RUN_LIMITS[state.planKey],
    };
  },
});
