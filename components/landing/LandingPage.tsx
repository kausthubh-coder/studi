"use client";

import Link from "next/link";
import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";
import { motion } from "framer-motion";
import { SparksShowcase } from "./SparksShowcase";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#fdf8f2] text-[#1c1208] selection:bg-[#e05a3a]/20 font-ui overflow-hidden pb-12">
      {/* Decorative Grid Background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03] z-0"
        style={{
          backgroundImage: "radial-gradient(#1c1208 1.5px, transparent 1.5px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Navigation */}
      <header className="fixed top-0 inset-x-0 z-50 p-3 md:p-4 pt-4 md:pt-6 pointer-events-none">
        <div className="max-w-7xl mx-auto flex justify-between items-center pointer-events-auto bg-[#fff8f0]/90 backdrop-blur-md px-4 md:px-6 py-2 md:py-3 rounded-full border-2 border-[#1c1208] shadow-[4px_4px_0px_#1c1208]">
          <span className="font-brand text-xl md:text-2xl tracking-tight flex items-center gap-1">
            studi
            <span className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-[#e05a3a] inline-block mb-1" />
          </span>

          <SignedOut>
            <SignInButton mode="modal" forceRedirectUrl="/chat">
              <button type="button" className="font-bold text-sm md:text-base px-4 md:px-5 py-1.5 md:py-2 rounded-full border-2 border-[#1c1208] bg-white hover:bg-[#f5ede0] transition-colors shadow-[2px_2px_0px_#1c1208] active:translate-y-0.5 active:shadow-[0px_0px_0px_#1c1208]">
                Sign in
              </button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <Link href="/chat" className="font-bold text-sm md:text-base px-4 md:px-5 py-1.5 md:py-2 rounded-full border-2 border-[#1c1208] bg-[#e05a3a] text-white hover:bg-[#f06a48] transition-colors shadow-[2px_2px_0px_#1c1208] active:translate-y-0.5 active:shadow-none">
              Open chat
            </Link>
          </SignedIn>
        </div>
      </header>

      <main className="relative z-10 pt-24 md:pt-32 px-4 md:px-6 max-w-7xl mx-auto space-y-24 md:space-y-32">
        {/* HERO */}
        <section className="flex flex-col items-center justify-center text-center relative py-12 md:py-20 mt-4 md:mt-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-4xl mx-auto z-10 w-full"
          >
            <h1 className="font-brand text-5xl sm:text-6xl md:text-8xl md:leading-[1.1] tracking-tight text-[#1c1208] mb-6 md:mb-8 drop-shadow-sm px-2">
              Your AI tutor that teaches by doing — not just explaining.
            </h1>
            <p className="text-lg md:text-2xl text-[#6b5a47] font-body max-w-3xl mx-auto mb-10 md:mb-12 leading-relaxed px-2">
              Ask a question. Get an explanation, a live graph, a simulation, a coding challenge — whatever it takes to actually click. Studi is the tutor that doesn't stop until you get it.
            </p>

            {/* Waitlist CTA Above the Fold */}
            <div className="w-full max-w-sm mx-auto relative group mb-8">
              <div className="absolute inset-0 bg-[#e05a3a] rounded-3xl transform rotate-2 transition-transform group-hover:rotate-4" />
              <div className="relative bg-white rounded-3xl border-4 border-[#1c1208] overflow-hidden shadow-[6px_6px_0px_#1c1208] md:shadow-[8px_8px_0px_#1c1208] p-4">
                <SignedOut>
                  <div className="px-2 pt-2 pb-3 text-center">
                    <p className="font-brand text-2xl text-[#1c1208] mb-2">
                      Join the waitlist
                    </p>
                    <p className="font-body text-[#6b5a47] mb-5">
                      Be first when Studi launches.
                    </p>
                    <Link
                      href="/waitlist?originPage=%2F"
                      className="inline-block w-full font-bold px-6 py-4 rounded-xl border-2 border-[#1c1208] bg-[#e05a3a] text-white hover:bg-[#f06a48] transition-all shadow-[4px_4px_0px_#1c1208] text-lg"
                    >
                      Open waitlist form
                    </Link>
                    <p className="text-sm font-bold text-[#6b5a47] mt-3 italic text-center w-full">
                      "Built for students who are tired of rereading the same paragraph."
                    </p>
                  </div>
                </SignedOut>
                <SignedIn>
                  <div className="p-4 py-8 text-center bg-white">
                    <p className="font-bold text-xl mb-6">You're signed in!</p>
                    <Link href="/chat" className="inline-block w-full font-bold px-6 py-4 rounded-xl border-2 border-[#1c1208] bg-[#e05a3a] text-white hover:bg-[#f06a48] transition-all shadow-[4px_4px_0px_#1c1208] text-lg">
                      Enter Your Lab 🚀
                    </Link>
                  </div>
                </SignedIn>
              </div>
            </div>

            {/* AHA MOMENT 1: Looping Demo GIF / Video */}
            <div className="mt-16 md:mt-20 relative mx-auto w-full max-w-5xl">
              <div className="absolute inset-0 bg-[#3a9e8a] rounded-[2rem] md:rounded-[2.5rem] transform -rotate-1 hidden sm:block" />
              <div className="relative bg-[#fff8f0] rounded-[1.5rem] md:rounded-[2.5rem] border-4 border-[#1c1208] shadow-[8px_8px_0px_#1c1208] md:shadow-[12px_12px_0px_#1c1208] p-4 md:p-6 pt-14 md:pt-16 overflow-hidden flex flex-col items-center">
                {/* Fake Window Header */}
                <div className="absolute top-0 left-0 right-0 h-10 md:h-12 border-b-4 border-[#1c1208] bg-white flex items-center px-4 md:px-6 gap-2">
                  <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-[#ff5f56] border-2 border-[#1c1208]" />
                  <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-[#ffbd2e] border-2 border-[#1c1208]" />
                  <div className="w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-[#27c93f] border-2 border-[#1c1208]" />
                  <div className="ml-2 md:ml-4 font-mono text-xs md:text-sm font-bold text-[#6b5a47] truncate">Studi Session: Recursion</div>
                </div>

                {/* Fake Chat & Interactive Gen Content */}
                <div className="w-full max-w-3xl flex flex-col gap-4 md:gap-6 text-left my-2 md:my-4 md:px-4">
                  <div className="flex gap-2 md:gap-4 items-start">
                    <div className="bg-[#e4d5c7] shrink-0 p-2 md:p-3 rounded-xl rounded-tl-sm font-bold border-2 border-[#1c1208] text-sm md:text-base">You</div>
                    <div className="bg-white p-3 md:p-4 rounded-xl md:rounded-2xl rounded-tr-sm border-2 border-[#1c1208] shadow-[2px_2px_0px_#1c1208] font-bold text-base md:text-lg">
                      How does recursion actually work? It just looks like an infinite loop to me.
                    </div>
                  </div>

                  <div className="flex gap-2 md:gap-4 items-start self-end max-w-[95%] md:max-w-none">
                    <div className="bg-[#e05a3a] text-white p-3 md:p-4 rounded-xl md:rounded-2xl rounded-tr-sm md:rounded-tr-2xl md:rounded-tl-sm border-2 border-[#1c1208] shadow-[2px_2px_0px_#1c1208] text-base md:text-lg font-medium leading-relaxed max-w-2xl text-left order-last md:order-first">
                      It can feel like that! Let's build a mental model. Instead of an infinite loop, think of it as opening boxes. Each box has a smaller box inside, until you find the prize.<br /><br />
                      Let's look at a live example of calculating a factorial:
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        transition={{ delay: 1.5, duration: 0.5 }}
                        className="mt-3 md:mt-4 bg-[#1c1208] text-[#fdf8f2] p-3 md:p-4 rounded-xl border-2 border-[#1c1208] overflow-hidden overflow-x-auto"
                      >
                        <div className="font-mono text-xs md:text-sm space-y-1 min-w-[280px]">
                          <p className="text-[#3a9e8a]">def <span className="text-[#e8a030]">factorial</span>(n):</p>
                          <p className="pl-4">if n == 1:</p>
                          <p className="pl-8 text-[#e8a030]">return 1 <span className="text-gray-500"># The final prize!</span></p>
                          <p className="pl-4">return n * factorial(n - 1) <span className="text-gray-500 hidden sm:inline"># Opening the smaller box</span></p>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <button className="bg-white text-[#1c1208] px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold hover:bg-gray-200">Run Step-by-Step</button>
                        </div>
                      </motion.div>
                    </div>
                    <div className="bg-[#1c1208] text-white shrink-0 p-2 md:p-3 rounded-xl rounded-tl-sm md:rounded-tl-xl md:rounded-tr-sm font-bold border-2 border-[#1c1208] text-sm md:text-base order-first md:order-last">Studi</div>
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        </section>

        {/* SECTION 1 - Problem */}
        <section className="py-12 md:py-20 flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            className="max-w-4xl mx-auto"
          >
            <h2 className="font-brand text-3xl sm:text-4xl md:text-6xl text-[#1c1208] leading-tight md:leading-[1.1] tracking-tight">
              You've watched the video. You've reread the textbook. You asked ChatGPT and got a wall of text.<br /><br />
              You still don't get it.<br /><br />
              That's not a you problem. It's a format problem. Reading about something and understanding it are completely different things.
            </h2>
          </motion.div>
        </section>

        {/* SECTION 2 - The Shift */}
        <section className="py-12 md:py-24">
          <div className="max-w-4xl mx-auto text-center mb-12 md:mb-16">
            <h2 className="font-brand text-4xl sm:text-5xl md:text-7xl mb-6 md:mb-8 leading-tight">Studi teaches you the way humans actually learn — <span className="text-[#3a9e8a]">by doing.</span></h2>
            <p className="text-lg md:text-2xl font-body leading-relaxed text-[#6b5a47] px-4">
              Every session is a conversation. But when a concept needs more than words, Studi builds something — right there, in real time. A graph you can manipulate. A simulation you can run. A coding problem you have to solve yourself.<br /><br />
              Not an attachment. Not a link. Built for you, in the moment, as part of the explanation.
            </p>
          </div>

          {/* AHA MOMENT 2 - Spark Generating Placeholder */}
          <div className="w-full max-w-4xl mx-auto border-4 border-[#1c1208] rounded-[1.5rem] md:rounded-[2rem] bg-white shadow-[8px_8px_0px_#1c1208] md:shadow-[12px_12px_0px_#1c1208] overflow-hidden p-4 md:p-6 relative">
            <div className="flex flex-col md:flex-row gap-4 md:gap-6 items-start md:items-center">
              <div className="w-12 h-12 md:w-16 md:h-16 bg-[#3a9e8a] rounded-xl md:rounded-2xl border-4 border-[#1c1208] shrink-0 md:self-start md:mt-2"></div>
              <div className="flex-1 space-y-3 md:space-y-4 w-full">
                <div className="h-3 md:h-4 w-3/4 bg-gray-200 rounded-full"></div>
                <div className="h-3 md:h-4 w-1/2 bg-gray-200 rounded-full"></div>
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  whileInView={{ height: "auto", opacity: 1 }}
                  transition={{ duration: 0.8 }}
                  className="w-full aspect-[4/3] md:aspect-video bg-[#fdf8f2] border-4 border-[#3a9e8a] rounded-xl md:rounded-2xl mt-4 md:mt-6 relative overflow-hidden flex items-end"
                >
                  <div className="absolute top-2 left-2 md:top-4 md:left-4 bg-white border-2 border-[#1c1208] px-2 py-1 md:px-3 md:py-1 font-bold text-xs md:text-sm rounded-lg flex gap-2 items-center">
                    <span className="animate-pulse w-2 h-2 bg-[#e05a3a] rounded-full"></span>
                    Generating Spark
                  </div>
                  <svg className="w-full h-full opacity-50 mt-12 md:mt-16" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <path
                      d="M0 80 Q 25 20, 50 50 T 100 20"
                      fill="none"
                      stroke="#3a9e8a"
                      strokeWidth="2"
                    />
                  </svg>
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3 - Sparks */}
        <section className="py-12 md:py-24 text-center">
          <h2 className="font-brand text-4xl sm:text-5xl md:text-7xl mb-4 md:mb-8">Explanations that go beyond words.</h2>
          <SparksShowcase />
        </section>

        {/* SECTION 4 - Labs */}
        <section className="py-12 md:py-24">
          <div className="flex flex-col lg:flex-row gap-10 md:gap-16 items-center">
            <div className="lg:w-5/12 text-left">
              <h2 className="font-brand text-4xl sm:text-5xl md:text-6xl mb-6 md:mb-8 leading-tight">When understanding isn't enough — you need to build.</h2>
              <p className="text-lg md:text-xl font-body leading-relaxed text-[#6b5a47] mb-6 md:mb-8">
                Studi's Labs put you in a real coding environment, attached to your session. Your tutor gives you the problem. You write the code. Studi watches, guides when you're stuck, and tells you when you've got it.
              </p>
              <p className="text-lg md:text-xl font-body leading-relaxed text-[#6b5a47] font-bold border-l-4 border-[#e05a3a] pl-4 md:pl-6">
                It's the closest thing to pair programming with someone who has infinite patience and knows everything.
              </p>
            </div>

            <div className="lg:w-7/12 w-full">
              <div className="w-full aspect-square md:aspect-[4/3] bg-[#1c1208] rounded-2xl md:rounded-3xl border-4 border-[#1c1208] shadow-[8px_8px_0px_#e05a3a] md:shadow-[12px_12px_0px_#e05a3a] overflow-hidden flex flex-col">
                <div className="flex bg-[#2a1c10] border-b border-gray-700">
                  <div className="w-1/3 p-3 md:p-4 border-r border-gray-700 font-bold text-white flex items-center gap-2 text-xs md:text-sm truncate">
                    <div className="w-2 h-2 rounded-full bg-[#3a9e8a] shrink-0"></div> <span className="truncate">Studi Tutor</span>
                  </div>
                  <div className="w-2/3 p-3 md:p-4 font-mono text-xs md:text-sm text-gray-300 truncate">Sandbox: React Component</div>
                </div>
                <div className="flex-1 flex flex-col sm:flex-row">
                  <div className="w-full sm:w-1/3 h-1/3 sm:h-full p-3 md:p-4 bg-[#2a1c10] border-b sm:border-b-0 sm:border-r border-gray-700 flex flex-col justify-end text-xs md:text-sm overflow-y-auto">
                    <div className="bg-[#3a9e8a]/20 border border-[#3a9e8a] text-[#3a9e8a] p-2 md:p-3 rounded-xl">
                      "Almost! You've got the state set up, but remember to actually attach the onClick handler to the button."
                    </div>
                  </div>
                  <div className="w-full sm:w-2/3 h-2/3 sm:h-full bg-[#1c1208] p-3 md:p-4 font-mono text-[11px] sm:text-xs md:text-sm overflow-x-auto">
                    <p className="text-[#3a9e8a] whitespace-nowrap">export default function <span className="text-[#e8a030]">Counter</span>() {'{'}</p>
                    <p className="pl-4 text-gray-300 whitespace-nowrap">const [count, setCount] = useState(0);</p>
                    <br />
                    <p className="pl-4 text-[#e05a3a] whitespace-nowrap">return <span className="text-gray-300">(</span></p>
                    <p className="pl-8 text-cyan-300 whitespace-nowrap">&lt;button <span className="text-yellow-200">onClick</span>=<span className="text-[#e8a030]">...</span>&gt;</p>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ repeat: Infinity, duration: 0.8, repeatType: "reverse" }}
                      className="pl-12 w-1.5 md:w-2 h-3 md:h-4 bg-white inline-block relative top-0.5 md:top-1"
                    ></motion.div>
                    <p className="pl-8 text-cyan-300 whitespace-nowrap">&lt;/button&gt;</p>
                    <p className="pl-4 text-gray-300 whitespace-nowrap">)</p>
                    <p className="text-[#3a9e8a] whitespace-nowrap">{'}'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5 - Plans */}
        <section className="py-12 md:py-24">
          <div className="flex flex-col lg:flex-row-reverse gap-12 md:gap-16 items-center">
            <div className="lg:w-1/2 text-left">
              <h2 className="font-brand text-4xl sm:text-5xl md:text-6xl mb-6 md:mb-8 leading-tight">Tell it what you want to learn. It builds the roadmap.</h2>
              <p className="text-lg md:text-xl font-body leading-relaxed text-[#6b5a47]">
                Going into an exam? Learning Python from scratch? Trying to finally understand linear algebra?<br /><br />
                Tell Studi. It drafts a milestone plan, tracks where you are, and adjusts as you go. You always know what's next.
              </p>
            </div>

            <div className="lg:w-1/2 w-full px-4 md:px-0">
              <div className="bg-white rounded-2xl md:rounded-3xl border-4 border-[#1c1208] shadow-[8px_8px_0px_#1c1208] md:shadow-[12px_12px_0px_#1c1208] p-6 md:p-8 max-w-md mx-auto transform -rotate-2">
                <div className="font-brand text-xl md:text-2xl font-bold mb-6 md:mb-8 border-b-2 border-dashed border-gray-300 pb-4">
                  Understand Calculus for Physics
                </div>

                <div className="space-y-4 md:space-y-6">
                  <div className="flex gap-3 md:gap-4 items-start opacity-50">
                    <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-[#1c1208] text-white flex items-center justify-center font-bold text-xs md:text-sm shrink-0 border-2 border-[#1c1208]">✓</div>
                    <div>
                      <h4 className="font-bold text-base md:text-lg line-through">Limits and Infinity</h4>
                      <p className="text-xs md:text-sm">Completed yesterday</p>
                    </div>
                  </div>

                  <div className="flex gap-3 md:gap-4 items-start">
                    <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-[#e8a030] text-[#1c1208] flex items-center justify-center font-bold text-lg shrink-0 border-2 border-[#1c1208]"></div>
                    <div>
                      <div className="inline-block px-1.5 md:px-2 py-0.5 rounded text-[9px] md:text-[10px] font-bold tracking-wider bg-[#e8a030]/20 text-[#e8a030] border border-[#e8a030] uppercase mb-1">In Progress</div>
                      <h4 className="font-bold text-lg md:text-xl">The Derivative</h4>
                      <p className="text-sm md:text-base text-gray-600 font-medium">Visualizing rates of change</p>
                    </div>
                  </div>

                  <div className="flex gap-3 md:gap-4 items-start opacity-50">
                    <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-white text-[#1c1208] flex items-center justify-center font-bold text-sm shrink-0 border-2 border-gray-300"></div>
                    <div>
                      <h4 className="font-bold text-base md:text-lg">Integrals</h4>
                      <p className="text-xs md:text-sm text-gray-400">Locked</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 6 - ChatGPT contrast */}
        <section className="py-12 md:py-24 text-center">
          <div className="max-w-4xl mx-auto">
            <h2 className="font-brand text-4xl sm:text-5xl md:text-7xl mb-8 md:mb-12">ChatGPT explains. Studi teaches.</h2>
            <div className="text-xl md:text-3xl font-body leading-relaxed font-bold text-[#1c1208]">
              ChatGPT gives you the answer. Studi makes sure you actually get it — by generating something interactive, giving you a problem to solve, or adjusting its entire approach until it clicks.<br /><br />
              <span className="text-[#e05a3a]">There's a difference between being told something and understanding it. Studi is built for the second one.</span>
            </div>
          </div>
        </section>

        {/* FINAL CTA SECTION */}
        <section className="py-20 md:py-32 flex flex-col items-center justify-center text-center relative">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto w-full"
          >
            <div className="text-[#e8a030] text-5xl md:text-7xl mb-6 md:mb-8">🚀</div>
            <h2 className="font-brand text-5xl sm:text-6xl md:text-8xl mb-6 md:mb-8 tracking-tight">Stop rereading.<br />Start understanding.</h2>
            <p className="text-lg md:text-2xl font-body text-[#6b5a47] mb-8 md:mb-12">
              Join the waitlist. Be first when Studi launches.
            </p>

            <div className="w-full max-w-md mx-auto relative group">
              <div className="absolute inset-0 bg-[#3a9e8a] rounded-3xl transform -rotate-2 transition-transform group-hover:-rotate-4" />
              <div className="relative bg-white rounded-3xl border-4 border-[#1c1208] overflow-hidden shadow-[6px_6px_0px_#1c1208] md:shadow-[8px_8px_0px_#1c1208] p-4 text-left">
                <SignedOut>
                  <div className="flex flex-col items-center p-2">
                    <Link
                      href="/waitlist?originPage=%2F"
                      className="inline-block w-full text-center font-bold px-6 py-4 rounded-xl border-2 border-[#1c1208] bg-[#3a9e8a] text-white shadow-[4px_4px_0px_#1c1208] text-base md:text-lg hover:bg-[#2c7a6a] hover:-translate-y-1 transition-all"
                    >
                      Join the waitlist
                    </Link>
                  </div>
                  <div className="text-center mt-6 border-t-2 border-dashed border-gray-200 pt-4">
                    <p className="font-bold text-[#6b5a47]">No spam. Just Studi.</p>
                  </div>
                </SignedOut>
                <SignedIn>
                  <div className="p-6 md:p-8 text-center">
                    <h3 className="font-bold text-xl md:text-2xl mb-4 text-[#3a9e8a]">You're already in!</h3>
                    <Link href="/chat" className="inline-block w-full font-bold px-6 py-4 rounded-xl border-2 border-[#1c1208] bg-[#3a9e8a] text-white shadow-[4px_4px_0px_#1c1208] text-base md:text-lg hover:bg-[#2c7a6a] hover:-translate-y-1 transition-all">
                      Go to Dashboard
                    </Link>
                  </div>
                </SignedIn>
              </div>
            </div>
          </motion.div>
        </section>

      </main>

      <footer className="border-t-4 border-[#1c1208] bg-white py-8 md:py-12 px-6 mt-16 relative z-10">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center gap-2 md:gap-4">
          <div className="font-brand text-3xl md:text-4xl">studi</div>
          <p className="font-bold text-gray-500 uppercase tracking-widest text-xs md:text-sm">
            © 2026 Studi
          </p>
        </div>
      </footer>
    </div>
  );
}
