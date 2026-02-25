"use client";

import Link from "next/link";
import { UserProfile, useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);
}

function formatMonthLabel(periodStart: string): string {
  const date = new Date(`${periodStart}T00:00:00.000Z`);
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatLastSeen(value?: number): string {
  if (!value) {
    return "No calls yet";
  }

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-border-faint bg-bg-alt p-3">
      <p
        className="text-[11px] text-fg-faint"
        style={{ fontFamily: "var(--font-jakarta)" }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-base font-semibold text-fg"
        style={{ fontFamily: "var(--font-jakarta)" }}
      >
        {value}
      </p>
    </article>
  );
}

function TableHeader({ children }: { children: ReactNode }) {
  return (
    <th
      className="border-b border-border-faint px-1 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-faint"
      style={{ fontFamily: "var(--font-jakarta)" }}
    >
      {children}
    </th>
  );
}

function TableCell({ children }: { children: ReactNode }) {
  return (
    <td
      className="border-b border-border-faint px-1 py-1.5 text-xs text-fg-muted"
      style={{ fontFamily: "var(--font-jakarta)" }}
    >
      {children}
    </td>
  );
}

export function UsagePanel() {
  const usage = useQuery(api.telemetry.getCurrentUserMonthlyUsage);
  const { user } = useUser();

  return (
    <div
      className="min-h-screen px-4 py-5 md:px-6"
      style={{
        background:
          "radial-gradient(1200px 450px at -5% -10%, color-mix(in srgb, var(--accent2) 8%, transparent), transparent 65%), radial-gradient(1100px 500px at 105% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%), var(--bg)",
      }}
    >
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-accent2"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Settings
          </p>
          <h1
            className="mt-1 text-3xl leading-tight text-fg"
            style={{ fontFamily: "var(--font-dm-serif)" }}
          >
            Usage and account
          </h1>
          <p
            className="mt-2 max-w-2xl text-sm text-fg-muted"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            {user?.firstName ? `Hey ${user.firstName}, ` : ""}
            this is your live usage panel for{" "}
            {usage ? formatMonthLabel(usage.billingPeriod) : "this month"}.
          </p>
        </div>

        <Link
          href="/chat"
          className="inline-flex w-fit items-center justify-center rounded-full border border-border-warm bg-bg-card px-4 py-2 text-xs font-semibold text-fg-muted transition hover:-translate-y-0.5 hover:border-accent hover:text-accent"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Back to chat
        </Link>
      </header>

      <section
        className="mx-auto mt-4 w-full max-w-6xl rounded-3xl border border-border-warm bg-bg-card p-4 shadow-[0_1px_3px_rgba(28,18,8,0.04),0_12px_30px_rgba(28,18,8,0.08)] md:p-5"
        aria-live="polite"
      >
        {usage === undefined ? (
          <p
            className="text-sm text-fg-faint"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Loading usage data...
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard
                label="Calls"
                value={formatInteger(usage.totals.calls)}
              />
              <StatCard
                label="Total tokens"
                value={formatInteger(usage.totals.totalTokens)}
              />
              <StatCard
                label="Input tokens"
                value={formatInteger(usage.totals.inputTokens)}
              />
              <StatCard
                label="Output tokens"
                value={formatInteger(usage.totals.outputTokens)}
              />
              <StatCard
                label="Avg tokens / call"
                value={formatInteger(usage.totals.avgTokensPerCall)}
              />
              <StatCard
                label="Estimated cost"
                value={formatCurrency(usage.totals.estimatedCostUsd)}
              />
              <StatCard
                label="Voice calls"
                value={formatInteger(usage.voice.calls)}
              />
              <StatCard
                label="Voice est. cost"
                value={formatCurrency(usage.voice.estimatedCostUsd)}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <p
                className="rounded-full border border-border-faint bg-bg-alt px-2.5 py-1 text-[11px] text-fg-muted"
                style={{ fontFamily: "var(--font-jakarta)" }}
              >
                Billing period: {formatMonthLabel(usage.billingPeriod)}
              </p>
              <p
                className="rounded-full border border-border-faint bg-bg-alt px-2.5 py-1 text-[11px] text-fg-muted"
                style={{ fontFamily: "var(--font-jakarta)" }}
              >
                Last call: {formatLastSeen(usage.lastCallAt)}
              </p>
              <p
                className="rounded-full border border-border-faint bg-bg-alt px-2.5 py-1 text-[11px] text-fg-muted"
                style={{ fontFamily: "var(--font-jakarta)" }}
              >
                Voice input tokens: {formatInteger(usage.voice.inputTokens)}
              </p>
              <p
                className="rounded-full border border-border-faint bg-bg-alt px-2.5 py-1 text-[11px] text-fg-muted"
                style={{ fontFamily: "var(--font-jakarta)" }}
              >
                Last voice call: {formatLastSeen(usage.voice.lastCallAt)}
              </p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <article className="rounded-2xl border border-border-faint bg-white p-3">
                <h2
                  className="text-base text-fg"
                  style={{ fontFamily: "var(--font-dm-serif)" }}
                >
                  By model
                </h2>

                {usage.modelBreakdown.length === 0 ? (
                  <p
                    className="mt-2 text-xs text-fg-faint"
                    style={{ fontFamily: "var(--font-jakarta)" }}
                  >
                    No model usage yet this month.
                  </p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-[340px] w-full border-collapse">
                      <thead>
                        <tr>
                          <TableHeader>Model</TableHeader>
                          <TableHeader>Calls</TableHeader>
                          <TableHeader>Tokens</TableHeader>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.modelBreakdown.map((entry) => (
                          <tr key={`${entry.provider}-${entry.model}`}>
                            <td className="border-b border-border-faint px-1 py-1.5">
                              <p
                                className="text-xs font-semibold text-fg"
                                style={{ fontFamily: "var(--font-jakarta)" }}
                              >
                                {entry.model}
                              </p>
                              <p
                                className="text-[11px] text-fg-faint"
                                style={{ fontFamily: "var(--font-jakarta)" }}
                              >
                                {entry.provider}
                              </p>
                            </td>
                            <TableCell>{formatInteger(entry.calls)}</TableCell>
                            <TableCell>
                              {formatInteger(entry.totalTokens)}
                            </TableCell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>

              <article className="rounded-2xl border border-border-faint bg-white p-3">
                <h2
                  className="text-base text-fg"
                  style={{ fontFamily: "var(--font-dm-serif)" }}
                >
                  Top threads
                </h2>

                {usage.threadBreakdown.length === 0 ? (
                  <p
                    className="mt-2 text-xs text-fg-faint"
                    style={{ fontFamily: "var(--font-jakarta)" }}
                  >
                    Start a chat and your thread usage will appear here.
                  </p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-[340px] w-full border-collapse">
                      <thead>
                        <tr>
                          <TableHeader>Thread</TableHeader>
                          <TableHeader>Calls</TableHeader>
                          <TableHeader>Tokens</TableHeader>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.threadBreakdown.map((entry) => (
                          <tr key={entry.threadId}>
                            <td
                              className="border-b border-border-faint px-1 py-1.5 text-xs font-semibold text-fg"
                              style={{ fontFamily: "var(--font-jakarta)" }}
                            >
                              {entry.threadTitle}
                            </td>
                            <TableCell>{formatInteger(entry.calls)}</TableCell>
                            <TableCell>
                              {formatInteger(entry.totalTokens)}
                            </TableCell>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            </div>
          </>
        )}
      </section>

      <section className="mx-auto mt-4 w-full max-w-6xl rounded-3xl border border-border-warm bg-bg-card p-4 shadow-[0_1px_3px_rgba(28,18,8,0.04),0_12px_30px_rgba(28,18,8,0.08)] md:p-5">
        <div className="mb-3">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.08em] text-accent2"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Clerk
          </p>
          <h2
            className="mt-1 text-2xl leading-tight text-fg"
            style={{ fontFamily: "var(--font-dm-serif)" }}
          >
            Account settings
          </h2>
          <p
            className="mt-1 text-sm text-fg-faint"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Your profile, security, and connected accounts are managed here.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border-faint">
          <UserProfile routing="hash" />
        </div>
      </section>
    </div>
  );
}
