import { describe, expect, it } from "vitest";
import {
  CLERK_BILLING_BOUNDARY_COPY,
  CLERK_UPCOMING_EXPLANATION,
  PRICING_FAQ_ANSWER,
  STUDI_PLAN_CATALOG,
  WAITLIST_PRICING_ASSURANCE,
  getStudiPlan,
  getStudiPlanStatus,
} from "@/lib/billing/plan-catalog";
import { buildMonthlyUsageDisplay } from "@/lib/billing/usage-display";

describe("canonical Studi billing presentation", () => {
  it("uses Starter as the public name for the intro entitlement", () => {
    expect(getStudiPlan("intro").name).toBe("Starter");
    expect(STUDI_PLAN_CATALOG.pro.name).toBe("Pro");
    expect(STUDI_PLAN_CATALOG.free_onboarding.name).toBe("Guided preview");
  });

  it("gives every plan decision-useful benefits without claiming unlimited use", () => {
    for (const plan of Object.values(STUDI_PLAN_CATALOG)) {
      expect(plan.benefits.length).toBeGreaterThanOrEqual(3);
      expect([plan.summary, ...plan.benefits].join(" ")).not.toMatch(
        /unlimited|no limits/i,
      );
    }
  });

  it("keeps live price, availability, and renewal truth assigned to Clerk", () => {
    expect(CLERK_BILLING_BOUNDARY_COPY).toMatch(/Clerk/i);
    expect(CLERK_BILLING_BOUNDARY_COPY).toMatch(/prices|availability|renewal/i);
    expect(CLERK_UPCOMING_EXPLANATION).toMatch(/Upcoming/i);
    expect(PRICING_FAQ_ANSWER).toMatch(/guided preview/i);
    expect(PRICING_FAQ_ANSWER).not.toMatch(/paid monthly plans/i);
    expect(STUDI_PLAN_CATALOG.intro.summary).not.toMatch(/monthly plan/i);
    expect(WAITLIST_PRICING_ASSURANCE).toMatch(/guided preview/i);
  });

  it("explains active, canceled, and preview access without inventing dates", () => {
    expect(getStudiPlanStatus("active").label).toBe("Active");
    expect(getStudiPlanStatus("canceled").detail).toMatch(/paid period/i);
    expect(getStudiPlanStatus("onboarding").label).toBe("Preview");
  });
});

describe("monthly usage presentation", () => {
  it("does not imply that a capacity percentage is a prompt percentage", () => {
    const display = buildMonthlyUsageDisplay({
      textAiCostUsd: 0.01,
      textAiCostUsdLimit: 1.5,
      textPromptCount: 0,
    });

    expect(display.percent).toBe(1);
    expect(display.capacityLabel).toBe("1% of monthly AI capacity used");
    expect(display.promptLabel).toBe("0 chat prompts sent");
    expect(display.explanation).toMatch(/counted separately/i);
  });

  it("clamps malformed values and pluralizes prompt counts", () => {
    const display = buildMonthlyUsageDisplay({
      textAiCostUsd: Number.POSITIVE_INFINITY,
      textAiCostUsdLimit: -1,
      textPromptCount: 1.8,
    });

    expect(display.percent).toBe(0);
    expect(display.promptLabel).toBe("1 chat prompt sent");
  });
});
