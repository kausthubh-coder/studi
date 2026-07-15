"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BrainCircuit, Box, Calculator, LibraryBig } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNextSparkTabIndex } from "./spark-tab-navigation";

export type SparkDemo = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  content: React.ReactNode;
};

function getSparksData(reduceMotion: boolean): SparkDemo[] {
  return [
    {
      id: "scene",
      title: "Interactive Scene",
      description:
        "Break a concept by touching it. Physics simulations and visual models built for your exact question.",
      icon: <Box className="h-4.5 w-4.5" />,
      accent: "var(--accent2)",
      content: (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-accent2-dim">
          <motion.div
            animate={reduceMotion ? { rotate: 0 } : { rotate: 360 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 10, repeat: Infinity, ease: "linear" }
            }
            className="absolute h-24 w-24 rounded-2xl border-[3px] border-accent2 opacity-70"
          />
          <motion.div
            animate={reduceMotion ? { rotate: 0 } : { rotate: -360 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 15, repeat: Infinity, ease: "linear" }
            }
            className="absolute h-16 w-16 rounded-full border-[3px] border-accent2/60"
          />
          <motion.div
            animate={reduceMotion ? { scale: 1 } : { scale: [1, 1.2, 1] }}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity }
            }
            className="absolute h-4 w-4 rounded-full bg-accent2"
          />
          <p className="absolute bottom-4 z-10 rounded-full bg-bg-card/90 px-3.5 py-1.5 font-ui text-xs font-semibold text-fg shadow-sm backdrop-blur-sm">
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
      icon: <Calculator className="h-4.5 w-4.5" />,
      accent: "var(--accent4)",
      content: (
        <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl bg-accent4-dim p-5">
          <div className="relative flex h-2/3 w-full items-end border-b border-l border-accent4/40">
            <motion.svg
              className="h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <motion.path
                d="M0 100 Q 25 20, 50 50 T 100 0"
                fill="none"
                stroke="var(--accent4)"
                strokeWidth="2.5"
                initial={reduceMotion ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        duration: 2,
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut",
                      }
                }
              />
              <motion.path
                d="M0 50 Q 25 80, 50 40 T 100 60"
                fill="none"
                stroke="var(--accent4)"
                strokeOpacity="0.45"
                strokeWidth="1.5"
                strokeDasharray="4 2"
                initial={reduceMotion ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : {
                        duration: 3,
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut",
                        delay: 0.5,
                      }
                }
              />
            </motion.svg>
          </div>
          <p className="mt-4 rounded-lg border border-border-warm bg-bg-card px-3 py-1.5 font-mono text-xs text-fg">
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
      icon: <BrainCircuit className="h-4.5 w-4.5" />,
      accent: "var(--accent)",
      content: (
        <div className="flex h-full w-full flex-col justify-center rounded-2xl bg-accent-dim p-5">
          <p className="mb-4 text-center font-ui text-sm font-semibold text-fg">
            What is the average time complexity of QuickSort?
          </p>
          <div className="mx-auto w-full max-w-xs space-y-2">
            <div className="w-full rounded-xl border border-border-warm bg-bg-card p-2.5 text-center font-ui text-xs font-medium text-fg-muted">
              O(n)
            </div>
            <motion.div
              className="flex w-full items-center justify-between rounded-xl border border-accent2/50 bg-accent2-dim p-2.5 px-3 font-ui text-xs font-semibold text-fg"
              initial={reduceMotion ? false : { scale: 0.96 }}
              animate={{ scale: 1 }}
              transition={reduceMotion ? { duration: 0 } : undefined}
            >
              <span>O(n log n)</span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent2 text-[10px] font-bold text-fg">
                ✓
              </span>
            </motion.div>
            <div className="w-full rounded-xl border border-border-warm bg-bg-card p-2.5 text-center font-ui text-xs font-medium text-fg-muted">
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
      icon: <LibraryBig className="h-4.5 w-4.5" />,
      accent: "var(--accent3)",
      content: (
        <div className="relative flex h-full w-full items-center justify-center rounded-2xl bg-accent3-dim p-5">
          <motion.div
            className="relative h-full w-full max-w-sm"
            initial={{ rotateY: 0 }}
            animate={reduceMotion ? { rotateY: 0 } : { rotateY: 180 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    duration: 2,
                    repeat: Infinity,
                    repeatType: "reverse",
                    repeatDelay: 1.5,
                  }
            }
            style={{ transformStyle: "preserve-3d" }}
          >
            <div
              className="absolute inset-0 flex items-center justify-center rounded-2xl border border-border-warm bg-bg-card shadow-sm"
              style={{ backfaceVisibility: "hidden" }}
            >
              <div className="text-center">
                <p className="mb-2 font-ui text-[10px] font-bold uppercase tracking-[0.18em] text-fg-muted">
                  Biology
                </p>
                <h3 className="font-brand text-lg text-fg">Mitochondria</h3>
              </div>
            </div>
            <div
              className="absolute inset-0 flex items-center justify-center rounded-2xl border border-border-warm bg-bg-card shadow-sm"
              style={{
                transform: "rotateY(180deg)",
                backfaceVisibility: "hidden",
              }}
            >
              <p className="px-6 text-center font-body text-sm leading-relaxed text-fg-muted">
                The powerhouse of the cell — produces ATP through cellular
                respiration.
              </p>
            </div>
          </motion.div>
        </div>
      ),
    },
  ];
}

