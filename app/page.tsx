"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { SignInButton, Waitlist } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import StudiChat from "@/components/StudiChat";

/* ── Feature card ─────────────────────────────────────────── */

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

/* ── Landing page ─────────────────────────────────────────── */

function LandingPage() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <div className="landing-page">
      {/* Floating nav */}
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
          <SignInButton mode="modal">
            <button type="button" className="landing-sign-in-btn">
              Sign in
            </button>
          </SignInButton>
        </nav>
      </div>

      {/* Hero */}
      <section className="landing-hero">
        {/* Decorative floating icons */}
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
              animation:
                "float-drift 7s ease-in-out infinite",
            } as React.CSSProperties
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
            } as React.CSSProperties
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
            } as React.CSSProperties
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
            } as React.CSSProperties
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

        {/* Clerk Waitlist */}
        <div className="welcome-enter-delay landing-waitlist-wrap">
          {isMounted ? (
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
          ) : (
            <div
              style={{
                height: 260,
                borderRadius: 14,
                background: "var(--bg-alt)",
                border: "1.5px solid var(--border)",
              }}
            />
          )}
        </div>
      </section>

      {/* Features */}
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
            desc="Write and run Python code right in your browser — no setup needed."
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

      {/* Footer */}
      <footer className="landing-footer">
        <p
          className="text-xs text-fg-faint"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          © 2026 Studi —{" "}
          <em style={{ fontFamily: "var(--font-dm-serif)" }}>
            Learn at your own pace
          </em>
        </p>
      </footer>
    </div>
  );
}

/* ── Root page ────────────────────────────────────────────── */

export default function Home() {
  return (
    <>
      <AuthLoading>
        <div className="landing-auth-loading">
          <p
            className="animate-fade-in"
            style={{
              fontFamily: "var(--font-dm-serif)",
              fontSize: "2rem",
              color: "var(--fg-faint)",
            }}
          >
            studi
          </p>
        </div>
      </AuthLoading>

      <Authenticated>
        <StudiChat />
      </Authenticated>

      <Unauthenticated>
        <LandingPage />
      </Unauthenticated>
    </>
  );
}
