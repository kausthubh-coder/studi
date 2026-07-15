import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import {
  CLERK_BILLING_BOUNDARY_COPY,
  STUDI_PLAN_CATALOG,
} from "@/lib/billing/plan-catalog";
import { ClerkPricingTableShell, PlanBenefits } from "./PricingExperience";

function PricingExperienceStory() {
  return (
    <main className="min-h-screen space-y-10 bg-bg p-6 text-fg md:p-10">
      <PlanBenefits plans={Object.values(STUDI_PLAN_CATALOG)} />
      <ClerkPricingTableShell boundaryCopy={CLERK_BILLING_BOUNDARY_COPY} />
    </main>
  );
}

const meta = {
  title: "Billing/Pricing Experience",
  component: PricingExperienceStory,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PricingExperienceStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CanonicalPlansAndLiveBoundary: Story = {};
