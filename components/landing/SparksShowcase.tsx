"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BrainCircuit, Box, Calculator, LibraryBig } from "lucide-react";
import { getNextSparkTabIndex } from "./spark-tab-navigation";

export type SparkDemo = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  content: React.ReactNode;
};

const SPARKS_DATA: SparkDemo[] = [
  {
    id: "scene",
    title: "Interactive Scene",
    description:
      "Break a concept by touching it. Physics simulations and visual models built for your exact question.",
    icon: <Box className="w-4.5 h-4.5" />,
    accent: "var(--accent2)",
    content: (
      <div className="w-full h-full flex items-center justify-center bg-accent2-dim rounded-2xl overflow-hidden relative">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="w-24 h-24 border-[3px] border-accent2 rounded-2xl absolute opacity-70"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 border-[3px] border-accent2/60 rounded-full absolute"
        />
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-4 h-4 bg-accent2 rounded-full absolute"
        />
        <p className="font-ui font-semibold text-fg z-10 bg-bg-card/90 px-3.5 py-1.5 rounded-full text-xs shadow-sm backdrop-blur-sm absolute bottom-4">
          Collision Physics
        </p>
      </div>
    ),
  },
  {
    id: "graph",
    title: "Live Graph",
    description:
      "See the math move. Manipulate equations and watch the graph respond in real time.",
    icon: <Calculator className="w-4.5 h-4.5" />,
    accent: "var(--accent4)",
    content: (
      <div className="w-full h-full flex flex-col items-center justify-center bg-accent4-dim rounded-2xl p-5">
        <div className="w-full h-2/3 border-b border-l border-accent4/40 relative flex items-end">
          <motion.svg
            className="w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M0 100 Q 25 20, 50 50 T 100 0"
              fill="none"
              stroke="var(--accent4)"
              strokeWidth="2.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
              }}
            />
            <motion.path
              d="M0 50 Q 25 80, 50 40 T 100 60"
              fill="none"
              stroke="var(--accent4)"
              strokeOpacity="0.45"
              strokeWidth="1.5"
              strokeDasharray="4 2"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{
                duration: 3,
                repeat: Infinity,
                repeatType: "reverse",
                ease: "easeInOut",
                delay: 0.5,
              }}
            />
          </motion.svg>
        </div>
        <p className="text-xs font-mono text-fg mt-4 bg-bg-card px-3 py-1.5 rounded-lg border border-border-warm">
          y = sin(x) + cos(2x)
        </p>
      </div>
    ),
  },
  {
    id: "quiz",
    title: "Adaptive Quiz",
    description:
      "Prove you got it. Targeted questions that surface exactly where your understanding is shaky.",
    icon: <BrainCircuit className="w-4.5 h-4.5" />,
    accent: "var(--accent)",
    content: (
      <div className="w-full h-full flex flex-col justify-center bg-accent-dim rounded-2xl p-5">
        <p className="font-ui font-semibold text-fg mb-4 text-center text-sm">
          What is the average time complexity of QuickSort?
        </p>
        <div className="space-y-2 w-full max-w-xs mx-auto">
          <div className="w-full bg-bg-card border border-border-warm p-2.5 rounded-xl text-center text-xs font-ui font-medium text-fg-muted">
            O(n)
          </div>
          <motion.div
            className="w-full bg-accent2-dim border border-accent2/50 p-2.5 rounded-xl text-xs font-ui font-semibold text-fg flex justify-between items-center px-3"
            initial={{ scale: 0.96 }}
            animate={{ scale: 1 }}
          >
            <span>O(n log n)</span>
            <span className="bg-accent2 text-fg rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
              ✓
            </span>
          </motion.div>
          <div className="w-full bg-bg-card border border-border-warm p-2.5 rounded-xl text-center text-xs font-ui font-medium text-fg-muted">
            O(n²)
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "flashcard",
    title: "Flashcards",
    description:
      "Lock in what you've discovered. Spaced repetition built into your session — not a separate app.",
    icon: <LibraryBig className="w-4.5 h-4.5" />,
    accent: "var(--accent3)",
    content: (
      <div className="w-full h-full flex items-center justify-center relative p-5 bg-accent3-dim rounded-2xl">
        <motion.div
          className="w-full h-full max-w-sm relative"
          initial={{ rotateY: 0 }}
          animate={{ rotateY: 180 }}
          transition={{
            duration: 2,
            repeat: Infinity,
            repeatType: "reverse",
            repeatDelay: 1.5,
          }}
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="absolute inset-0 flex items-center justify-center bg-bg-card rounded-2xl border border-border-warm shadow-sm"
            style={{ backfaceVisibility: "hidden" }}
          >
            <div className="text-center">
              <p className="text-[10px] text-fg-muted font-ui font-bold uppercase tracking-[0.18em] mb-2">
                Biology
              </p>
              <h3 className="text-lg font-brand text-fg">Mitochondria</h3>
            </div>
          </div>
          <div
            className="absolute inset-0 flex items-center justify-center bg-bg-card rounded-2xl border border-border-warm shadow-sm"
            style={{
              transform: "rotateY(180deg)",
              backfaceVisibility: "hidden",
            }}
          >
            <p className="text-sm font-body text-fg-muted px-6 text-center leading-relaxed">
              The powerhouse of the cell — produces ATP through cellular
              respiration.
            </p>
          </div>
        </motion.div>
      </div>
    ),
  },
];

