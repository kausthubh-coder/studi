"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { motion, useScroll, useTransform } from "framer-motion";
import { SparksShowcase } from "./SparksShowcase";

const Waitlist = dynamic(
  () => import("@clerk/nextjs").then((module) => module.Waitlist),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] rounded-2xl bg-[#f5ede0] border-2 border-[#e8ddd0]" />
    ),
  },
);

export function LandingPage() {
  const { scrollYProgress } = useScroll();
  const backgroundY = useTransform(scrollYProgress, [0, 1], ["0%", "50%"]);

  return (
    <div className="min-h-screen bg-[#fdf8f2] text-[#1c1208] selection:bg-[#e05a3a]/20 font-ui overflow-hidden">
      {/* Decorative Grid Background */}
      <motion.div
        className="fixed inset-0 pointer-events-none opacity-[0.03] z-0"
        style={{
          backgroundImage: "radial-gradient(#1c1208 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
          y: backgroundY
        }}
      />

      {/* Navigation */}
      <header className="fixed top-0 inset-x-0 z-50 p-4 pt-6 pointer-events-none">
        <div className="max-w-7xl mx-auto flex justify-between items-center pointer-events-auto bg-[#fff8f0]/90 backdrop-blur-md px-6 py-3 rounded-full border-2 border-[#1c1208] shadow-[4px_4px_0px_#1c1208]">
          <span className="font-brand text-2xl tracking-tight flex items-center gap-1">
            studi
            <span className="w-2.5 h-2.5 rounded-full bg-[#e05a3a] inline-block mb-1" />
          </span>

          <SignedOut>
            <SignInButton mode="modal" forceRedirectUrl="/chat">
              <button type="button" className="font-bold px-5 py-2 rounded-full border-2 border-[#1c1208] bg-white hover:bg-[#f5ede0] transition-colors shadow-[2px_2px_0px_#1c1208] active:translate-y-0.5 active:shadow-[0px_0px_0px_#1c1208]">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <Link href="/chat" className="font-bold px-5 py-2 rounded-full border-2 border-[#1c1208] bg-[#e05a3a] text-white hover:bg-[#f06a48] transition-colors shadow-[2px_2px_0px_#1c1208] active:translate-y-0.5 active:shadow-none">
              Open chat
            </Link>
          </SignedIn>
        </div>
      </header>

      <main className="relative z-10 pt-32 pb-24 px-6 max-w-7xl mx-auto space-y-32">
        {/* Hero Section */}
        <section className="min-h-[85vh] flex flex-col items-center justify-center text-center relative py-12">
          {/* Floating animated elements */}
          <motion.div animate={{ y: [0, -15, 0], rotate: [0, 5, -5, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }} className="absolute md:top-20 top-10 left-[10%] text-5xl opacity-80 drop-shadow-md">📐</motion.div>
          <motion.div animate={{ y: [0, 20, 0], rotate: [0, -10, 10, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="absolute top-40 right-[15%] text-6xl opacity-80 drop-shadow-md">🧪</motion.div>
          <motion.div animate={{ y: [0, -25, 0], rotate: [0, 15, -15, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 2 }} className="absolute bottom-40 left-[15%] text-6xl opacity-80 drop-shadow-md">💡</motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-4xl mx-auto z-10"
          >
            <div className="inline-block px-4 py-1.5 rounded-full border-2 border-[#3a9e8a] bg-[#3a9e8a]/10 text-[#3a9e8a] font-bold text-sm mb-6 transform -rotate-2">
              Agentic Learning for the Next Generation
            </div>
            <h1 className="font-brand text-6xl md:text-8xl leading-[1.05] tracking-tight text-[#1c1208] mb-6 drop-shadow-sm">
              Learn anything.<br />
              <span className="relative inline-block mt-2">
                <span className="relative z-10 italic text-[#e05a3a]">Deeply.</span>
                <svg className="absolute w-full h-4 -bottom-1 left-0 text-[#e8a030] opacity-60 z-0" viewBox="0 0 100 20" preserveAspectRatio="none">
                  <path d="M0 15 Q 50 0, 100 15" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-[#6b5a47] font-body max-w-2xl mx-auto mb-10 leading-relaxed">
              Studi is not a flashcard app. It&apos;s an intelligent, interactive companion that adapts to you in real time and teaches through guided problem-solving.
            </p>

            <div className="w-full max-w-md mx-auto relative group mt-8">
              <div className="absolute inset-0 bg-[#3a9e8a] rounded-3xl transform rotate-2 transition-transform group-hover:rotate-4" />
              <div className="relative bg-white rounded-3xl border-4 border-[#1c1208] overflow-hidden shadow-[8px_8px_0px_#1c1208]">
                <SignedOut>
                  <div className="flex justify-center p-4">
                    <Waitlist appearance={{
                      elements: {
                        card: "shadow-none border-none p-0 bg-transparent",
                        rootBox: "w-full",
                        headerTitle: "font-brand text-2xl text-[#1c1208]",
                        headerSubtitle: "font-body text-[#6b5a47]",
                      },
                      variables: {
                        colorPrimary: "#e05a3a",
                        colorText: "#1c1208",
                        borderRadius: "12px",
                      },
                    }} />
                  </div>
                </SignedOut>
                <SignedIn>
                  <div className="p-8 text-center bg-white">
                    <p className="font-bold text-xl mb-6">You&apos;re signed in!</p>
                    <Link href="/chat" className="inline-block w-full font-bold px-6 py-4 rounded-xl border-2 border-[#1c1208] bg-[#e05a3a] text-white hover:bg-[#f06a48] hover:-translate-y-1 transition-all shadow-[4px_4px_0px_#1c1208] text-lg">
                      Enter Your Lab 🚀
                    </Link>
                  </div>
                </SignedIn>
              </div>
            </div>
          </motion.div>
        </section>

        {/* The Long-Term Bet Section */}
        <section className="py-20">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            className="flex flex-col md:flex-row gap-12 items-center"
          >
            <div className="md:w-1/2 relative">
              <div className="absolute inset-0 bg-[#e8a030] rounded-3xl transform -rotate-3" />
              <div className="relative bg-white border-4 border-[#1c1208] rounded-3xl p-8 shadow-[8px_8px_0px_#1c1208]">
                <div className="text-4xl mb-4">🎓 ➡️ 🚀</div>
                <h2 className="font-brand text-5xl mb-6 leading-tight">Stop watching.<br />Start doing.</h2>
                <div className="font-body text-xl text-[#6b5a47] font-bold">
                  Passive consumption is broken. The future of learning is interactive, agentic, and built just for you.
                </div>
              </div>
            </div>

            <div className="md:w-1/2 space-y-4 text-left">
              {[
                { title: "1. The Internet", desc: "Infinite information, but you just passively read and watch.", icon: "🌐", bg: "bg-blue-100" },
                { title: "2. Standard AI", desc: "A chatbot that just hands you the answers.", icon: "🤖", bg: "bg-purple-100" },
                { title: "3. Studi (Agentic)", desc: "Builds live labs, graphs, and simulations. Guides you to the answer.", icon: "✨", bg: "bg-[#e5f4f1] border-[#3a9e8a]" }
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 50 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className={`flex gap-4 items-center p-4 rounded-2xl border-4 ${i === 2 ? 'border-[#3a9e8a] shadow-[4px_4px_0px_#3a9e8a]' : 'border-[#1c1208] shadow-[4px_4px_0px_#1c1208]'} ${item.bg}`}
                >
                  <div className="text-3xl bg-white p-3 rounded-xl border-2 border-[#1c1208] shadow-[2px_2px_0px_#1c1208] shrink-0">{item.icon}</div>
                  <div>
                    <h3 className="font-bold text-xl text-[#1c1208]">{item.title}</h3>
                    <p className="text-md text-[#6b5a47] font-body">{item.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Core Philosophies */}
        <section className="py-20 text-center">
          <motion.h2
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="font-brand text-5xl mb-16"
          >
            Not another flashcard app.
          </motion.h2>

          <div className="grid md:grid-cols-2 gap-8 text-left">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-[#f0ebf8] border-4 border-[#1c1208] rounded-3xl p-8 shadow-[8px_8px_0px_#1c1208]"
            >
              <div className="text-[#9b6dd4] text-5xl mb-6">🎯</div>
              <h3 className="font-bold text-3xl mb-4 leading-tight">Discover, Don&apos;t Memorize</h3>
              <p className="font-body text-[#6b5a47] text-xl leading-relaxed">
                We don&apos;t hand you the formula. We give you a problem and guide you to <strong>invent the formula yourself.</strong> True understanding over rote memorization.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ delay: 0.2 }}
              className="bg-[#e5f4f1] border-4 border-[#1c1208] rounded-3xl p-8 shadow-[8px_8px_0px_#1c1208]"
            >
              <div className="text-[#3a9e8a] text-5xl mb-6">⚡</div>
              <h3 className="font-bold text-3xl mb-4 leading-tight">Instant Micro-Feedback</h3>
              <p className="font-body text-[#6b5a47] text-xl leading-relaxed">
                No waiting for grades. <strong>Real-time, personalized course-correction</strong> as you work through problems, adapting instantly to your thought process.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Sparks Showcase Section */}
        <section className="py-20">
          <div className="text-center mb-12">
            <h2 className="font-brand text-5xl mb-6">Enter the Sparks ✨</h2>
            <p className="text-xl text-[#6b5a47] max-w-2xl mx-auto">
              Text and voice aren&apos;t always enough. Sparks are dynamic, agent-generated interactive elements created on the fly during your session.
            </p>
          </div>

          <SparksShowcase />
        </section>

        {/* Sandbox IDE Lab Section */}
        <section className="py-20">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-[#1c1208] rounded-[40px] p-8 md:p-16 text-[#fdf8f2] relative overflow-hidden"
          >
            {/* Background decorative blob */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#e05a3a]/20 blur-[100px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-[#3a9e8a]/20 blur-[100px] rounded-full pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row gap-12 items-center">
              <div className="md:w-1/2">
                <div className="flex flex-wrap gap-2 mb-6">
                  <div className="px-4 py-1.5 rounded-full border-2 border-[#e05a3a] text-[#e05a3a] font-bold text-sm bg-[#e05a3a]/10">
                    Live Now
                  </div>
                  <div className="px-4 py-1.5 rounded-full border-2 border-[#3a9e8a] text-[#3a9e8a] font-bold text-sm bg-[#3a9e8a]/10">
                    Text & Voice Agent
                  </div>
                </div>
                <h2 className="font-brand text-5xl mb-6 text-white">Interactive Labs</h2>
                <p className="font-body text-xl text-gray-300 mb-8 leading-relaxed">
                  For technical subjects, jump into a persistent, collaborative coding workspace. Speak or type to your agentic tutor as you build side-by-side.
                </p>
                <p className="font-body text-xl text-gray-300 mb-8 leading-relaxed italic border-l-4 border-[#e8a030] pl-4">
                  &quot;Don&apos;t just read about React... build a project with an expert reviewing your code in real-time.&quot;
                </p>

                <Link href="/chat" className="inline-flex items-center gap-2 font-bold px-8 py-4 rounded-xl border-2 border-white bg-[#e05a3a] text-white hover:bg-[#f06a48] hover:-translate-y-1 transition-all shadow-[6px_6px_0px_#f5ede0] text-lg mt-4">
                  Start Your First Lab <span className="text-2xl ml-2">🚀</span>
                </Link>
              </div>

              {/* Mockup visual */}
              <div className="md:w-1/2 w-full aspect-video bg-[#0d0a07] rounded-2xl border-4 border-gray-700 p-4 shadow-2xl relative group mt-8 md:mt-0">
                {/* Mock IDE Header */}
                <div className="flex gap-2 mb-4 shrink-0">
                  <div className="w-3.5 h-3.5 rounded-full bg-[#ff5f56]" />
                  <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e]" />
                  <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f]" />
                </div>
                {/* Mock code blocks animated */}
                <div className="space-y-3 font-mono text-sm opacity-80">
                  <motion.div className="h-4 w-3/4 bg-gray-700 rounded" animate={{ width: ["75%", "80%", "75%"] }} transition={{ duration: 4, repeat: Infinity }} />
                  <motion.div className="h-4 w-1/2 bg-[#3a9e8a] rounded" animate={{ width: ["50%", "55%", "50%"] }} transition={{ duration: 3, repeat: Infinity }} />
                  <motion.div className="h-4 w-5/6 bg-gray-700 rounded" animate={{ width: ["83%", "88%", "83%"] }} transition={{ duration: 5, repeat: Infinity }} />
                  <motion.div className="h-4 w-1/3 bg-[#e8a030] rounded" animate={{ width: ["33%", "38%", "33%"] }} transition={{ duration: 3.5, repeat: Infinity }} />
                  <motion.div className="h-4 w-2/3 bg-gray-700 rounded" />
                </div>

                {/* Agent Overlay */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5 }}
                  className="absolute -bottom-6 -left-6 bg-white rounded-2xl p-4 border-4 border-[#1c1208] shadow-[8px_8px_0px_#1c1208] max-w-xs z-10"
                >
                  <p className="font-bold text-[#e05a3a] text-sm mb-1">🎙️ Voice Agent</p>
                  <p className="text-sm font-body text-gray-800">&quot;Great job! Now, notice how passing props here updates the component? Try altering the color prop next.&quot;</p>
                </motion.div>

                {/* Media Placeholder */}
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 hidden group-hover:flex items-center justify-center bg-black/50 inset-0 rounded-xl rounded-t-none backdrop-blur-sm cursor-pointer transition-all">
                  <div className="text-white border-2 border-white px-4 py-2 rounded-full font-bold">
                    [ Placeholder for Demo Video ]
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

      </main>

      {/* Media placehoder at very bottom for the sake of completeness */}
      <div className="max-w-7xl mx-auto px-6 mb-20">
        <div className="w-full h-40 border-4 border-dashed border-[#e8ddd0] rounded-3xl flex items-center justify-center text-[#b0a090] font-bold text-lg bg-[#fff8f0]">
          [ Insert Final Walkthrough GIF Here later ]
        </div>
      </div>

      <footer className="border-t-4 border-[#1c1208] bg-white py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
          <div className="font-brand text-3xl">studi</div>
          <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">
            © 2026 Studi • Deeply Agentic
          </p>
        </div>
      </footer>
    </div>
  );
}
