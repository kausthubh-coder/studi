import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, spyOn, waitFor } from "storybook/test";

import {
  exhaustedPreviewBilling,
  expiredCanceledIntroBilling,
  freePreviewBilling,
  introBilling,
  proBilling,
  type StoryBillingState,
} from "../../.storybook/fixtures/billing";
import { UsagePanel } from "./UsagePanel";

const freshPreviewBilling = {
  ...freePreviewBilling,
  usage: {
    ...freePreviewBilling.usage,
    textPromptCount: 0,
    textAiCostUsd: 0,
    totalEstimatedCostUsd: 0,
    lifetimeFreePromptCount: 0,
    lifetimeFreeTextAiCostUsd: 0,
  },
  remaining: {
    textPromptCount: 3,
    textAiCostUsd: 0.15,
    totalEstimatedCostUsd: 0.15,
    lifetimeFreePromptCount: 3,
  },
} satisfies StoryBillingState;

const nearPreviewLimitBilling = {
  ...freePreviewBilling,
  usage: {
    ...freePreviewBilling.usage,
    textPromptCount: 2,
    textAiCostUsd: 0.12,
    totalEstimatedCostUsd: 0.12,
    lifetimeFreePromptCount: 2,
    lifetimeFreeTextAiCostUsd: 0.12,
  },
  remaining: {
    textPromptCount: 1,
    textAiCostUsd: 0.03,
    totalEstimatedCostUsd: 0.03,
    lifetimeFreePromptCount: 1,
  },
  upgradeReason:
    "One free onboarding chat remains. Choose a plan when you are ready to keep learning.",
} satisfies StoryBillingState;

const proNearMonthlyCapBilling = {
  ...proBilling,
  usage: {
    ...proBilling.usage,
    textPromptCount: 324,
    textAiCostUsd: 4.14,
    totalEstimatedCostUsd: 5.55,
  },
  remaining: {
    ...proBilling.remaining,
    textPromptCount: 126,
    textAiCostUsd: 0.36,
    totalEstimatedCostUsd: 0.45,
  },
  upgradeReason: "You are close to this month's text tutoring allowance.",
} satisfies StoryBillingState;

const syncSuccessfully = fn(async () => ({
  planKey: "free_onboarding",
  status: "onboarding",
})).mockName("syncBillingProfile");

