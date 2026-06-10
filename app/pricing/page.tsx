import Link from "next/link";
import { PricingTable } from "@clerk/nextjs";

export default function PricingPage() {
  return (
    <div
      className="min-h-screen px-4 py-8 md:px-6"
      style={{
        background:
          "radial-gradient(1200px 450px at -5% -10%, color-mix(in srgb, var(--accent2) 8%, transparent), transparent 65%), radial-gradient(1100px 500px at 105% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%), var(--bg)",
      }}
    >
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p
              className="text-[11px] font-bold uppercase tracking-[0.08em] text-accent2"
              style={{ fontFamily: "var(--font-jakarta)" }}
            >
              Pricing
            </p>
            <h1
              className="mt-1 text-4xl leading-tight text-fg"
              style={{ fontFamily: "var(--font-dm-serif)" }}
            >
              Pick the plan that matches your pace
            </h1>
            <p
              className="mt-2 max-w-2xl text-sm text-fg-muted"
              style={{ fontFamily: "var(--font-jakarta)" }}
            >
              Intro gives you full text tutoring. Pro unlocks higher monthly
              limits.
            </p>
          </div>
          <Link
            href="/chat"
            className="inline-flex w-fit items-center justify-center rounded-full border border-border-warm bg-bg-card px-4 py-2 text-xs font-semibold text-fg-muted transition hover:-translate-y-0.5 hover:border-accent hover:text-accent"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Back to chat
          </Link>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-border-warm bg-bg-card p-3 shadow-[0_1px_3px_rgba(28,18,8,0.04),0_12px_30px_rgba(28,18,8,0.08)] md:p-5">
          <PricingTable newSubscriptionRedirectUrl="/settings?from=checkout" />
        </div>

        <section className="mt-6 rounded-[28px] border border-border-warm bg-bg-card p-5 shadow-[0_1px_3px_rgba(28,18,8,0.04),0_12px_30px_rgba(28,18,8,0.08)]">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-accent2"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Onboarding
          </p>
          <h2
            className="mt-1 text-2xl leading-tight text-fg"
            style={{ fontFamily: "var(--font-dm-serif)" }}
          >
            New users start in a short guided preview
          </h2>
          <p
            className="mt-2 max-w-3xl text-sm text-fg-muted"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Studi lets new users try a few text chats first so they can feel the tutoring flow. Uploads unlock once they choose Intro or Pro.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="rounded-2xl border border-border-faint bg-white p-4">
              <h3
                className="text-sm font-semibold text-fg"
                style={{ fontFamily: "var(--font-jakarta)" }}
              >
                Guided preview
              </h3>
              <p
                className="mt-2 text-xs text-fg-muted"
                style={{ fontFamily: "var(--font-jakarta)" }}
              >
                A few text-only chats so learners can see the product before paying.
              </p>
            </article>
            <article className="rounded-2xl border border-border-faint bg-white p-4">
              <h3
                className="text-sm font-semibold text-fg"
                style={{ fontFamily: "var(--font-jakarta)" }}
              >
                Intro
              </h3>
              <p
                className="mt-2 text-xs text-fg-muted"
                style={{ fontFamily: "var(--font-jakarta)" }}
              >
                Full text tutoring with a generous monthly limit.
              </p>
            </article>
            <article className="rounded-2xl border border-border-faint bg-white p-4">
              <h3
                className="text-sm font-semibold text-fg"
                style={{ fontFamily: "var(--font-jakarta)" }}
              >
                Pro
              </h3>
              <p
                className="mt-2 text-xs text-fg-muted"
                style={{ fontFamily: "var(--font-jakarta)" }}
              >
                The highest monthly usage limits.
              </p>
            </article>
          </div>
        </section>
      </div>
    </div>
  );
}
