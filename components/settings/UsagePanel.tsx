"use client";

import Link from "next/link";
import { PricingTable, UserProfile, useUser, SignOutButton } from "@clerk/nextjs";
import { useAction, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { handleExplicitPosthogLogout } from "@/components/analytics/PostHogAuthSync";

// ─── Formatting helpers ──────────────────────────────────────────────────────

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    value,
  );
}

function formatMonthLabel(periodStart: string): string {
  const date = new Date(`${periodStart}T00:00:00.000Z`);
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatPlanLabel(planKey: string): string {
  if (planKey === "pro") return "Pro";
  if (planKey === "intro") return "Intro";
  return "Onboarding";
}

function formatDurationMinutes(seconds: number): string {
  return `${Math.max(0, Math.floor(seconds / 60))} min`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function UsageMeter({
  label,
  used,
  limit,
  detail,
  icon,
}: {
  label: string;
  used: number;
  limit: number;
  detail: string;
  icon: ReactNode;
}) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const isWarning = percent >= 80;
  const barColor = isWarning
    ? "var(--accent)"
    : "var(--accent2)";

  return (
    <article
      className="rounded-2xl border p-5 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: "var(--bg-card)",
        borderColor: isWarning
          ? "color-mix(in srgb, var(--accent) 30%, var(--border-faint))"
          : "var(--border-faint)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl text-lg"
            style={{
              background: isWarning ? "var(--accent-dim)" : "var(--accent2-dim)",
              color: isWarning ? "var(--accent)" : "var(--accent2)",
            }}
          >
            {icon}
          </span>
          <h3
            className="text-base font-semibold"
            style={{ fontFamily: "var(--font-jakarta)", color: "var(--fg)" }}
          >
            {label}
          </h3>
        </div>
        <span
          className="text-sm font-bold tabular-nums"
          style={{
            fontFamily: "var(--font-jakarta)",
            color: isWarning ? "var(--accent)" : "var(--fg-faint)",
          }}
        >
          {percent}%
        </span>
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full"
        style={{ background: "var(--bg-alt)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${percent}%`, background: barColor }}
        />
      </div>
      <p
        className="mt-3 text-sm"
        style={{ fontFamily: "var(--font-jakarta)", color: "var(--fg-muted)" }}
      >
        {detail}
      </p>
    </article>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-[11px] font-bold uppercase tracking-[0.08em]"
      style={{ fontFamily: "var(--font-jakarta)", color: "var(--accent2)" }}
    >
      {children}
    </p>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

type TabId = "usage" | "billing" | "account";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "usage", label: "Usage", icon: "📊" },
  { id: "billing", label: "Billing", icon: "💳" },
  { id: "account", label: "Account", icon: "👤" },
];

// ─── Clerk appearance matching Studi design system ────────────────────────────

const clerkAppearance = {
  variables: {
    colorPrimary: "#e05a3a",
    colorBackground: "#ffffff",
    colorForeground: "#1c1208",
    colorMutedForeground: "#6b5a47",
    colorNeutral: "#b0a090",
    colorBorder: "#f0e9e0",
    colorInput: "#fdf8f2",
    colorInputForeground: "#1c1208",
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    borderRadius: "0.875rem",
  },
  elements: {
    rootBox: {
      width: "100%",
    },
    card: {
      boxShadow: "none",
      border: "none",
      borderRadius: "0",
      backgroundColor: "transparent",
    },
    navbar: {
      background: "var(--bg-alt)",
      borderRight: "1px solid var(--border-faint)",
      borderRadius: "1rem 0 0 1rem",
    },
    navbarButton: {
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontSize: "0.8125rem",
    },
    pageScrollBox: {
      padding: "1.25rem 1.5rem",
    },
    profilePage__security: {
      gap: "0.75rem",
    },
  },
};

const pricingAppearance = {
  variables: {
    colorPrimary: "#e05a3a",
    colorBackground: "var(--bg-card)",
    colorForeground: "#1c1208",
    colorMutedForeground: "#6b5a47",
    colorNeutral: "#b0a090",
    colorBorder: "#f0e9e0",
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
    card: {
      boxShadow: "none",
      border: "none",
      background: "transparent",
      padding: 0,
    }
  },
};

// ─── Tab panels ──────────────────────────────────────────────────────────────

function UsageTab({
  billing,
}: {
  billing: ReturnType<typeof useQuery<typeof api.billing.getViewerBillingState>>;
}) {
  if (billing === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
          <p
            className="text-sm"
            style={{ fontFamily: "var(--font-jakarta)", color: "var(--fg-faint)" }}
          >
            Loading usage data…
          </p>
        </div>
      </div>
    );
  }

  if (!billing) {
    return (
      <div
        className="rounded-2xl border p-6 text-center"
        style={{ background: "var(--bg-alt)", borderColor: "var(--border-faint)" }}
      >
        <p
          className="text-sm"
          style={{ fontFamily: "var(--font-jakarta)", color: "var(--fg-muted)" }}
        >
          Usage information unavailable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Plan header */}
      <div
        className="flex flex-col gap-4 rounded-2xl border p-6 sm:flex-row sm:items-center sm:justify-between"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-faint)",
        }}
      >
        <div>
          <SectionLabel>Current plan</SectionLabel>
          <h2
            className="mt-2 text-3xl"
            style={{ fontFamily: "var(--font-dm-serif)", color: "var(--fg)" }}
          >
            {formatPlanLabel(billing.planKey)}
          </h2>
          <p
            className="mt-2 text-sm"
            style={{ fontFamily: "var(--font-jakarta)", color: "var(--fg-muted)" }}
          >
            {billing.upgradeReason ??
              "Your usage is tracked monthly across text, voice, and labs."}
          </p>
        </div>
      </div>

      {/* Onboarding notice */}
      {billing.planKey === "free_onboarding" && (
        <div
          className="rounded-2xl border p-6"
          style={{
            background: "color-mix(in srgb, var(--accent3) 8%, var(--bg-card))",
            borderColor: "color-mix(in srgb, var(--accent3) 30%, var(--border-faint))",
          }}
        >
          <SectionLabel>Guided preview</SectionLabel>
          <h3
            className="mt-2 text-xl"
            style={{ fontFamily: "var(--font-dm-serif)", color: "var(--fg)" }}
          >
            You&apos;re on the free preview
          </h3>
          <p
            className="mt-2 max-w-lg text-sm"
            style={{ fontFamily: "var(--font-jakarta)", color: "var(--fg-muted)" }}
          >
            Try a few text chats first. Voice, uploads, and labs unlock after you pick a paid plan.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className="rounded-full border px-4 py-1.5 text-xs font-semibold"
              style={{
                fontFamily: "var(--font-jakarta)",
                background: "var(--bg-card)",
                borderColor: "color-mix(in srgb, var(--accent3) 40%, var(--border-faint))",
                color: "var(--fg-muted)",
              }}
            >
              Free prompts left: {billing.remaining.lifetimeFreePromptCount}
            </span>
          </div>
        </div>
      )}

      {/* Usage meters */}
      <div>
        <h3
          className="mb-4 text-base font-semibold"
          style={{ fontFamily: "var(--font-jakarta)", color: "var(--fg-muted)" }}
        >
          This month&apos;s usage
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <UsageMeter
            label="Text"
            used={billing.usage.textAiCostUsd}
            limit={billing.caps.textAiCostUsdLimit}
            detail={`${formatInteger(billing.usage.textPromptCount)} prompts this month`}
            icon="💬"
          />
          <UsageMeter
            label={billing.planKey === "intro" ? "Voice preview" : "Voice minutes"}
            used={billing.usage.voiceSeconds}
            limit={billing.caps.voiceSecondsLimit}
            detail={`${formatDurationMinutes(billing.remaining.voiceSeconds)} remaining`}
            icon="🎙️"
          />
          <UsageMeter
            label="Lab runtime"
            used={billing.usage.labActiveSeconds}
            limit={billing.caps.labActiveSecondsLimit}
            detail={`${formatDurationMinutes(billing.remaining.labActiveSeconds)} remaining`}
            icon="🧪"
          />
          <UsageMeter
            label="Lab sessions"
            used={billing.usage.labSessionCount}
            limit={billing.caps.labSessionLimit}
            detail={`${billing.remaining.labSessionCount} sessions remaining`}
            icon="⚗️"
          />
        </div>
      </div>
    </div>
  );
}