const ROTATE_INTERVAL_MS = 4500;

export function SparksShowcase() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Auto-rotate until the user picks a tab themselves.
  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % SPARKS_DATA.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused, reduceMotion]);

  const activeSpark = SPARKS_DATA[currentIndex];

  function selectSpark(index: number, moveFocus = false) {
    setPaused(true);
    setCurrentIndex(index);
    if (moveFocus) {
      requestAnimationFrame(() => tabRefs.current[index]?.focus());
    }
  }

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row gap-5 items-stretch min-h-[440px]">
      {/* Tabs */}
      <div className="w-full md:w-[230px] shrink-0">
        <p className="mb-2 text-left text-xs font-bold text-fg-muted md:hidden">
          Swipe to see every Spark type →
        </p>
        <div
          className="w-full flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-3 md:pb-0 snap-x snap-mandatory"
          role="tablist"
          aria-label="Spark types"
          onFocusCapture={() => setPaused(true)}
          onPointerEnter={() => setPaused(true)}
        >
          {SPARKS_DATA.map((spark, index) => {
            const isActive = index === currentIndex;
            return (
              <button
                key={spark.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                id={`spark-tab-${spark.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="spark-showcase-panel"
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectSpark(index)}
                onKeyDown={(event) => {
                  const nextIndex = getNextSparkTabIndex(
                    index,
                    event.key,
                    SPARKS_DATA.length,
                  );
                  if (
                    nextIndex === index &&
                    !["Home", "End"].includes(event.key)
                  )
                    return;
                  event.preventDefault();
                  selectSpark(nextIndex, true);
                }}
                className={cn(
                  "relative min-w-[180px] snap-start text-left p-3.5 rounded-2xl border-2 transition-all duration-300 ease-out shrink-0 md:min-w-0 md:shrink",
                  isActive
                    ? "bg-white border-fg shadow-[4px_4px_0px_var(--fg)] md:-translate-y-0.5"
                    : "bg-bg-alt/70 border-transparent hover:bg-bg-elevated hover:border-fg/30",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 border-2",
                      isActive
                        ? "text-fg border-fg"
                        : "bg-white text-fg-muted border-fg/30",
                    )}
                    style={
                      isActive ? { backgroundColor: spark.accent } : undefined
                    }
                  >
                    {spark.icon}
                  </span>
                  <span
                    className={cn(
                      "font-ui font-bold text-sm leading-tight",
                      isActive ? "text-fg" : "text-fg-muted",
                    )}
                  >
                    {spark.title}
                  </span>
                </div>
                {isActive && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="text-xs mt-2.5 text-fg-muted leading-snug hidden md:block"
                  >
                    {spark.description}
                  </motion.p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview */}
      <div
        id="spark-showcase-panel"
        role="tabpanel"
        aria-labelledby={`spark-tab-${activeSpark.id}`}
        tabIndex={0}
        className="flex-1 relative rounded-3xl border-[3px] border-fg bg-white shadow-[8px_8px_0px_var(--fg)] overflow-hidden flex flex-col min-h-[320px]"
      >
        <div className="w-full h-11 border-b-[3px] border-fg bg-bg-elevated flex items-center px-4 gap-2 shrink-0">
          <span className="w-3 h-3 rounded-full bg-accent border-2 border-fg" />
          <span className="w-3 h-3 rounded-full bg-accent3 border-2 border-fg" />
          <span className="w-3 h-3 rounded-full bg-accent2 border-2 border-fg" />
          <span className="ml-3 flex items-center gap-1.5">
            <span
              className="animate-pulse w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: activeSpark.accent }}
            />
            <span className="font-mono text-[11px] text-fg-muted">
              studi generated a {activeSpark.title.toLowerCase()} spark
            </span>
          </span>
        </div>

        <div className="flex-1 relative overflow-hidden p-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSpark.id}
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -14, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute inset-3"
            >
              {activeSpark.content}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
