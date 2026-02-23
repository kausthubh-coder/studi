"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import type { CSSProperties } from "react";

const Waitlist = dynamic(
  () => import("@clerk/nextjs").then((module) => module.Waitlist),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          height: 260,
          borderRadius: 14,
          background: "var(--bg-alt)",
          border: "1.5px solid var(--border)",
        }}
      />
    ),
  },
);

function FeatureCard({
  icon,
  label,
  desc,
  colorClass,
}: {
  icon: string;
  label: string;
  desc: string;
  colorClass: string;
}) {
  return (
    <div className={`feature-card ${colorClass}`}>
      <div className="feature-card-icon">{icon}</div>
      <p className="feature-card-label">{label}</p>
      <p className="feature-card-desc">{desc}</p>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="landing-page">
      <div className="landing-nav-wrap">
        <nav className="landing-nav">
          <span className="landing-wordmark">
            studi
            <span
              aria-hidden
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--accent)",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
          </span>

          <SignedOut>
            <SignInButton mode="modal" forceRedirectUrl="/chat">
              <button type="button" className="landing-sign-in-btn">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <Link href="/chat" className="landing-sign-in-btn">
              Open chat
            </Link>
          </SignedIn>
        </nav>
      </div>

      <section className="landing-hero">
        <span
          className="landing-floating-icon"
          aria-hidden
          style={
            {
              top: "12%",
              left: "4%",
              fontSize: "2.2rem",
              "--drift-duration": "7s",
              "--drift-delay": "0s",
              animation: "float-drift 7s ease-in-out infinite",
            } as CSSProperties
          }
        >
          📐
        </span>
        <span
          className="landing-floating-icon"
          aria-hidden
          style={
            {
              top: "8%",
              right: "6%",
              fontSize: "2rem",
              animation: "float-drift 9s ease-in-out 1.5s infinite",
            } as CSSProperties
          }
        >
          🧪
        </span>
        <span
          className="landing-floating-icon"
          aria-hidden
          style={
            {
              bottom: "22%",
              left: "6%",
              fontSize: "1.8rem",
              animation: "float-drift 8s ease-in-out 0.8s infinite",
            } as CSSProperties
          }
        >
          💡
        </span>
        <span
          className="landing-floating-icon"
          aria-hidden
          style={
            {
              bottom: "18%",
              right: "4%",
              fontSize: "1.75rem",
              animation: "float-drift 6.5s ease-in-out 2s infinite",
            } as CSSProperties
          }
        >
          🔬
        </span>

        <div className="welcome-enter">
          <h1 className="landing-hero-heading">
            Learn anything.
            <br />
            <em>Deeply.</em>
          </h1>
          <p className="landing-hero-sub">
            Your AI tutor that sparks curiosity with interactive explanations,
            visual exercises, and real-time feedback.
          </p>
        </div>

        <div className="welcome-enter-delay landing-waitlist-wrap">
          <SignedOut>
            <Waitlist
              appearance={{
                variables: {
                  colorPrimary: "#e05a3a",
                  colorBackground: "#fdf8f2",
                  colorText: "#1c1208",
                  colorInputBackground: "#ffffff",
                  colorTextSecondary: "#6b5a47",
                  borderRadius: "14px",
                },
              }}
            />
          </SignedOut>

          <SignedIn>
            <Link href="/chat" className="landing-sign-in-btn">
              Continue to chat
            </Link>
          </SignedIn>
        </div>
      </section>

      <section className="welcome-enter-delay-2 landing-features">
        <p className="landing-features-title">What you can do</p>
        <div className="landing-features-grid">
          <FeatureCard
            icon="🧪"
            label="Spark Scenes"
            desc="Interactive visual simulations that make abstract concepts click."
            colorClass="card-teal"
          />
          <FeatureCard
            icon="🐍"
            label="Python Lab"
            desc="Write and run Python code right in your browser - no setup needed."
            colorClass="card-amber"
          />
          <FeatureCard
            icon="🧠"
            label="Deep Reasoning"
            desc="Step-by-step thinking that breaks down complex topics clearly."
            colorClass="card-lavender"
          />
        </div>
      </section>

      <footer className="landing-footer">
        <p
          className="text-xs text-fg-faint"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          © 2026 Studi -{" "}
          <em style={{ fontFamily: "var(--font-dm-serif)" }}>
            Learn at your own pace
          </em>
        </p>
      </footer>
    </div>
  );
}
