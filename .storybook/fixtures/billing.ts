export type StoryBillingState = {
  planKey: "free_onboarding" | "intro" | "pro";
  status: "onboarding" | "active" | "past_due" | "canceled" | "inactive";
  billingPeriod: string;
  caps: {
    freePromptLimit: number;
    textPromptLimit: number;
    freeTextAiCostUsdLimit: number;
    textAiCostUsdLimit: number;
    totalEstimatedCostUsdLimit: number;
  };
  usage: {
    textPromptCount: number;
    textAiCostUsd: number;
    totalEstimatedCostUsd: number;
    lifetimeFreePromptCount: number;
    lifetimeFreeTextAiCostUsd: number;
  };
  remaining: {
    textPromptCount: number;
    textAiCostUsd: number;
    totalEstimatedCostUsd: number;
    lifetimeFreePromptCount: number;
  };
  lockedSurfaces: {
    chat: boolean;
    attachments: boolean;
  };
  upgradeReason?: string;
};

export const freePreviewBilling = {
  planKey: "free_onboarding",
  status: "onboarding",
  billingPeriod: "2026-07-01",
  caps: {
    freePromptLimit: 3,
    textPromptLimit: 3,
    freeTextAiCostUsdLimit: 0.15,
    textAiCostUsdLimit: 0.15,
    totalEstimatedCostUsdLimit: 0.15,
  },
  usage: {
    textPromptCount: 1,
    textAiCostUsd: 0.03,
    totalEstimatedCostUsd: 0.03,
    lifetimeFreePromptCount: 1,
    lifetimeFreeTextAiCostUsd: 0.03,
  },
  remaining: {
    textPromptCount: 2,
    textAiCostUsd: 0.12,
    totalEstimatedCostUsd: 0.12,
    lifetimeFreePromptCount: 2,
  },
  lockedSurfaces: {
    chat: false,
    attachments: true,
  },
} satisfies StoryBillingState;

export const exhaustedPreviewBilling = {
  ...freePreviewBilling,
  usage: {
    ...freePreviewBilling.usage,
    textPromptCount: 3,
    textAiCostUsd: 0.15,
    totalEstimatedCostUsd: 0.15,
    lifetimeFreePromptCount: 3,
    lifetimeFreeTextAiCostUsd: 0.15,
  },
  remaining: {
    textPromptCount: 0,
    textAiCostUsd: 0,
    totalEstimatedCostUsd: 0,
    lifetimeFreePromptCount: 0,
  },
  lockedSurfaces: {
    chat: true,
    attachments: true,
  },
  upgradeReason:
    "You have used your free onboarding chats. Choose a plan to keep learning.",
} satisfies StoryBillingState;

export const introBilling = {
  planKey: "intro",
  status: "active",
  billingPeriod: "2026-07-01",
  caps: {
    freePromptLimit: 0,
    textPromptLimit: 150,
    freeTextAiCostUsdLimit: 0,
    textAiCostUsdLimit: 1.5,
    totalEstimatedCostUsdLimit: 2,
  },
  usage: {
    textPromptCount: 38,
    textAiCostUsd: 0.42,
    totalEstimatedCostUsd: 0.62,
    lifetimeFreePromptCount: 3,
    lifetimeFreeTextAiCostUsd: 0.12,
  },
  remaining: {
    textPromptCount: 112,
    textAiCostUsd: 1.08,
    totalEstimatedCostUsd: 1.38,
    lifetimeFreePromptCount: 0,
  },
  lockedSurfaces: {
    chat: false,
    attachments: false,
  },
} satisfies StoryBillingState;

export const proBilling = {
  ...introBilling,
  planKey: "pro",
  caps: {
    ...introBilling.caps,
    textPromptLimit: 450,
    textAiCostUsdLimit: 4.5,
    totalEstimatedCostUsdLimit: 6,
  },
  remaining: {
    ...introBilling.remaining,
    textPromptCount: 412,
    textAiCostUsd: 4.08,
    totalEstimatedCostUsd: 5.38,
  },
} satisfies StoryBillingState;

export const expiredCanceledIntroBilling = {
  ...introBilling,
  status: "canceled",
  lockedSurfaces: {
    chat: true,
    attachments: true,
  },
  upgradeReason:
    "Your paid plan is not active. Update billing to keep learning.",
} satisfies StoryBillingState;
