import Link from "next/link";
import {
  ClerkPricingTableShell,
  PlanBenefits,
} from "@/components/billing/PricingExperience";
import {
  CLERK_BILLING_BOUNDARY_COPY,
  STUDI_PLAN_CATALOG,
} from "@/lib/billing/plan-catalog";

export default function PricingPage() {
  return (
    <div
      className="min-h-screen px-4 py-8 md:px-6"
      style={{
        background:
          "radial-gradient(1200px 450px at -5% -10%, color-mix(in srgb, var(--accent2) 8%, transparent), transparent 65%), radial-gradient(1100px 500px at 105% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%), var(--bg)",
      }}
    >
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <p
              className="text-sm font-semibold text-accent2"
              style={{ fontFamily: "var(--font-jakarta)" }}
            >
              Pricing
            </p>
            <h1
              className="mt-1 text-4xl leading-tight text-fg md:text-5xl"
              style={{ fontFamily: "var(--font-dm-serif)" }}
            >
              Pick the plan that matches your pace
            </h1>
            <p
              className="mt-3 max-w-2xl text-base leading-7 text-fg-muted"
              style={{ fontFamily: "var(--font-jakarta)" }}
            >
              Start with a guided preview, choose Starter for everyday learning,
              or move to Pro when you need more monthly capacity.
            </p>
          </div>
          <Link
            href="/chat"
            prefetch={false}
            className="inline-flex min-h-11 w-fit items-center justify-center rounded-full border border-border-warm bg-bg-card px-5 py-2 text-sm font-semibold text-fg-muted transition hover:-translate-y-0.5 hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Back to chat
          </Link>
        </header>

        <main className="space-y-10">
          <PlanBenefits plans={Object.values(STUDI_PLAN_CATALOG)} />
          <ClerkPricingTableShell boundaryCopy={CLERK_BILLING_BOUNDARY_COPY} />
        </main>
      </div>
    </div>
  );
}
