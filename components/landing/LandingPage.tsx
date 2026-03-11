"use client";

/* eslint-disable react/no-unescaped-entities */

import Link from "next/link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { SparksShowcase } from "./SparksShowcase";
import { WaitlistForm } from "./WaitlistForm";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const viewportOpts = { once: true, margin: "-80px" };

// FAQ accordion item
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-2 border-[#1c1208] rounded-2xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-5 text-left font-bold font-ui text-base md:text-lg text-[#1c1208] hover:bg-[#fdf8f2] transition-colors"
      >
        <span>{q}</span>
        <span
          className="shrink-0 ml-4 w-7 h-7 flex items-center justify-center rounded-full border-2 border-[#1c1208] bg-white text-[#1c1208] font-bold text-lg transition-transform"
          style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
        >
          +
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <p className="px-6 pb-5 font-body text-[#6b5a47] leading-relaxed border-t-2 border-dashed border-gray-200 pt-4">
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#fdf8f2] text-[#1c1208] selection:bg-[#e05a3a]/20 font-ui overflow-hidden">
      {/* Dot grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03] z-0"
        style={{
          backgroundImage: "radial-gradient(#1c1208 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* ── NAV ── */}
      <header className="fixed top-0 inset-x-0 z-50 p-3 md:p-4 pt-4 md:pt-5 pointer-events-none">
        <div className="max-w-7xl mx-auto flex justify-between items-center pointer-events-auto bg-[#fff8f0]/92 backdrop-blur-md px-4 md:px-6 py-2 md:py-2.5 rounded-full border-2 border-[#1c1208] shadow-[4px_4px_0px_#1c1208]">
          <span className="font-brand text-xl md:text-2xl tracking-tight flex items-center gap-1">
            studi
            <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-[#e05a3a] inline-block mb-1" />
          </span>

          <SignedOut>
            <div className="flex items-center gap-2">
              <SignInButton mode="modal" forceRedirectUrl="/chat">
                <button type="button" className="hidden sm:block font-bold text-sm px-4 py-1.5 rounded-full border-2 border-[#1c1208] bg-white hover:bg-[#f5ede0] transition-colors shadow-[2px_2px_0px_#1c1208] active:translate-y-0.5 active:shadow-none">
                  Sign in
                </button>
              </SignInButton>
              <button
                type="button"
                onClick={() => {
                  const section = document.getElementById("get-early-access");
                  section?.scrollIntoView({ behavior: "smooth", block: "center" });
                  setTimeout(() => {
                    const input = section?.querySelector<HTMLInputElement>("input[type='email']");
                    input?.focus();
                  }, 600);
                }}
                className="font-bold text-sm px-4 py-1.5 rounded-full border-2 border-[#1c1208] bg-[#e05a3a] text-white hover:bg-[#f06a48] transition-colors shadow-[2px_2px_0px_#1c1208] active:translate-y-0.5 active:shadow-none"
              >
                Get Early Access
              </button>
            </div>
          </SignedOut>

          <SignedIn>
            <Link href="/chat" className="font-bold text-sm px-4 py-1.5 rounded-full border-2 border-[#1c1208] bg-[#e05a3a] text-white hover:bg-[#f06a48] transition-colors shadow-[2px_2px_0px_#1c1208] active:translate-y-0.5 active:shadow-none">
              Open chat
            </Link>
          </SignedIn>
        </div>
      </header>

      <main className="relative z-10 pt-24 md:pt-28">

        {/* ── HERO ── */}
        <section className="px-4 md:px-6 max-w-7xl mx-auto py-12 md:py-20">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
            className="flex flex-col lg:flex-row lg:items-center lg:gap-12 xl:gap-16 gap-10 w-full"
          >
            {/* Left: text + form */}
            <div className="flex flex-col items-center lg:items-start text-center lg:text-left lg:w-[46%]">
              {/* Eyebrow */}
              <motion.div variants={fadeUp} className="mb-5 inline-flex items-center gap-2 bg-[#e05a3a]/10 border-2 border-[#e05a3a]/30 rounded-full px-4 py-1.5">
                <span className="w-2 h-2 rounded-full bg-[#e05a3a] animate-pulse" />
                <span className="font-bold text-sm text-[#e05a3a] uppercase tracking-wider">Now in early access</span>
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="font-brand text-5xl sm:text-6xl lg:text-5xl xl:text-6xl leading-tight lg:leading-[1.05] tracking-tight text-[#1c1208] mb-6 drop-shadow-sm"
              >
                The AI tutor that makes you feel like you figured it out{" "}
                <span className="relative inline-block">
                  yourself.
                  <svg className="absolute -bottom-1 left-0 w-full" viewBox="0 0 300 12" fill="none" aria-hidden>
                    <path d="M2 9 Q75 2 150 7 T298 4" stroke="#e05a3a" strokeWidth="3" strokeLinecap="round" fill="none" />
                  </svg>
                </span>
              </motion.h1>

              <motion.p variants={fadeUp} className="text-lg md:text-xl text-[#6b5a47] font-body max-w-2xl mx-auto lg:mx-0 mb-8 leading-relaxed">
                Studi asks questions, builds interactive tools mid-conversation, and gives you real coding challenges — guiding you to discover answers rather than just receive them.
              </motion.p>

              {/* Waitlist form */}
              <motion.div variants={fadeUp} id="get-early-access" className="w-full max-w-lg mx-auto lg:mx-0 mb-4">
                <SignedOut>
                  <WaitlistForm variant="coral" />
                </SignedOut>
                <SignedIn>
                  <Link
                    href="/chat"
                    className="inline-block w-full max-w-sm font-bold px-8 py-4 rounded-xl border-2 border-[#1c1208] bg-[#e05a3a] text-white hover:bg-[#f06a48] transition-all shadow-[4px_4px_0px_#1c1208] text-lg text-center"
                  >
                    Enter Your Lab →
                  </Link>
                </SignedIn>
              </motion.div>

              {/* Waitlist counter */}
              <motion.p variants={fadeUp} className="text-sm font-bold text-[#9b8c7e] font-ui">
                Join <span className="text-[#1c1208]">340+</span> students on the waitlist
              </motion.p>
            </div>

            {/* Right: Hero demo chat mockup */}
            <motion.div variants={fadeUp} className="relative lg:w-[54%] w-full max-w-2xl mx-auto lg:mx-0">
              <div className="absolute inset-0 bg-[#3a9e8a] rounded-[2rem] md:rounded-[2.5rem] transform -rotate-1 hidden sm:block" />
              <div className="relative bg-[#fff8f0] rounded-[1.5rem] md:rounded-[2.5rem] border-4 border-[#1c1208] shadow-[8px_8px_0px_#1c1208] md:shadow-[12px_12px_0px_#1c1208] overflow-hidden flex flex-col">
                {/* Window bar */}
                <div className="h-10 md:h-12 border-b-4 border-[#1c1208] bg-white flex items-center px-4 md:px-6 gap-2 shrink-0">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56] border-2 border-[#1c1208]" />
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border-2 border-[#1c1208]" />
                  <div className="w-3 h-3 rounded-full bg-[#27c93f] border-2 border-[#1c1208]" />
                  <div className="ml-4 font-mono text-xs font-bold text-[#6b5a47]">Studi — Recursion Session</div>
                </div>

                <div className="p-4 md:p-6 flex flex-col gap-4 text-left">
                  {/* Student message */}
                  <div className="flex gap-3 items-start">
                    <div className="bg-[#e4d5c7] shrink-0 px-3 py-2 rounded-xl rounded-tl-sm font-bold border-2 border-[#1c1208] text-sm">You</div>
                    <div className="bg-white p-3 md:p-4 rounded-xl rounded-tl-none border-2 border-[#1c1208] shadow-[2px_2px_0px_#1c1208] font-bold text-sm md:text-base">
                      I don't understand why recursion doesn't just loop forever.
                    </div>
                  </div>

                  {/* Studi Socratic response */}
                  <div className="flex gap-3 items-start self-end max-w-[95%]">
                    <div className="flex-1 bg-[#e05a3a] text-white p-3 md:p-4 rounded-xl rounded-tr-sm border-2 border-[#1c1208] shadow-[2px_2px_0px_#1c1208] text-sm md:text-base leading-relaxed order-first">
                      Good question — let me ask you something first.<br /><br />
                      Look at this function:
                      <div className="mt-3 bg-[#1c1208] text-[#fdf8f2] p-3 rounded-xl border-2 border-[#1c1208] font-mono text-xs md:text-sm">
                        <p className="text-[#3a9e8a]">def <span className="text-[#e8a030]">factorial</span>(n):</p>
                        <p className="pl-4">if n == 1: <span className="text-gray-400"># the base case</span></p>
                        <p className="pl-8 text-[#e8a030]">return 1</p>
                        <p className="pl-4">return n * factorial(n - 1)</p>
                      </div>
                      <div className="mt-3 bg-[#c44d2e]/30 border-2 border-white/30 rounded-xl p-3 font-bold text-sm md:text-base">
                        What do you think would happen if we removed the <code className="bg-white/20 px-1 rounded">if n == 1</code> line entirely? Take a guess →
                      </div>
                    </div>
                    <div className="bg-[#1c1208] text-white shrink-0 px-3 py-2 rounded-xl rounded-tr-sm border-2 border-[#1c1208] font-bold text-sm">Studi</div>
                  </div>

                  {/* Student realises */}
                  <div className="flex gap-3 items-start">
                    <div className="bg-[#e4d5c7] shrink-0 px-3 py-2 rounded-xl rounded-tl-sm font-bold border-2 border-[#1c1208] text-sm">You</div>
                    <div className="bg-white p-3 md:p-4 rounded-xl rounded-tl-none border-2 border-[#1c1208] shadow-[2px_2px_0px_#1c1208] text-sm md:text-base">
                      <span className="font-bold">Oh — it would call itself forever. The base case is what makes it stop.</span> It's the condition that breaks the loop!
                    </div>
                  </div>

                  {/* Studi confirms + sparks */}
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    transition={{ delay: 1.2, duration: 0.5 }}
                    className="flex gap-3 items-start self-end max-w-[95%] overflow-hidden"
                  >
                    <div className="flex-1 bg-[#3a9e8a] text-white p-3 md:p-4 rounded-xl rounded-tr-sm border-2 border-[#1c1208] shadow-[2px_2px_0px_#1c1208] text-sm md:text-base order-first">
                      <span className="font-bold">Exactly right.</span> You just discovered it yourself. Now let's make sure it sticks —
                      <div className="mt-2 inline-flex items-center gap-2 bg-white/20 border border-white/30 rounded-lg px-3 py-1.5 text-xs font-bold">
                        <span className="animate-pulse w-1.5 h-1.5 rounded-full bg-white" />
                        Generating call-stack Spark...
                      </div>
                    </div>
                    <div className="bg-[#1c1208] text-white shrink-0 px-3 py-2 rounded-xl rounded-tr-sm border-2 border-[#1c1208] font-bold text-sm">Studi</div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* ── MARQUEE ── */}
        <div className="border-y-4 border-[#1c1208] bg-[#e05a3a] py-3 overflow-hidden relative">
          <div
            className="flex gap-0 whitespace-nowrap"
            style={{ animation: "marquee 28s linear infinite" }}
          >
            {[...Array(3)].map((_, i) => (
              <span key={i} className="flex items-center gap-0 shrink-0">
                {[
                  "Interactive Scenes",
                  "Desmos Graphs",
                  "Python Playground",
                  "Web Playground",
                  "Adaptive Quizzes",
                  "Flashcard Sets",
                  "Coding Labs",
                  "Voice Tutoring",
                  "Learning Plans",
                ].map((item) => (
                  <span key={item} className="flex items-center gap-6 px-6">
                    <span className="font-bold text-white text-sm md:text-base uppercase tracking-wider">{item}</span>
                    <span className="text-white/50 font-bold text-lg">·</span>
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>

        <div className="px-4 md:px-6 max-w-7xl mx-auto space-y-28 md:space-y-36 py-20 md:py-28">

          {/* ── PROBLEM ── */}
          <section>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
              className="max-w-4xl mx-auto"
            >
              <motion.h2 variants={fadeUp} className="font-brand text-4xl sm:text-5xl md:text-7xl text-[#1c1208] leading-tight md:leading-[1.08] tracking-tight mb-8 text-center">
                Stuck studying alone at 2am —{" "}
                <span className="text-[#e05a3a]">and still not getting it?</span>
              </motion.h2>

              <motion.p variants={fadeUp} className="font-body text-lg md:text-2xl text-[#6b5a47] leading-relaxed text-center max-w-3xl mx-auto mb-14">
                You've read the chapter. Watched the lecture. Asked ChatGPT. You got a perfect-sounding answer. And still don't really get it.<br /><br />
                Because understanding doesn't come from being told. It comes from figuring it out. No tutor was ever built around that — <strong className="text-[#1c1208]">until now.</strong>
              </motion.p>

              {/* Two-column visual contrast */}
              <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 max-w-4xl mx-auto">
                {/* ChatGPT side */}
                <div className="bg-gray-100 rounded-2xl border-2 border-gray-300 p-5 relative">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-full bg-gray-300 border-2 border-gray-400 flex items-center justify-center font-bold text-gray-600 text-xs">AI</div>
                    <span className="font-bold text-gray-500 text-sm">ChatGPT</span>
                  </div>
                  <p className="text-gray-600 text-sm leading-relaxed font-body">
                    Recursion is a programming technique where a function calls itself. It consists of a base case, which terminates the recursion, and a recursive case, which continues it. Each call creates a new stack frame...
                  </p>
                  <p className="text-gray-500 text-sm mt-3 font-body">
                    The time complexity of recursive algorithms can be analyzed using the Master theorem...
                  </p>
                  <p className="text-gray-400 text-sm mt-3 font-body italic">Hope that helps! Let me know if you have more questions.</p>
                  {/* Sticky note */}
                  <div className="absolute -top-3 -right-3 bg-[#e8a030] border-2 border-[#1c1208] rounded-lg px-3 py-1.5 rotate-3 shadow-[2px_2px_0px_#1c1208]">
                    <p className="font-bold text-xs text-[#1c1208]">...okay but why?</p>
                  </div>
                </div>

                {/* Studi side */}
                <div className="bg-white rounded-2xl border-2 border-[#3a9e8a] shadow-[4px_4px_0px_#3a9e8a] p-5 relative">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-full bg-[#3a9e8a] border-2 border-[#1c1208] flex items-center justify-center font-bold text-white text-xs">S</div>
                    <span className="font-bold text-[#1c1208] text-sm">Studi</span>
                  </div>
                  <p className="text-[#1c1208] text-sm font-body font-medium leading-relaxed">
                    Before I explain — what do you think would happen if we removed the base case entirely?
                  </p>
                  <div className="mt-3 bg-[#fdf8f2] border-2 border-[#3a9e8a] rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="animate-pulse w-2 h-2 rounded-full bg-[#e05a3a]" />
                      <span className="font-bold text-xs text-[#3a9e8a]">Call Stack Spark</span>
                    </div>
                    <div className="font-mono text-xs text-gray-500">factorial(3) → factorial(2) → factorial(1) ...</div>
                  </div>
                  <p className="text-[#6b5a47] text-xs mt-3 font-body italic">You just figured out the base case yourself. It sticks now.</p>
                </div>
              </motion.div>
            </motion.div>
          </section>

          {/* ── HOW STUDI TEACHES ── */}
          <section>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
              className="max-w-5xl mx-auto"
            >
              <motion.h2 variants={fadeUp} className="font-brand text-4xl sm:text-5xl md:text-6xl text-center mb-4 leading-tight">
                How Studi teaches
              </motion.h2>
              <motion.p variants={fadeUp} className="text-center font-body text-lg md:text-xl text-[#6b5a47] mb-14 max-w-2xl mx-auto">
                Every session is a guided discovery. Studi asks before it tells, builds tools when words aren't enough, and gives you the problem to prove it.
              </motion.p>

              <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    step: "01",
                    color: "#e05a3a",
                    title: "You ask.",
                    body: "\"I don't understand why recursion doesn't just loop forever.\"",
                    tag: "Any question, any subject",
                  },
                  {
                    step: "02",
                    color: "#3a9e8a",
                    title: "Studi asks back.",
                    body: "\"What do you think happens when n = 1? Walk me through it.\" + a call-stack Spark to visualise your thinking.",
                    tag: "Socratic method + Sparks",
                  },
                  {
                    step: "03",
                    color: "#e8a030",
                    title: "You own it.",
                    body: "You work it out. The answer feels like your idea. Because it is — you discovered it.",
                    tag: "Intuition that sticks",
                  },
                ].map(({ step, color, title, body, tag }) => (
                  <div
                    key={step}
                    className="bg-white rounded-3xl border-4 border-[#1c1208] shadow-[6px_6px_0px_#1c1208] p-6 flex flex-col gap-4"
                  >
                    <div
                      className="w-12 h-12 rounded-xl border-4 border-[#1c1208] flex items-center justify-center font-brand text-xl font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {step}
                    </div>
                    <h3 className="font-brand text-2xl md:text-3xl text-[#1c1208]">{title}</h3>
                    <p className="font-body text-[#6b5a47] leading-relaxed flex-1">{body}</p>
                    <div
                      className="inline-block self-start px-3 py-1 rounded-full border-2 border-[#1c1208] font-bold text-xs uppercase tracking-wider text-white"
                      style={{ backgroundColor: color }}
                    >
                      {tag}
                    </div>
                  </div>
                ))}
              </motion.div>
            </motion.div>
          </section>

          {/* ── SPARKS ── */}
          <section>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
              className="max-w-5xl mx-auto"
            >
              <motion.h2 variants={fadeUp} className="font-brand text-4xl sm:text-5xl md:text-7xl text-center mb-4 leading-tight">
                Some concepts need to be{" "}
                <span className="text-[#3a9e8a]">seen.</span>{" "}
                Or{" "}
                <span className="text-[#e8a030]">touched.</span>{" "}
                Or{" "}
                <span className="text-[#e05a3a]">broken.</span>
              </motion.h2>
              <motion.p variants={fadeUp} className="text-center font-body text-lg md:text-xl text-[#6b5a47] mb-12 max-w-3xl mx-auto leading-relaxed">
                Studi generates the right interactive tool for the right moment — a graph you can manipulate, a simulation you can break, a challenge you have to pass. Not an attachment. Not a link. Built for your exact question, inside the conversation.
              </motion.p>

              <motion.div variants={fadeUp}>
                <SparksShowcase />
              </motion.div>

              <motion.p variants={fadeUp} className="text-center text-sm text-[#9b8c7e] font-ui mt-2">
                Every Spark is generated on the fly and tailored to exactly what you're stuck on.
              </motion.p>
            </motion.div>
          </section>

          {/* ── PLANS ── */}
          <section>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
              className="flex flex-col lg:flex-row-reverse gap-12 md:gap-16 items-center max-w-6xl mx-auto"
            >
              <div className="lg:w-1/2 text-left">
                <motion.h2 variants={fadeUp} className="font-brand text-4xl sm:text-5xl md:text-6xl mb-6 leading-tight">
                  Tell it what you want to learn. It builds the roadmap.
                </motion.h2>
                <motion.p variants={fadeUp} className="text-lg md:text-xl font-body leading-relaxed text-[#6b5a47]">
                  Going into an exam? Learning Python from scratch? Trying to finally understand linear algebra?<br /><br />
                  Tell Studi. It drafts a milestone plan, tracks where you are, and adjusts as you go. You always know what's next — and so does your tutor.
                </motion.p>
              </div>

              <motion.div variants={fadeUp} className="lg:w-1/2 w-full px-4 md:px-0">
                <div className="bg-white rounded-2xl md:rounded-3xl border-4 border-[#1c1208] shadow-[8px_8px_0px_#1c1208] p-6 md:p-8 max-w-md mx-auto hover:-rotate-1 transition-transform duration-300 -rotate-2">
                  <div className="font-brand text-xl md:text-2xl font-bold mb-6 border-b-2 border-dashed border-gray-300 pb-4">
                    Understand Calculus for Physics
                  </div>
                  <div className="space-y-5">
                    <div className="flex gap-4 items-start opacity-50">
                      <div className="w-8 h-8 rounded-full bg-[#1c1208] text-white flex items-center justify-center font-bold text-sm shrink-0 border-2 border-[#1c1208]">✓</div>
                      <div>
                        <h4 className="font-bold text-base line-through">Limits and Infinity</h4>
                        <p className="text-xs text-gray-400">Completed yesterday</p>
                      </div>
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="w-8 h-8 rounded-full bg-[#e8a030] text-[#1c1208] flex items-center justify-center font-bold text-lg shrink-0 border-2 border-[#1c1208]" />
                      <div>
                        <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-[#e8a030]/20 text-[#e8a030] border border-[#e8a030] uppercase mb-1">In Progress</div>
                        <h4 className="font-bold text-xl">The Derivative</h4>
                        <p className="text-sm text-gray-600 font-medium">Visualising rates of change</p>
                      </div>
                    </div>
                    <div className="flex gap-4 items-start opacity-50">
                      <div className="w-8 h-8 rounded-full bg-white text-[#1c1208] flex items-center justify-center font-bold text-sm shrink-0 border-2 border-gray-300" />
                      <div>
                        <h4 className="font-bold text-base">Integrals</h4>
                        <p className="text-xs text-gray-400">Locked — complete The Derivative first</p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </section>

          {/* ── LABS ── */}
          <section>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
              className="max-w-6xl mx-auto"
            >
              <div className="flex flex-col lg:flex-row gap-10 md:gap-16 items-center">
                <div className="lg:w-5/12 text-left">
                  <motion.div variants={fadeUp} className="inline-block mb-4 px-3 py-1 rounded-full border-2 border-[#e05a3a] bg-[#e05a3a]/10 font-bold text-xs uppercase tracking-wider text-[#e05a3a]">
                    The Lab
                  </motion.div>
                  <motion.h2 variants={fadeUp} className="font-brand text-4xl sm:text-5xl md:text-6xl mb-6 leading-tight">
                    Where you prove you understand it.
                  </motion.h2>
                  <motion.p variants={fadeUp} className="text-lg md:text-xl font-body leading-relaxed text-[#6b5a47] mb-6">
                    When you're ready to go beyond understanding — the Lab opens a real coding environment, right inside your session. Studi gives you the challenge, watches you work, reads your files, runs your code, and tells you when you've got it.
                  </motion.p>
                  <motion.p variants={fadeUp} className="text-lg md:text-xl font-body leading-relaxed text-[#6b5a47] font-bold border-l-4 border-[#e05a3a] pl-5 mb-8">
                    Not a sandbox you paste into. A real environment your tutor opens, owns, and evaluates.
                  </motion.p>
                  <motion.ul variants={fadeUp} className="space-y-2">
                    {[
                      "Persistent real browser sandbox",
                      "Tutor assigns the exact challenge",
                      "Reads and runs your code live",
                      "Guides you when you're stuck",
                      "You don't move on until it passes",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-3 font-ui font-bold text-[#1c1208] text-sm md:text-base">
                        <span className="w-5 h-5 rounded-full bg-[#e05a3a] border-2 border-[#1c1208] flex items-center justify-center text-white text-xs shrink-0">✓</span>
                        {item}
                      </li>
                    ))}
                  </motion.ul>
                </div>

                {/* Lab IDE mockup */}
                <motion.div variants={fadeUp} className="lg:w-7/12 w-full">
                  <div className="w-full aspect-[4/3] md:aspect-video bg-[#1c1208] rounded-2xl md:rounded-3xl border-4 border-[#1c1208] shadow-[8px_8px_0px_#e05a3a] md:shadow-[12px_12px_0px_#e05a3a] overflow-hidden flex flex-col">
                    {/* Title bar */}
                    <div className="flex bg-[#2a1c10] border-b border-gray-700 shrink-0">
                      <div className="flex items-center gap-2 px-4 py-3 border-r border-gray-700 font-bold text-white text-xs md:text-sm">
                        <div className="w-2 h-2 rounded-full bg-[#3a9e8a]" />
                        <span>Studi Tutor</span>
                      </div>
                      <div className="flex-1 px-4 py-3 font-mono text-xs text-gray-300 flex items-center gap-2">
                        <span className="text-gray-500">~/lab/</span>
                        <span>binary_search.py</span>
                        <span className="ml-auto flex items-center gap-1.5 text-[#e8a030]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#e8a030]" />
                          <span className="text-xs">unsaved</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-1 overflow-hidden">
                      {/* Tutor panel */}
                      <div className="w-[38%] bg-[#1e1408] border-r border-gray-700 flex flex-col justify-end p-3 md:p-4 text-xs md:text-sm overflow-y-auto">
                        <div className="bg-[#2a1c10] border border-gray-600 rounded-xl p-3 mb-2 text-gray-400 font-body text-xs leading-relaxed">
                          Great — you understand binary search. Now prove it.
                        </div>
                        <div className="bg-[#3a9e8a]/20 border border-[#3a9e8a] text-[#3a9e8a] p-3 rounded-xl text-xs leading-relaxed">
                          <p className="font-bold mb-1">Challenge:</p>
                          <p>Implement <code className="bg-[#1c1208] px-1 rounded">binary_search(arr, target)</code> that returns <code className="bg-[#1c1208] px-1 rounded">-1</code> if not found.</p>
                        </div>
                      </div>

                      {/* Code editor */}
                      <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 bg-[#1c1208] p-3 md:p-4 font-mono text-[10px] sm:text-xs md:text-sm overflow-hidden">
                          <p className="text-[#3a9e8a]">def <span className="text-[#e8a030]">binary_search</span><span className="text-gray-300">(arr, target):</span></p>
                          <p className="text-gray-300 pl-4">left, right = 0, len(arr) - 1</p>
                          <p className="text-gray-300 pl-4 mt-1">while left {"<="} right:</p>
                          <p className="text-gray-300 pl-8">mid = (left + right) // 2</p>
                          <p className="text-gray-300 pl-8">if arr[mid] == target:</p>
                          <p className="text-[#e8a030] pl-12">return mid</p>
                          <p className="text-gray-300 pl-8">elif arr[mid] {"<"} target:</p>
                          <p className="text-gray-300 pl-12">left = mid + 1</p>
                          <p className="text-gray-300 pl-8">else:</p>
                          <p className="text-gray-300 pl-12">right = mid - 1</p>
                          <div className="flex items-center pl-4 mt-1">
                            <motion.div
                              animate={{ opacity: [1, 0, 1] }}
                              transition={{ repeat: Infinity, duration: 0.9 }}
                              className="w-1.5 h-4 bg-white inline-block"
                            />
                          </div>
                        </div>

                        {/* Test result bar */}
                        <div className="border-t border-gray-700 bg-[#1a1208] px-3 md:px-4 py-2 flex items-center gap-3 shrink-0">
                          <motion.div
                            animate={{ opacity: [0.6, 1, 0.6] }}
                            transition={{ repeat: Infinity, duration: 1.5 }}
                            className="flex items-center gap-2"
                          >
                            <span className="w-2 h-2 rounded-full bg-[#3a9e8a] shrink-0" />
                            <span className="font-mono text-[10px] md:text-xs text-[#3a9e8a] font-bold">Running tests...</span>
                          </motion.div>
                          <span className="font-mono text-[10px] md:text-xs text-gray-500 ml-auto">2 / 3 passing</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </section>

          {/* ── SOCIAL PROOF ── */}
          <section>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
              className="max-w-5xl mx-auto text-center"
            >
              <motion.div variants={fadeUp} className="inline-flex items-center gap-3 mb-12 bg-white border-2 border-[#1c1208] rounded-full px-6 py-3 shadow-[4px_4px_0px_#1c1208]">
                <div className="flex -space-x-2">
                  {["#e05a3a", "#3a9e8a", "#e8a030"].map((c, i) => (
                    <div key={i} className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: c }}>
                      {["P", "M", "D"][i]}
                    </div>
                  ))}
                </div>
                <p className="font-bold text-[#1c1208] text-sm md:text-base">
                  Join <span className="text-[#e05a3a]">340+</span> students on the waitlist
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    quote: "Studi helped me finally understand Big O notation. I'd been staring at it for weeks — it asked me one question and suddenly it clicked.",
                    name: "Priya K.",
                    role: "CS sophomore",
                    color: "#e05a3a",
                  },
                  {
                    quote: "I've never felt like I actually got recursion until Studi made me walk through it myself. It doesn't give you the answer. It makes you find it.",
                    name: "Marcus T.",
                    role: "Self-taught developer",
                    color: "#3a9e8a",
                  },
                  {
                    quote: "The Lab is wild. It assigns me a challenge, watches me code, and tells me exactly when I'm wrong — and why. Like having a senior dev next to you.",
                    name: "Daniela R.",
                    role: "Pre-med taking data science",
                    color: "#e8a030",
                  },
                ].map(({ quote, name, role, color }) => (
                  <motion.div
                    key={name}
                    variants={fadeUp}
                    className="bg-white rounded-3xl border-4 border-[#1c1208] shadow-[6px_6px_0px_#1c1208] p-6 text-left flex flex-col gap-4"
                  >
                    <div className="flex gap-1">
                      {[...Array(5)].map((_, i) => (
                        <span key={i} className="text-[#e8a030] text-lg">★</span>
                      ))}
                    </div>
                    <p className="font-body text-[#1c1208] leading-relaxed flex-1 text-sm md:text-base">
                      "{quote}"
                    </p>
                    <div className="flex items-center gap-3 pt-3 border-t-2 border-dashed border-gray-200">
                      <div
                        className="w-9 h-9 rounded-full border-2 border-[#1c1208] flex items-center justify-center text-white font-bold text-sm shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {name[0]}
                      </div>
                      <div>
                        <p className="font-bold text-[#1c1208] text-sm">{name}</p>
                        <p className="text-xs text-[#9b8c7e]">{role}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </section>

          {/* ── CHATGPT CONTRAST ── */}
          <section>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
              className="max-w-5xl mx-auto"
            >
              <motion.h2 variants={fadeUp} className="font-brand text-5xl sm:text-6xl md:text-8xl text-center mb-6 leading-tight tracking-tight">
                ChatGPT answers.<br />
                <span className="text-[#e05a3a]">Studi asks.</span>
              </motion.h2>
              <motion.p variants={fadeUp} className="text-center font-body text-lg md:text-xl text-[#6b5a47] mb-12 max-w-2xl mx-auto">
                The direction of information is completely different. ChatGPT flows answers at you. Studi draws them out of you.
              </motion.p>

              <motion.div variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                {/* ChatGPT */}
                <div className="bg-gray-100 rounded-3xl border-4 border-gray-300 p-6 md:p-8 relative">
                  <p className="font-bold text-gray-400 text-xs uppercase tracking-widest mb-6">ChatGPT</p>
                  <div className="space-y-3 mb-6">
                    {[
                      "Here is a detailed explanation of recursion...",
                      "The base case terminates the recursion while...",
                      "Time complexity can be analyzed using the Master theorem...",
                      "I hope this comprehensive answer helps clarify the concept!",
                    ].map((line, i) => (
                      <div key={i} className="h-3 rounded-full bg-gray-300" style={{ width: `${[90, 75, 85, 60][i]}%` }} />
                    ))}
                  </div>
                  <div className="bg-[#e8a030] border-2 border-[#1c1208] rounded-xl px-4 py-2 inline-block rotate-2 shadow-[2px_2px_0px_#1c1208]">
                    <p className="font-bold text-[#1c1208] text-sm">...okay but why does it work?</p>
                  </div>
                  <div className="mt-6 flex items-start gap-3">
                    <span className="text-2xl">😶</span>
                    <p className="font-body text-gray-500 text-sm italic">You copy-paste the answer. Move on. Forget it by tomorrow.</p>
                  </div>
                </div>

                {/* Studi */}
                <div className="bg-white rounded-3xl border-4 border-[#e05a3a] shadow-[8px_8px_0px_#e05a3a] p-6 md:p-8 relative">
                  <p className="font-bold text-[#e05a3a] text-xs uppercase tracking-widest mb-6">Studi</p>
                  <div className="space-y-3 mb-4">
                    <div className="bg-[#e05a3a]/10 border-2 border-[#e05a3a]/30 rounded-xl p-3 font-body text-sm text-[#1c1208]">
                      Before I explain — what do you think the function does when n equals 1?
                    </div>
                    <div className="bg-[#fdf8f2] border-2 border-[#3a9e8a] rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#e05a3a] animate-pulse" />
                        <span className="font-bold text-xs text-[#3a9e8a]">Spark: Call Stack Visualiser</span>
                      </div>
                      <div className="font-mono text-xs text-gray-400">factorial(3) → factorial(2) → factorial(1) → 1</div>
                    </div>
                    <div className="bg-[#3a9e8a]/10 border-2 border-[#3a9e8a]/30 rounded-xl p-3 font-bold text-xs text-[#3a9e8a] flex items-center gap-2">
                      <span>✓</span> Lab challenge: implemented factorial. 3/3 tests passing.
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🧠</span>
                    <p className="font-body text-[#6b5a47] text-sm italic">You discovered it yourself. It feels like your idea. It sticks.</p>
                  </div>
                </div>
              </motion.div>

              <motion.p variants={fadeUp} className="font-brand text-2xl md:text-4xl text-center text-[#1c1208] max-w-3xl mx-auto">
                There's a difference between being told something and <span className="text-[#e05a3a]">understanding it.</span> Studi is built for the second one.
              </motion.p>
            </motion.div>
          </section>

          {/* ── FAQ ── */}
          <section>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
              className="max-w-3xl mx-auto"
            >
              <motion.h2 variants={fadeUp} className="font-brand text-4xl sm:text-5xl md:text-6xl text-center mb-12 leading-tight">
                Common questions
              </motion.h2>
              <motion.div variants={fadeUp} className="space-y-3">
                <FaqItem
                  q="Is it free?"
                  a="Studi is free for students during early access. We'll introduce a paid plan later with fair student pricing — we'll always offer a meaningful free tier."
                />
                <FaqItem
                  q="How is this different from ChatGPT?"
                  a="ChatGPT gives you answers. Studi asks you questions and guides you to figure it out yourself — so you actually understand it, not just copy it. It also generates interactive tools mid-conversation and gives you real coding challenges to prove you understand."
                />
                <FaqItem
                  q="What subjects does it cover?"
                  a="Studi works across any subject — CS, math, physics, biology, history, languages. If you can ask a question about it, Studi can teach it. The Labs currently focus on coding, with more types coming."
                />
                <FaqItem
                  q="What is a Spark?"
                  a="A Spark is an interactive tool Studi generates mid-conversation — a live Desmos graph, a physics simulation, a Python playground, a web preview, a quiz, or a flashcard set. Built for your exact question, in real time, inside the chat."
                />
                <FaqItem
                  q="What is a Lab?"
                  a="Labs are persistent coding environments attached to your session. Your tutor opens the sandbox, assigns you a specific challenge, watches you write the code, runs your tests, and evaluates your solution. Currently supports coding sandboxes — more Lab types are coming."
                />
              </motion.div>
            </motion.div>
          </section>

          {/* ── FINAL CTA ── */}
          <section id="final-cta" className="py-12 md:py-20 flex flex-col items-center justify-center text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={viewportOpts}
              variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
              className="max-w-3xl mx-auto w-full"
            >
              <motion.h2 variants={fadeUp} className="font-brand text-5xl sm:text-6xl md:text-8xl mb-5 tracking-tight leading-tight">
                Stop being told.<br />
                <span className="text-[#e05a3a]">Start figuring it out.</span>
              </motion.h2>
              <motion.p variants={fadeUp} className="text-lg md:text-2xl font-body text-[#6b5a47] mb-8 max-w-xl mx-auto">
                Join the waitlist. Be first when Studi launches.
              </motion.p>

              {/* Feature checklist */}
              <motion.ul variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-10 text-left max-w-lg mx-auto">
                {[
                  "Socratic tutoring that leads you to the answer",
                  "Sparks — interactive tools in the moment",
                  "Labs — real coding challenges in your session",
                  "Learning plans with milestone tracking",
                  "Voice mode for spoken sessions",
                  "Works for any subject",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm font-ui text-[#1c1208]">
                    <span className="w-5 h-5 rounded-full bg-[#3a9e8a] border-2 border-[#1c1208] text-white flex items-center justify-center text-xs shrink-0 mt-0.5">✓</span>
                    {item}
                  </li>
                ))}
              </motion.ul>

              <motion.div variants={fadeUp} className="w-full max-w-md mx-auto relative group">
                <div className="absolute inset-0 bg-[#3a9e8a] rounded-3xl transform -rotate-2 transition-transform group-hover:-rotate-3" />
                <div className="relative bg-white rounded-3xl border-4 border-[#1c1208] shadow-[6px_6px_0px_#1c1208] p-6 md:p-8">
                  <SignedOut>
                    <WaitlistForm variant="teal" />
                  </SignedOut>
                  <SignedIn>
                    <div className="text-center">
                      <h3 className="font-bold text-xl mb-4 text-[#3a9e8a]">You're already in!</h3>
                      <Link href="/chat" className="inline-block w-full font-bold px-6 py-4 rounded-xl border-2 border-[#1c1208] bg-[#3a9e8a] text-white shadow-[4px_4px_0px_#1c1208] text-lg hover:bg-[#2c7a6a] hover:-translate-y-1 transition-all">
                        Go to Dashboard
                      </Link>
                    </div>
                  </SignedIn>
                </div>
              </motion.div>
            </motion.div>
          </section>

        </div>
      </main>

      <footer className="border-t-4 border-[#1c1208] bg-white py-8 md:py-12 px-6 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center gap-2 md:gap-3">
          <div className="font-brand text-3xl md:text-4xl flex items-center gap-1">
            studi
            <span className="w-2.5 h-2.5 rounded-full bg-[#e05a3a] inline-block mb-1" />
          </div>
          <p className="font-bold text-gray-400 uppercase tracking-widest text-xs">
            © 2026 Studi · The tutor that makes you feel like you figured it out yourself.
          </p>
        </div>
      </footer>
    </div>
  );
}
