"use client";

import { PricingTable } from "@clerk/nextjs";
import type { StudiPlanDefinition } from "@/lib/billing/plan-catalog";
import { CLERK_UPCOMING_EXPLANATION } from "@/lib/billing/plan-catalog";

const pricingAppearance = {
  variables: {
    colorPrimary: "#e05a3a",
    colorBackground: "var(--bg-card)",
    colorForeground: "#1c1208",
    colorMutedForeground: "#6b5a47",
    colorNeutral: "#8a7968",
    colorBorder: "#e4d9cc",
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    borderRadius: "1rem",
  },
  elements: {
    rootBox: {
      width: "100%",
    },
    pricingTable: {
      width: "100%",
    },
    pricingTableCardDescription: {
      display: "none",
    },
    pricingTableCardFeatures: {
      display: "none",
    },
    card: {
      boxShadow: "none",
      background: "var(--bg-card)",
    },
  },
};

export function PlanBenefits({
  plans,
}: {
  plans: readonly StudiPlanDefinition[];
}) {
  return (
    <section aria-labelledby="studi-plan-benefits-heading">
      <div className="max-w-3xl">
        <p
          className="text-sm font-semibold text-accent2"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Studi plan guide
        </p>
        <h2
          id="studi-plan-benefits-heading"
          className="mt-1 text-2xl leading-tight text-fg"
          style={{ fontFamily: "var(--font-dm-serif)" }}
        >
          Choose by how often you learn
        </h2>
        <p
          className="mt-2 text-sm leading-6 text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          These Studi descriptions explain the learning experience. Live prices
          and purchase status appear separately below.
        </p>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.key}
            className="rounded-2xl border border-border-warm bg-bg-card p-5"
            data-plan-key={plan.key}
          >
            <h3
              className="text-xl text-fg"
              style={{ fontFamily: "var(--font-dm-serif)" }}
            >
              {plan.name}
            </h3>
            <p
              className="mt-2 min-h-12 text-sm leading-5 text-fg-muted"
              style={{ fontFamily: "var(--font-jakarta)" }}
            >
              {plan.summary}
            </p>
            <ul
              className="mt-4 space-y-2 text-sm text-fg-muted"
              style={{ fontFamily: "var(--font-jakarta)" }}
            >
              {plan.benefits.map((benefit) => (
                <li key={benefit} className="flex gap-2 leading-5">
                  <span aria-hidden="true" className="font-bold text-accent2">
                    ✓
                  </span>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ClerkPricingTableShell({
  boundaryCopy,
}: {
  boundaryCopy: string;
}) {
  return (
    <section aria-labelledby="live-billing-heading">
      <div className="max-w-3xl">
        <p
          className="text-sm font-semibold text-accent2"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Live billing details
        </p>
        <h2
          id="live-billing-heading"
          className="mt-1 text-2xl leading-tight text-fg"
          style={{ fontFamily: "var(--font-dm-serif)" }}
        >
          Current prices and availability
        </h2>
        <p
          className="mt-2 text-sm leading-6 text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          {boundaryCopy}
        </p>
      </div>

      <div
        className="studi-pricing-table-reserve mt-5 overflow-hidden rounded-2xl border border-border-warm bg-bg-card p-3 sm:p-5"
        data-layout-reserve="responsive"
        data-testid="clerk-pricing-table-shell"
      >
        <PricingTable
          appearance={pricingAppearance}
          collapseFeatures={false}
          newSubscriptionRedirectUrl="/settings?from=checkout"
        />
      </div>

      <p
        className="mt-3 max-w-3xl text-xs leading-5 text-fg-muted"
        style={{ fontFamily: "var(--font-jakarta)" }}
      >
        {CLERK_UPCOMING_EXPLANATION}
      </p>
    </section>
  );
}