const ROTATE_INTERVAL_MS = 4_500;
const subscribeToHydration = () => () => {};

export function SparksShowcase() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hasUserSelected, setHasUserSelected] = useState(false);
  const [isPointerInside, setIsPointerInside] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const prefersReducedMotion = Boolean(useReducedMotion());
  const hasHydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const reduceMotion = hasHydrated && prefersReducedMotion;
  const instanceId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const sparks = getSparksData(reduceMotion);
  const panelId = `${instanceId}-spark-showcase-panel`;

  useEffect(() => {
    if (hasUserSelected || isPointerInside || isFocusWithin || reduceMotion) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentIndex((previous) => (previous + 1) % sparks.length);
    }, ROTATE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [
    hasUserSelected,
    isFocusWithin,
    isPointerInside,
    reduceMotion,
    sparks.length,
  ]);

  const activeSpark = sparks[currentIndex];

  function tabId(sparkId: string) {
    return `${instanceId}-spark-tab-${sparkId}`;
  }

  function selectSpark(index: number, moveFocus = false) {
    setHasUserSelected(true);
    setCurrentIndex(index);
    if (moveFocus) tabRefs.current[index]?.focus();
  }

  return (
    <div
      data-testid="sparks-showcase"
      className="mx-auto flex min-h-[440px] w-full max-w-5xl flex-col items-stretch gap-5 md:flex-row"
      onPointerEnter={() => setIsPointerInside(true)}
      onPointerLeave={() => setIsPointerInside(false)}
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFocusWithin(false);
        }
      }}
    >
      <div className="w-full shrink-0 md:w-[230px]">
        <p className="mb-2 text-left text-xs font-bold text-fg-muted md:hidden">
          Swipe to see every Spark type →
        </p>
        <div
          className="flex w-full snap-x snap-mandatory flex-row gap-2 overflow-x-auto pb-3 md:flex-col md:overflow-visible md:pb-0"
          role="tablist"
          aria-label="Spark types"
        >
          {sparks.map((spark, index) => {
            const isActive = index === currentIndex;
            return (
              <button
                key={spark.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                id={tabId(spark.id)}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectSpark(index)}
                onKeyDown={(event) => {
                  const navigationKey =
                    event.key === "ArrowDown"
                      ? "ArrowRight"
                      : event.key === "ArrowUp"
                        ? "ArrowLeft"
                        : event.key;
                  const nextIndex = getNextSparkTabIndex(
                    index,
                    navigationKey,
                    sparks.length,
                  );
                  if (
                    nextIndex === index &&
                    !["Home", "End"].includes(navigationKey)
                  ) {
                    return;
                  }
                  event.preventDefault();
                  selectSpark(nextIndex, true);
                }}
                className={cn(
                  "relative min-w-[180px] shrink-0 snap-start rounded-2xl border-2 p-3.5 text-left transition-all duration-300 ease-out md:min-w-0 md:shrink",
                  isActive
                    ? "border-fg bg-white shadow-[4px_4px_0px_var(--fg)] md:-translate-y-0.5"
                    : "border-transparent bg-bg-alt/70 hover:border-fg/30 hover:bg-bg-elevated",
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors",
                      isActive
                        ? "border-fg text-fg"
                        : "border-fg/30 bg-white text-fg-muted",
                    )}
                    style={
                      isActive ? { backgroundColor: spark.accent } : undefined
                    }
                  >
                    {spark.icon}
                  </span>
                  <span
                    className={cn(
                      "font-ui text-sm font-bold leading-tight",
                      isActive ? "text-fg" : "text-fg-muted",
                    )}
                  >
                    {spark.title}
                  </span>
                </div>
                {isActive && (
                  <motion.p
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    transition={reduceMotion ? { duration: 0 } : undefined}
                    className="mt-2.5 hidden text-xs leading-snug text-fg-muted md:block"
                  >
                    {spark.description}
                  </motion.p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(activeSpark.id)}
        tabIndex={0}
        className="relative flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-3xl border-[3px] border-fg bg-white shadow-[8px_8px_0px_var(--fg)]"
      >
        <div className="flex h-11 w-full shrink-0 items-center gap-2 border-b-[3px] border-fg bg-bg-elevated px-4">
          <span className="h-3 w-3 rounded-full border-2 border-fg bg-accent" />
          <span className="h-3 w-3 rounded-full border-2 border-fg bg-accent3" />
          <span className="h-3 w-3 rounded-full border-2 border-fg bg-accent2" />
          <span className="ml-3 flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full motion-reduce:animate-none"
              style={{ backgroundColor: activeSpark.accent }}
            />
            <span className="font-mono text-[11px] text-fg-muted">
              studi generated a {activeSpark.title.toLowerCase()} spark
            </span>
          </span>
        </div>

        <div className="relative flex-1 overflow-hidden p-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSpark.id}
              initial={reduceMotion ? false : { y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduceMotion ? undefined : { y: -14, opacity: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.3, ease: "easeOut" }
              }
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
