"use client";

/* eslint-disable react/no-unescaped-entities */

import Link from "next/link";
import {
  motion,
  MotionConfig,
  useReducedMotion,
} from "framer-motion";
import { useId, useState } from "react";
import { Send } from "lucide-react";
import { PRICING_FAQ_ANSWER } from "@/lib/billing/plan-catalog";
import { SparksShowcase } from "./SparksShowcase";
import { WaitlistForm } from "./WaitlistForm";

const INK = "#1c1208";

const fadeUp = {
  // Keep critical content visible in the server render. Motion is progressive
  // enhancement; a delayed or blocked client hydration must not blank the page.
  hidden: { opacity: 1, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.21, 0.66, 0.32, 1] as const },
  },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};
const viewportOpts = { once: true, margin: "-80px" };

function scrollToWaitlist() {
  const section = document.getElementById("get-early-access");
  const reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  section?.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "center",
  });
  setTimeout(
    () => {
      const input = section?.querySelector<HTMLInputElement>(
        "input[type='email']",
      );
      input?.focus({ preventScroll: true });
    },
    reduceMotion ? 0 : 600,
  );
}

function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const iconSize = size === "lg" ? 38 : 30;
  return (
    <span className="flex items-center gap-2">
      <Send
        aria-hidden
        size={iconSize}
        strokeWidth={1.9}
        className="-rotate-6 text-accent"
      />
      <span
        className={`font-brand tracking-tight text-fg ${size === "lg" ? "text-3xl" : "text-2xl"}`}
      >
        studi
      </span>
    </span>
  );
}