function BillingTab() {
  return (
    <div className="space-y-6">
      <div>
        <p
          className="text-sm"
          style={{ fontFamily: "var(--font-jakarta)", color: "var(--fg-muted)" }}
        >
          Intro gives you full text tutoring plus limited voice and lab previews.
          Pro unlocks full voice, full labs, and higher monthly limits.
        </p>
      </div>

      <div
        className="overflow-hidden rounded-[24px] border p-2 sm:p-4"
        style={{
          background: "var(--bg-card)",
          borderColor: "var(--border-faint)",
          boxShadow: "0 4px 12px rgba(28,18,8,0.03)",
        }}
      >
        <PricingTable
          appearance={pricingAppearance}
          newSubscriptionRedirectUrl="/settings?from=checkout"
        />
      </div>
    </div>
  );
}

function AccountTab() {
  return (
    <div className="space-y-4">
      <div>
        <p
          className="text-sm"
          style={{ fontFamily: "var(--font-jakarta)", color: "var(--fg-muted)" }}
        >
          Manage your profile, email addresses, security settings, and connected accounts.
        </p>
      </div>
      <div
        className="overflow-hidden rounded-2xl border"
        style={{
          borderColor: "var(--border-faint)",
          boxShadow: "0 4px 12px rgba(28,18,8,0.03)",
        }}
      >
        <UserProfile routing="hash" appearance={clerkAppearance} />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UsagePanel() {
  const billing = useQuery(api.billing.getViewerBillingState);
  const syncBillingProfile = useAction(api.billingActions.syncCurrentUserBillingProfile);
  const { user } = useUser();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<TabId>("usage");

  useEffect(() => {
    void syncBillingProfile().catch((error) => {
      console.error("Billing profile sync failed", error);
    });
  }, [syncBillingProfile]);

  return (
    <div
      className="min-h-screen px-4 py-6 md:px-6"
      style={{
        background:
          "radial-gradient(1200px 450px at -5% -10%, color-mix(in srgb, var(--accent2) 7%, transparent), transparent 65%), radial-gradient(1100px 500px at 105% 0%, color-mix(in srgb, var(--accent) 7%, transparent), transparent 70%), var(--bg)",
      }}
    >
      {/* Page header */}
      <header className="mx-auto w-full max-w-4xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 text-xs transition hover:opacity-70"
              style={{ fontFamily: "var(--font-jakarta)", color: "var(--fg-faint)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M9 11L5 7L9 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Back to chat
            </Link>
            <h1
              className="mt-2 text-3xl leading-tight"
              style={{ fontFamily: "var(--font-dm-serif)", color: "var(--fg)" }}
            >
              Settings
            </h1>
            <p
              className="mt-1 text-sm"
              style={{ fontFamily: "var(--font-jakarta)", color: "var(--fg-muted)" }}
            >
              {user?.firstName ? `${user.firstName}'s workspace` : "Your workspace"}
              {billing ? ` · ${formatMonthLabel(billing.billingPeriod)}` : ""}
            </p>
          </div>
          
          <div className="mt-2 flex shrink-0">
            <SignOutButton>
              <button
                onClick={() => handleExplicitPosthogLogout(pathname)}
                className="flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-bold transition-all hover:-translate-y-0.5"
                style={{
                  fontFamily: "var(--font-jakarta)",
                  background: "var(--bg-card)",
                  borderColor: "#1c1208",
                  color: "#1c1208",
                  boxShadow: "2px 2px 0px var(--accent)",
                }}
              >
                Sign out
              </button>
            </SignOutButton>
          </div>
        </div>

        {/* Tab bar */}
        <nav
          className="mt-6 flex gap-1 overflow-x-auto rounded-xl border p-1"
          style={{
            background: "var(--bg-alt)",
            borderColor: "var(--border-faint)",
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex shrink-0 items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all duration-150"
              style={{
                fontFamily: "var(--font-jakarta)",
                background: activeTab === tab.id ? "var(--bg-card)" : "transparent",
                color: activeTab === tab.id ? "var(--fg)" : "var(--fg-muted)",
                boxShadow:
                  activeTab === tab.id
                    ? "0 1px 3px rgba(28,18,8,0.06), 0 1px 1px rgba(28,18,8,0.04)"
                    : "none",
              }}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Tab content */}
      <main className="mx-auto mt-6 w-full max-w-4xl">
        {activeTab === "usage" && <UsageTab billing={billing} />}
        {activeTab === "billing" && <BillingTab />}
        {activeTab === "account" && <AccountTab />}
      </main>
    </div>
  );
}
