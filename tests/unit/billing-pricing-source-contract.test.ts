import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

describe("billing and pricing UX contract", () => {
  it("uses one canonical plan catalog across landing, pricing, and settings", () => {
    const landing = readSource("components/landing/LandingPage.tsx");
    const waitlist = readSource("components/landing/WaitlistForm.tsx");
    const pricing = readSource("app/pricing/page.tsx");
    const settings = readSource("components/settings/UsagePanel.tsx");

    expect(landing).toContain("PRICING_FAQ_ANSWER");
    expect(waitlist).toContain("WAITLIST_PRICING_ASSURANCE");
    expect(pricing).toContain("STUDI_PLAN_CATALOG");
    expect(settings).toContain("getStudiPlan");

    expect(landing).not.toMatch(/introduce a paid plan later/i);
    expect(waitlist).not.toMatch(/free for students/i);
    expect(pricing).not.toMatch(/Intro gives you/i);
    expect(settings).not.toMatch(/Intro gives you/i);
  });

  it("labels AI-capacity percentage and chat prompts as separate usage dimensions", () => {
    const settings = readSource("components/settings/UsagePanel.tsx");

    expect(settings).toContain("buildMonthlyUsageDisplay");
    expect(settings).toContain('role="progressbar"');
    expect(settings).toContain("capacityLabel");
    expect(settings).toContain("promptLabel");
    expect(settings).not.toContain(
      "detail={`${formatInteger(billing.usage.textPromptCount)} prompts this month`}",
    );
  });

  it("reserves responsive space for Clerk pricing before its client content arrives", () => {
    const pricing = readSource("app/pricing/page.tsx");
    const settings = readSource("components/settings/UsagePanel.tsx");
    const styles = readSource("app/globals.css");

    expect(pricing).toContain("ClerkPricingTableShell");
    expect(settings).toContain("ClerkPricingTableShell");
    expect(styles).toContain(".studi-pricing-table-reserve");
    expect(styles).toMatch(/\.studi-pricing-table-reserve[\s\S]*min-height/);
  });

  it("provides Studi plan benefits and explains the remote Clerk boundary", () => {
    const pricing = readSource("app/pricing/page.tsx");
    const settings = readSource("components/settings/UsagePanel.tsx");

    expect(pricing).toContain("PlanBenefits");
    expect(settings).toContain("PlanBenefits");
    expect(pricing).toContain("CLERK_BILLING_BOUNDARY_COPY");
    expect(settings).toContain("CLERK_BILLING_BOUNDARY_COPY");
  });

  it("disables prefetch for the signed-out pricing link to protected chat", () => {
    const pricing = readSource("app/pricing/page.tsx");

    expect(pricing).toMatch(
      /<Link[\s\S]{0,500}href="\/chat"[\s\S]{0,500}prefetch=\{false\}/,
    );
  });
});