function StickyNote({
  children,
  className = "",
  color = "var(--accent3)",
  rotate = 3,
}: {
  children: React.ReactNode;
  className?: string;
  color?: string;
  rotate?: number;
}) {
  return (
    <div
      className={`border-2 border-fg rounded-lg px-3 py-1.5 shadow-[3px_3px_0px_var(--fg)] font-bold text-xs text-fg ${className}`}
      style={{ backgroundColor: color, transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </div>
  );
}

export function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const buttonId = useId();
  const panelId = useId();

  return (
    <div className="border-2 border-fg rounded-2xl overflow-hidden bg-white shadow-[4px_4px_0px_var(--fg)]">
      <button
        id={buttonId}
        type="button"
        aria-controls={panelId}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 px-5 md:px-6 py-4 md:py-5 text-left font-bold font-ui text-base md:text-lg text-fg hover:bg-bg transition-colors"
      >
        <span>{q}</span>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-fg bg-accent3 transition-transform duration-200 ${
            open ? "rotate-45" : "rotate-0"
          }`}
          aria-hidden
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path
              d="M7 1v12M1 7h12"
              stroke={INK}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        hidden={!open}
        className="overflow-hidden"
      >
        <p className="px-5 md:px-6 pb-5 pt-4 font-body text-fg-muted leading-relaxed border-t-2 border-dashed border-border-warm">
          {a}
        </p>
      </div>
    </div>
  );
}

/* ── Animated drop-test Spark: bowling ball vs marble, always landing together ── */
function DropTestSpark() {
  const DROP = 144;
  const reduceMotion = useReducedMotion();
  const fall = (delay: number) => ({
    y: [0, DROP, DROP],
    transition: {
      duration: 3.2,
      times: [0.28, 0.62, 1],
      ease: ["easeIn", "linear", "linear"] as ("easeIn" | "linear")[],
      repeat: Infinity,
      repeatDelay: 0,
      delay,
    },
  });

  return (
    <div className="relative h-full min-h-[310px] rounded-xl border-2 border-fg bg-white overflow-hidden">
      {/* Faint grid */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `linear-gradient(${INK} 1px, transparent 1px), linear-gradient(90deg, ${INK} 1px, transparent 1px)`,
          backgroundSize: "24px 24px",
        }}
        aria-hidden
      />

      {/* Drop zone */}
      <div className="absolute inset-x-0 top-8 bottom-20">
        {/* Bowling ball */}
        <motion.div
          animate={reduceMotion ? { y: DROP } : fall(0)}
          className="absolute left-[28%] -translate-x-1/2"
        >
          <div className="w-12 h-12 rounded-full bg-fg border-2 border-fg relative shadow-[2px_2px_0px_rgba(28,18,8,0.25)]">
            <span className="absolute top-2.5 left-3 w-1.5 h-1.5 rounded-full bg-white/70" />
            <span className="absolute top-2.5 left-5.5 w-1.5 h-1.5 rounded-full bg-white/70" />
            <span className="absolute top-5 left-4 w-1.5 h-1.5 rounded-full bg-white/70" />
          </div>
          <p className="mt-1.5 text-center font-mono text-[10px] font-bold text-fg-muted">
            7.2 kg
          </p>
        </motion.div>

        {/* Marble */}
        <motion.div
          animate={reduceMotion ? { y: DROP } : fall(0)}
          className="absolute left-[68%] -translate-x-1/2"
        >
          <div className="w-5 h-5 mx-auto mt-7 rounded-full bg-accent border-2 border-fg" />
          <p className="mt-1.5 text-center font-mono text-[10px] font-bold text-fg-muted">
            0.01 kg
          </p>
        </motion.div>
      </div>

      {/* Ground */}
      <div className="absolute inset-x-3 bottom-[4.6rem] border-b-[3px] border-fg" />
      <div
        data-testid="drop-test-footer"
        className="absolute inset-x-0 bottom-0 min-h-[4.6rem] flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-1.5 border-t border-border-warm bg-bg-elevated px-3 py-2"
      >
        <span className="font-mono text-[10px] font-bold text-fg-muted">
          gravity = 9.8 m/s²
        </span>
        <span className="inline-flex items-center rounded-full border-2 border-fg bg-accent2-dim px-2.5 py-0.5 font-ui text-[10px] font-bold text-fg">
          they land together. every time.
        </span>
      </div>
    </div>
  );
}

/* ── Hero demo: minimal chat beside the Spark it produced ── */
function HeroChatDemo() {
  return (
    <div className="relative">
      {/* Offset backdrop */}
      <div className="absolute inset-0 translate-x-2 translate-y-2 sm:translate-x-3 sm:translate-y-3 bg-accent2 rounded-[1.5rem] md:rounded-[2rem] border-2 border-fg" />

      <div className="relative bg-white rounded-[1.5rem] md:rounded-[2rem] border-[3px] border-fg overflow-hidden">
        {/* Window bar */}
        <div className="flex items-center gap-2 px-4 md:px-5 h-11 border-b-[3px] border-fg bg-bg-elevated">
          <span className="w-3 h-3 rounded-full bg-accent border-2 border-fg" />
          <span className="w-3 h-3 rounded-full bg-accent3 border-2 border-fg" />
          <span className="w-3 h-3 rounded-full bg-accent2 border-2 border-fg" />
          <span className="ml-3 font-mono text-[11px] md:text-xs font-bold text-fg-muted truncate">
            studi — do heavier things fall faster?
          </span>
        </div>

        <div className="grid md:grid-cols-[1fr_0.92fr]">
          {/* Chat side — short and quiet */}
          <div className="p-4 md:p-6 flex flex-col justify-center gap-4 text-left border-b-[3px] md:border-b-0 md:border-r-[3px] border-fg">
            <div className="max-w-[92%]">
              <p className="font-bold text-[11px] uppercase tracking-wider text-fg-faint mb-1">
                You
              </p>
              <p className="font-body text-sm md:text-[15px] leading-relaxed text-fg">
                Heavy things fall faster, right? A bowling ball obviously beats
                a marble.
              </p>
            </div>

            <div className="max-w-[95%] rounded-xl border-2 border-fg bg-accent-dim px-4 py-3 shadow-[3px_3px_0px_var(--fg)]">
              <p className="font-bold text-[11px] uppercase tracking-wider text-fg mb-1">
                Studi
              </p>
              <p className="font-body text-sm md:text-[15px] leading-relaxed text-fg">
                Even Aristotle thought so. Try this first: tape the marble{" "}
                <em>to</em> the ball. Does the pair fall faster or slower than
                the ball alone?
              </p>
            </div>

            <div className="max-w-[92%]">
              <p className="font-bold text-[11px] uppercase tracking-wider text-fg-faint mb-1">
                You
              </p>
              <p className="font-body text-sm md:text-[15px] leading-relaxed text-fg">
                Slower, it drags… no wait, heavier, so faster??{" "}
                <strong className="font-bold">It can't be both.</strong>
              </p>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-full border-2 border-fg bg-accent2 px-3.5 py-1.5 shadow-[2px_2px_0px_var(--fg)]">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="font-ui text-xs font-bold text-fg">
                Exactly. Watch — dropping both →
              </span>
            </div>
          </div>

          {/* Spark side */}
          <div className="p-4 md:p-6 bg-bg-elevated flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-2 font-bold text-xs">
                <span className="w-2 h-2 rounded-full bg-accent2" />
                Drop-test Spark
              </span>
              <span className="font-mono text-[10px] font-bold text-fg-muted">
                generated just now
              </span>
            </div>
            <div className="flex-1">
              <DropTestSpark />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky note */}
      <StickyNote
        className="absolute -top-4 -right-2 md:-right-5 hidden sm:block"
        rotate={4}
      >
        no answers were handed out 🤌
      </StickyNote>
    </div>
  );
}

export function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div
        className="studi-landing min-h-screen bg-bg text-fg selection:bg-accent/20 font-ui overflow-x-clip"
        style={{ "--fg-faint": "#806f5d" } as React.CSSProperties}
      >
        {/* Dot grid background */}
        <div
          className="fixed inset-0 pointer-events-none opacity-[0.035] z-0"
          style={{
            backgroundImage: `radial-gradient(${INK} 1.5px, transparent 1.5px)`,
            backgroundSize: "32px 32px",
          }}
          aria-hidden
        />

        {/* ── NAV ── */}
        <header className="fixed top-0 inset-x-0 z-50 px-3 pt-3 md:px-4 md:pt-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between bg-bg-elevated/95 backdrop-blur-md pl-3 pr-2 md:pl-5 md:pr-3 py-2 rounded-2xl border-2 border-fg shadow-[4px_4px_0px_var(--fg)]">
            <Link
              href="/"
              aria-label="Studi home"
              className="inline-flex min-h-11 items-center"
            >
              <Wordmark />
            </Link>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <a
                href="/chat"
                className="inline-flex min-h-11 items-center justify-center font-bold text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-xl border-2 border-fg bg-white hover:bg-bg-alt transition-colors shadow-[2px_2px_0px_var(--fg)] active:translate-y-0.5 active:shadow-none"
              >
                Open chat
              </a>
              <button
                type="button"
                onClick={scrollToWaitlist}
                className="min-h-11 font-bold text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-xl border-2 border-fg bg-accent text-fg hover:bg-accent-hover transition-colors shadow-[2px_2px_0px_var(--fg)] active:translate-y-0.5 active:shadow-none"
              >
                Get Early Access
              </button>
            </div>
          </div>
        </header>

        <main className="relative z-10 pt-28 md:pt-36">
          {/* ── HERO ── */}
          <section className="px-4 md:px-6 max-w-6xl mx-auto">
            <motion.div
              initial={false}
              animate="visible"
              variants={stagger}
              className="flex flex-col items-center text-center"
            >
              <motion.div
                variants={fadeUp}
                className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-fg bg-white px-4 py-1.5 shadow-[3px_3px_0px_var(--fg)]"
              >
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                <span className="font-bold text-xs uppercase tracking-[0.15em]">
                  Now in early access
                </span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="font-brand text-[2.9rem] leading-[1.04] sm:text-6xl md:text-7xl tracking-tight max-w-4xl mb-6"
              >
                Learn it like you{" "}
                <span className="relative inline-block whitespace-nowrap">
                  <span className="relative z-10">invented it.</span>
                  <span
                    className="absolute inset-x-0 bottom-1 md:bottom-2 h-[0.4em] bg-accent3/70 -rotate-1 rounded-sm"
                    aria-hidden
                  />
                </span>
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="font-body text-lg md:text-xl text-fg-muted leading-relaxed max-w-2xl mb-9"
              >
                Studi is a one-on-one tutor that refuses to hand you the answer.
                It asks the exact question that makes a concept click — and when
                words aren't enough, it builds something interactive you can
                poke at. The idea ends up feeling like{" "}
                <em className="text-fg font-semibold not-italic">yours</em>,
                because it is.
              </motion.p>

              <motion.div
                variants={fadeUp}
                id="get-early-access"
                className="w-full max-w-xl mb-4"
              >
                <WaitlistForm />
              </motion.div>

              <motion.p
                variants={fadeUp}
                className="font-bold text-sm text-fg-faint mb-16 md:mb-20"
              >
                Join <span className="text-fg">340+</span> students on the
                waitlist
              </motion.p>

              <motion.div variants={fadeUp} className="w-full max-w-4xl">
                <HeroChatDemo />
              </motion.div>
            </motion.div>
          </section>

          {/* ── MARQUEE ── */}
          <div
            className="mt-16 md:mt-20 border-y-[3px] border-fg bg-accent py-3 overflow-hidden"
            aria-hidden
          >
            <div
              className="landing-marquee flex whitespace-nowrap"
              style={{ animation: "marquee 30s linear infinite" }}
            >
              {[...Array(3)].map((_, i) => (
                <span key={i} className="flex items-center shrink-0">
                  {[
                    "Ask anything",
                    "One question at a time",
                    "Sparks when words fail",
                    "No copy-paste answers",
                    "Built for the aha moment",
                  ].map((item) => (
                    <span key={item} className="flex items-center gap-6 px-6">
                      <span className="font-bold text-fg text-sm md:text-base uppercase tracking-wider">
                        {item}
                      </span>
                      <span className="text-fg/50 font-bold text-lg">✳</span>
                    </span>
                  ))}
                </span>
              ))}
            </div>
          </div>

          <div className="px-4 md:px-6 max-w-6xl mx-auto space-y-20 md:space-y-28 py-16 md:py-20">
            {/* ── THE PROBLEM ── */}
            <section>
              <motion.div
                initial={false}
                whileInView="visible"
                viewport={viewportOpts}
                variants={stagger}
                className="max-w-4xl mx-auto"
              >
                <motion.h2
                  variants={fadeUp}
                  className="font-brand text-4xl sm:text-5xl md:text-6xl leading-[1.08] tracking-tight text-center mb-6"
                >
                  You've been given a thousand answers.
                  <br />
                  <span className="text-accent">How many did you keep?</span>
                </motion.h2>
                <motion.p
                  variants={fadeUp}
                  className="font-body text-lg md:text-xl text-fg-muted leading-relaxed text-center max-w-2xl mx-auto mb-14"
                >
                  Lectures, textbooks, AI chatbots — they all do the same thing:
                  explain <em>at</em> you. It feels productive. Then the exam
                  comes, the page is blank, and the perfect explanation you read
                  is gone. Understanding was never in the explanation. It's in
                  the struggle just before it.
                </motion.p>

                <motion.div
                  variants={fadeUp}
                  className="grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                  {/* Being told */}
                  <div className="relative rounded-2xl border-2 border-fg bg-bg-alt p-6 shadow-[4px_4px_0px_var(--fg)]">
                    <p className="font-bold text-xs uppercase tracking-[0.18em] text-fg-faint mb-5">
                      How school told you
                    </p>
                    <div className="rounded-xl border-2 border-fg/25 bg-white/70 px-3.5 py-2.5 mb-3 font-body text-sm leading-relaxed text-fg-muted">
                      "A negative times a negative is a positive.{" "}
                      <strong className="font-bold">
                        Just remember the rule.
                      </strong>
                      "
                    </div>
                    <div className="space-y-2.5 mb-6">
                      {[86, 68, 74].map((w, i) => (
                        <div
                          key={i}
                          className="h-3 rounded-full bg-fg/15"
                          style={{ width: `${w}%` }}
                        />
                      ))}
                    </div>
                    <p className="font-body text-sm text-fg-muted italic leading-relaxed">
                      You memorized it in sixth grade. You've used it a thousand
                      times. You still couldn't say why it's true.
                    </p>
                    <StickyNote className="absolute -top-3 -right-3" rotate={4}>
                      …okay but <em>why</em>?
                    </StickyNote>
                  </div>

                  {/* Figuring it out */}
                  <div className="relative rounded-2xl border-2 border-fg bg-white p-6 shadow-[4px_4px_0px_var(--accent2)]">
                    <p className="font-bold text-xs uppercase tracking-[0.18em] text-fg-muted mb-5">
                      How Studi asks you
                    </p>
                    <div className="space-y-3 mb-5">
                      <div className="rounded-xl border-2 border-fg bg-accent-dim px-3.5 py-2.5 font-body text-sm leading-relaxed">
                        You have three $5 debts — that's 3 × (−5) on your
                        balance. Now I <em>take away</em> all three: −3 × (−5).
                        Are you richer or poorer?
                      </div>
                      <div className="rounded-xl border-2 border-fg bg-accent2-dim px-3.5 py-2.5">
                        <p className="font-bold text-[11px] uppercase tracking-wider text-fg mb-1">
                          Your answer
                        </p>
                        <p className="font-body text-sm">
                          "Richer. $15 richer… wait.{" "}
                          <strong>
                            Removing a negative IS a positive. That's the whole
                            rule.
                          </strong>
                          "
                        </p>
                      </div>
                    </div>
                    <p className="font-body text-sm text-fg-muted italic leading-relaxed">
                      Twelve years of "just remember it," undone by one question
                      you answered yourself.
                    </p>
                    <StickyNote
                      className="absolute -top-3 -right-3"
                      color="var(--accent2)"
                      rotate={-3}
                    >
                      <span className="text-fg">sticks for good ✓</span>
                    </StickyNote>
                  </div>
                </motion.div>
              </motion.div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section>
              <motion.div
                initial={false}
                whileInView="visible"
                viewport={viewportOpts}
                variants={stagger}
              >
                <motion.p
                  variants={fadeUp}
                  className="text-center font-bold text-xs uppercase tracking-[0.2em] text-fg-muted mb-4"
                >
                  How it works
                </motion.p>
                <motion.h2
                  variants={fadeUp}
                  className="font-brand text-4xl sm:text-5xl md:text-6xl leading-[1.08] tracking-tight text-center mb-6"
                >
                  A conversation, not a lecture.
                </motion.h2>
                <motion.p
                  variants={fadeUp}
                  className="font-body text-lg md:text-xl text-fg-muted text-center max-w-2xl mx-auto mb-14"
                >
                  No courses to enroll in, no playlists to binge. You show up
                  confused, and Studi works the confusion with you until it
                  clicks.
                </motion.p>

                <div className="max-w-3xl mx-auto space-y-5">
                  {[
                    {
                      step: "01",
                      color: "var(--accent)",
                      title: "You bring the confusion.",
                      body: '"Why doesn\'t recursion loop forever?" "What even is a derivative?" Any subject, any level, half-formed questions welcome.',
                    },
                    {
                      step: "02",
                      color: "var(--accent2)",
                      title: "Studi asks back — one sharp question at a time.",
                      body: "Not a quiz, not a lecture. Each question is chosen so the next thought in your head is the concept itself. When you need to see it instead of read it, Studi builds a Spark on the spot.",
                    },
                    {
                      step: "03",
                      color: "var(--accent3)",
                      title: "It clicks — and it stays.",
                      body: "The aha moment lands, and because you got there yourself, there's nothing to memorize. Studi then hands you a problem to prove you own it.",
                    },
                  ].map(({ step, color, title, body }) => (
                    <motion.div
                      key={step}
                      variants={fadeUp}
                      className="flex gap-4 md:gap-6 items-start bg-white rounded-2xl border-2 border-fg p-5 md:p-6 shadow-[4px_4px_0px_var(--fg)]"
                    >
                      <span
                        className="shrink-0 grid place-items-center w-12 h-12 rounded-xl border-2 border-fg font-brand text-lg text-fg shadow-[2px_2px_0px_var(--fg)]"
                        style={{ backgroundColor: color }}
                      >
                        {step}
                      </span>
                      <div>
                        <h3 className="font-brand text-xl md:text-2xl mb-1.5">
                          {title}
                        </h3>
                        <p className="font-body text-fg-muted leading-relaxed text-[15px] md:text-base">
                          {body}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </section>

            {/* ── SPARKS ── */}
            <section>
              <motion.div
                initial={false}
                whileInView="visible"
                viewport={viewportOpts}
                variants={stagger}
              >
                <motion.p
                  variants={fadeUp}
                  className="text-center font-bold text-xs uppercase tracking-[0.2em] text-fg-muted mb-4"
                >
                  Sparks
                </motion.p>
                <motion.h2
                  variants={fadeUp}
                  className="font-brand text-4xl sm:text-5xl md:text-6xl leading-[1.08] tracking-tight text-center mb-6 max-w-3xl mx-auto"
                >
                  When words aren't enough,{" "}
                  <span className="relative inline-block whitespace-nowrap">
                    <span className="relative z-10">Studi builds.</span>
                    <span
                      className="absolute inset-x-0 bottom-1 h-[0.35em] bg-accent2/50 rotate-1 rounded-sm"
                      aria-hidden
                    />
                  </span>
                </motion.h2>
                <motion.p
                  variants={fadeUp}
                  className="font-body text-lg md:text-xl text-fg-muted text-center max-w-2xl mx-auto mb-12"
                >
                  Some ideas refuse to fit in a paragraph. So mid-conversation,
                  Studi generates a Spark — a small interactive thing made for
                  your exact question. Drag it, break it, play with it until the
                  idea gives in.
                </motion.p>

                <motion.div variants={fadeUp}>
                  <SparksShowcase />
                </motion.div>

                <motion.p
                  variants={fadeUp}
                  className="text-center font-bold text-sm text-fg-faint mt-6"
                >
                  Not templates. Every Spark is generated live, for the thing
                  you're stuck on right now.
                </motion.p>
              </motion.div>
            </section>

            {/* ── PRODUCT PROOF ── */}
            <section>
              <motion.div
                initial={false}
                whileInView="visible"
                viewport={viewportOpts}
                variants={stagger}
              >
                <motion.p
                  variants={fadeUp}
                  className="text-center font-bold text-xs uppercase tracking-[0.2em] text-fg-muted mb-4"
                >
                  Built for active learning
                </motion.p>
                <motion.h2
                  variants={fadeUp}
                  className="font-brand text-4xl sm:text-5xl md:text-6xl leading-[1.08] tracking-tight text-center mb-5"
                >
                  What makes Studi feel different.
                </motion.h2>
                <motion.p
                  variants={fadeUp}
                  className="mx-auto mb-10 max-w-2xl text-center font-body text-lg text-fg-muted"
                >
                  No anonymous quotes or borrowed claims—just the product
                  behaviors you can see in every session.
                </motion.p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                  {[
                    {
                      title: "One sharp question",
                      body: "Studi finds the next question that moves your thinking forward instead of unloading a finished explanation.",
                      color: "var(--accent)",
                      rotate: "-1deg",
                    },
                    {
                      title: "A Spark when words stall",
                      body: "When reading is not enough, Studi builds a visual or interactive model for the exact idea in front of you.",
                      color: "var(--accent2)",
                      rotate: "1deg",
                    },
                    {
                      title: "A check that proves it stuck",
                      body: "After the aha moment, Studi gives you a fresh problem so you can prove the idea is yours—not borrowed.",
                      color: "var(--accent3)",
                      rotate: "-1deg",
                    },
                  ].map(({ title, body, color, rotate }, index) => (
                    <motion.article
                      key={title}
                      variants={fadeUp}
                      className="bg-white rounded-2xl border-2 border-fg shadow-[5px_5px_0px_var(--fg)] p-6"
                      style={{ rotate }}
                    >
                      <span
                        className="mb-4 grid h-10 w-10 place-items-center rounded-xl border-2 border-fg text-sm font-bold text-fg shadow-[2px_2px_0px_var(--fg)]"
                        style={{ backgroundColor: color }}
                      >
                        {index + 1}
                      </span>
                      <h3 className="mb-2 font-brand text-2xl">{title}</h3>
                      <p className="font-body text-[15px] leading-relaxed text-fg-muted">
                        {body}
                      </p>
                    </motion.article>
                  ))}
                </div>

                <motion.p
                  variants={fadeUp}
                  className="mt-8 text-center text-sm font-bold text-fg-muted"
                >
                  <span className="text-fg">340+</span> learners have joined
                  early access.
                </motion.p>
              </motion.div>
            </section>

            {/* ── FAQ ── */}
            <section>
              <motion.div
                initial={false}
                whileInView="visible"
                viewport={viewportOpts}
                variants={stagger}
                className="max-w-2xl mx-auto"
              >
                <motion.h2
                  variants={fadeUp}
                  className="font-brand text-4xl sm:text-5xl md:text-6xl leading-tight tracking-tight text-center mb-12"
                >
                  Common questions
                </motion.h2>
                <motion.div variants={fadeUp} className="space-y-4">
                  <FaqItem
                    q="Is it free?"
                    a={PRICING_FAQ_ANSWER}
                  />
                  <FaqItem
                    q="How is this different from ChatGPT?"
                    a="ChatGPT is built to answer. Studi is built to teach — it asks you questions, one at a time, until you work the concept out yourself, and it generates interactive Sparks when seeing beats reading. You leave understanding it, not just holding a good answer."
                  />
                  <FaqItem
                    q="Won't it be annoying if it never just tells me?"
                    a="Studi isn't dogmatic. If you're missing a fact, it gives you the fact. It only holds back when you're one good question away from getting there yourself — that's the part worth protecting."
                  />
                  <FaqItem
                    q="What subjects does it cover?"
                    a="Anything you can ask a question about — CS, math, physics, biology, history, languages. If a human tutor could teach it over a table, Studi can teach it in chat."
                  />
                  <FaqItem
                    q="What is a Spark?"
                    a="A Spark is a small interactive artifact Studi generates mid-conversation when words aren't enough — something you can see, drag, and experiment with. It's built live for your exact question, right inside the chat."
                  />
                </motion.div>
              </motion.div>
            </section>

            {/* ── FINAL CTA ── */}
            <section id="final-cta">
              <motion.div
                initial={false}
                whileInView="visible"
                viewport={viewportOpts}
                variants={stagger}
                className="relative max-w-3xl mx-auto"
              >
                <div
                  className="absolute inset-0 translate-x-3 translate-y-3 bg-accent2 rounded-[2rem] border-2 border-fg"
                  aria-hidden
                />
                <div className="relative bg-white rounded-[2rem] border-[3px] border-fg px-6 py-14 md:px-12 md:py-16 text-center">
                  <motion.h2
                    variants={fadeUp}
                    className="font-brand text-4xl sm:text-6xl md:text-7xl leading-[1.03] tracking-tight mb-5"
                  >
                    Stop being told.
                    <br />
                    <span className="text-accent">Start figuring it out.</span>
                  </motion.h2>
                  <motion.p
                    variants={fadeUp}
                    className="font-body text-lg md:text-xl text-fg-muted mb-9 max-w-md mx-auto"
                  >
                    Join with one email. The optional learner questionnaire can
                    wait until after your place is saved.
                  </motion.p>

                  <motion.div
                    variants={fadeUp}
                    className="w-full max-w-lg mx-auto"
                  >
                    <WaitlistForm />
                  </motion.div>

                  <StickyNote
                    className="absolute -top-4 right-6 hidden md:block"
                    rotate={3}
                  >
                    one email to join ✏️
                  </StickyNote>
                </div>
              </motion.div>
            </section>
          </div>
        </main>

        {/* ── FOOTER ── */}
        <footer className="relative z-10 border-t-[3px] border-fg bg-bg-elevated py-10 px-6">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-5">
            <Wordmark />
            <nav className="flex items-center gap-6 font-bold text-sm text-fg-muted">
              <Link href="/pricing" className="hover:text-fg transition-colors">
                Pricing
              </Link>
              <Link href="/waitlist" className="hover:text-fg transition-colors">
                Optional questionnaire
              </Link>
              <Link href="/chat" className="hover:text-fg transition-colors">
                Open chat
              </Link>
            </nav>
            <p className="font-bold text-xs text-fg-faint uppercase tracking-widest text-center md:text-right">
              © 2026 Studi · Learn it like you invented it.
            </p>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