const meta = {
  component: UsagePanel,
  tags: ["autodocs", "ai-generated"],
  parameters: {
    layout: "fullscreen",
    studi: {
      convex: {
        queries: {
          "billing:getViewerBillingState": freePreviewBilling,
        },
        actions: {
          "billingActions:syncCurrentUserBillingProfile": syncSuccessfully,
        },
      },
    },
  },
} satisfies Meta<typeof UsagePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingUsage: Story = {
  parameters: {
    studi: {
      convex: {
        queries: { "billing:getViewerBillingState": () => undefined },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading usage data…")).toBeInTheDocument();
    await expect(canvas.queryByText(/workspace ·/i)).not.toBeInTheDocument();
  },
};

export const UsageUnavailable: Story = {
  parameters: {
    studi: {
      convex: {
        queries: { "billing:getViewerBillingState": null },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Usage information unavailable."),
    ).toBeInTheDocument();
  },
};

export const FreshFreePreview: Story = {
  parameters: {
    studi: {
      convex: {
        queries: { "billing:getViewerBillingState": freshPreviewBilling },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByText("Guided preview", { exact: true }),
    ).toHaveLength(2);
    await expect(
      canvas.getByRole("heading", {
        name: "Guided preview",
        level: 2,
      }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("heading", { name: "Prompt volume" }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByText("Preview")).toBeInTheDocument();
    await expect(canvas.getByText("Free prompts left: 3")).toBeInTheDocument();
    await expect(
      canvas.getByRole("progressbar", {
        name: "0% of monthly AI capacity used",
      }),
    ).toHaveAttribute("aria-valuenow", "0");
    await expect(canvas.getAllByText("0 chat prompts sent")).toHaveLength(1);
  },
};

export const FreePreviewNearLimit: Story = {
  parameters: {
    studi: {
      convex: {
        queries: {
          "billing:getViewerBillingState": nearPreviewLimitBilling,
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Free prompts left: 1")).toBeInTheDocument();
    await expect(
      canvas.getByRole("progressbar", {
        name: "80% of monthly AI capacity used",
      }),
    ).toHaveAttribute("aria-valuenow", "80");
    await expect(canvas.getByText("2 chat prompts sent")).toBeInTheDocument();
    await expect(
      canvas.getByText(/one free onboarding chat remains/i),
    ).toBeInTheDocument();
  },
};

export const FreePreviewExhausted: Story = {
  parameters: {
    studi: {
      convex: {
        queries: {
          "billing:getViewerBillingState": exhaustedPreviewBilling,
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Free prompts left: 0")).toBeInTheDocument();
    await expect(
      canvas.getByRole("progressbar", {
        name: "100% of monthly AI capacity used",
      }),
    ).toHaveAttribute("aria-valuenow", "100");
    await expect(
      canvas.getByText(/choose a plan to keep learning/i),
    ).toBeInTheDocument();
  },
};

export const StarterPlan: Story = {
  parameters: {
    studi: {
      convex: {
        queries: { "billing:getViewerBillingState": introBilling },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Starter", level: 2 }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("progressbar", { name: "112 of 150 remaining" }),
    ).toHaveAttribute("aria-valuenow", "25");
    await expect(
      canvas.getByRole("progressbar", {
        name: "28% of monthly AI capacity used",
      }),
    ).toHaveAttribute("aria-valuenow", "28");
    await expect(canvas.getAllByText("38 chat prompts sent")).toHaveLength(2);
    await expect(canvas.queryByText(/guided preview/i)).not.toBeInTheDocument();
  },
};

export const ProNearMonthlyCap: Story = {
  parameters: {
    studi: {
      convex: {
        queries: {
          "billing:getViewerBillingState": proNearMonthlyCapBilling,
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("heading", { name: "Pro", level: 2 }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("progressbar", { name: "126 of 450 remaining" }),
    ).toHaveAttribute("aria-valuenow", "72");
    await expect(
      canvas.getByRole("progressbar", {
        name: "92% of monthly AI capacity used",
      }),
    ).toHaveAttribute("aria-valuenow", "92");
    await expect(canvas.getAllByText("324 chat prompts sent")).toHaveLength(2);
    await expect(
      canvas.getByText(/close to this month's/i),
    ).toBeInTheDocument();
  },
};

export const CanceledPaidAccessExpired: Story = {
  parameters: {
    studi: {
      convex: {
        queries: {
          "billing:getViewerBillingState": expiredCanceledIntroBilling,
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Canceled")).toBeInTheDocument();
    await expect(
      canvas.getByText(/paid plan is not active/i),
    ).toBeInTheDocument();
  },
};

export const BillingTab: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: /billing/i }));
    await expect(
      canvas.getByRole("heading", { name: "Guided preview" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "Starter" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("heading", { name: "Pro" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("region", {
        name: "Storybook pricing table fixture",
      }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Mock pricing plans")).toBeInTheDocument();
    await expect(
      canvas.getByText(/checkout is intentionally disconnected/i),
    ).toBeInTheDocument();
  },
};

export const AccountTab: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("tab", { name: /account/i }));
    await expect(
      canvas.getByRole("region", {
        name: "Storybook user profile fixture",
      }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Ada Lovelace")).toBeInTheDocument();
    await expect(canvas.getByText("ada@storybook.test")).toBeInTheDocument();
  },
};

const signOut = fn(async () => undefined).mockName("storybookSignOut");

export const SignOut: Story = {
  parameters: {
    studi: { auth: { signOut } },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Sign out" }));
    await expect(signOut).toHaveBeenCalledTimes(1);
  },
};

const syncFailure = fn(async () => {
  throw new Error("Storybook billing sync unavailable");
}).mockName("failedBillingProfileSync");

export const SyncFailureIsNonfatal: Story = {
  beforeEach: () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    return () => consoleError.mockRestore();
  },
  parameters: {
    studi: {
      convex: {
        actions: {
          "billingActions:syncCurrentUserBillingProfile": syncFailure,
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await waitFor(() => expect(syncFailure).toHaveBeenCalled());
    await expect(
      canvas.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Ada's workspace · July 2026"),
    ).toBeInTheDocument();
  },
};

export const MobileUsageAndNavigation: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    studi: {
      convex: {
        queries: { "billing:getViewerBillingState": introBilling },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.getByRole("heading", { name: "Starter", level: 2 }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("progressbar", { name: "112 of 150 remaining" }),
    ).toHaveAttribute("aria-valuenow", "25");
    await expect(
      canvas.getByRole("progressbar", {
        name: "28% of monthly AI capacity used",
      }),
    ).toHaveAttribute("aria-valuenow", "28");
    await userEvent.click(canvas.getByRole("tab", { name: /billing/i }));
    await expect(canvas.getByText("Mock pricing plans")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("tab", { name: /usage/i }));
    await expect(canvas.getAllByText("38 chat prompts sent")).toHaveLength(2);
  },
};
