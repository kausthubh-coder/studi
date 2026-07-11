"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BrainCircuit, Box, Calculator, LibraryBig } from "lucide-react";
import { getNextSparkTabIndex } from "./spark-tab-navigation";

export type SparkDemo = {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    colorClass: string;
    content: React.ReactNode;
};

function getSparksData(reduceMotion: boolean): SparkDemo[] {
  return [
    {
        id: "scene",
        title: "Interactive Scene",
        description: "Break a concept by touching it. Physics simulations and visual models built for your exact question.",
        icon: <Box className="w-5 h-5" />,
        colorClass: "bg-teal-100 text-teal-900 border-teal-300",
        content: (
            <div className="w-full h-full flex items-center justify-center bg-teal-50 rounded-xl border border-teal-200 overflow-hidden relative">
                <motion.div
                    animate={reduceMotion ? { rotate: 0 } : { rotate: 360 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 10, repeat: Infinity, ease: "linear" }}
                    className="w-24 h-24 border-4 border-teal-500 rounded-lg absolute"
                />
                <motion.div
                    animate={reduceMotion ? { rotate: 0 } : { rotate: -360 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 15, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 border-4 border-teal-400 rounded-full absolute"
                />
                <motion.div
                    animate={reduceMotion ? { scale: 1 } : { scale: [1, 1.2, 1] }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity }}
                    className="w-5 h-5 bg-teal-600 rounded-full absolute"
                />
                <p className="font-bold text-teal-800 z-10 bg-white/90 px-3 py-1 rounded-full text-sm shadow-sm backdrop-blur-sm absolute bottom-4">Collision Physics</p>
            </div>
        ),
    },
    {
        id: "desmos",
        title: "Desmos Graph",
        description: "See the math move. Manipulate equations and watch the graph respond in real time.",
        icon: <Calculator className="w-5 h-5" />,
        colorClass: "bg-purple-100 text-purple-900 border-purple-300",
        content: (
            <div className="w-full h-full flex flex-col items-center justify-center bg-purple-50 rounded-xl border border-purple-200 p-4">
                <div className="w-full h-2/3 border-b-2 border-l-2 border-purple-300 relative flex items-end">
                    <motion.svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <motion.path
                            d="M0 100 Q 25 20, 50 50 T 100 0"
                            fill="none"
                            stroke="#a855f7"
                            strokeWidth="3"
                            initial={reduceMotion ? false : { pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={reduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                        />
                        <motion.path
                            d="M0 50 Q 25 80, 50 40 T 100 60"
                            fill="none"
                            stroke="#c084fc"
                            strokeWidth="1.5"
                            strokeDasharray="4 2"
                            initial={reduceMotion ? false : { pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={reduceMotion ? { duration: 0 } : { duration: 3, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 0.5 }}
                        />
                    </motion.svg>
                </div>
                <p className="text-sm font-mono text-purple-800 mt-4 bg-purple-200/50 px-3 py-1 rounded">y = sin(x) + cos(2x)</p>
            </div>
        ),
    },
    {
        id: "quiz",
        title: "Adaptive Quiz",
        description: "Prove you got it. Targeted questions that surface exactly where your understanding is shaky.",
        icon: <BrainCircuit className="w-5 h-5" />,
        colorClass: "bg-rose-100 text-rose-900 border-rose-300",
        content: (
            <div className="w-full h-full flex flex-col justify-center bg-rose-50 rounded-xl border border-rose-200 p-4">
                <p className="font-semibold text-rose-900 mb-4 text-center text-sm">What is the time complexity of QuickSort?</p>
                <div className="space-y-2 w-full">
                    <motion.div className="w-full bg-white border-2 border-rose-200 p-2 rounded-lg text-center text-xs font-medium text-rose-800" whileHover={{ scale: 1.02 }}>O(n)</motion.div>
                    <motion.div className="w-full bg-green-100 border-2 border-green-400 p-2 rounded-lg text-center text-xs font-bold text-green-800 flex justify-between items-center" initial={{ scale: 0.95 }} animate={{ scale: 1 }}>
                        <span>O(n log n)</span>
                        <span className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✓</span>
                    </motion.div>
                    <motion.div className="w-full bg-white border-2 border-rose-200 p-2 rounded-lg text-center text-xs font-medium text-rose-800" whileHover={{ scale: 1.02 }}>O(n²)</motion.div>
                </div>
            </div>
        ),
    },
    {
        id: "flashcard",
        title: "Flashcards",
        description: "Lock in what you've discovered. Spaced repetition built into your session — not a separate app.",
        icon: <LibraryBig className="w-5 h-5" />,
        colorClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
        content: (
            <div className="w-full h-full flex items-center justify-center relative p-4">
                <motion.div
                    className="w-full h-full max-w-sm absolute inset-4 bg-white border-2 border-emerald-300 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center p-6"
                    initial={{ rotateY: 0 }}
                    animate={reduceMotion ? { rotateY: 0 } : { rotateY: 180 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity, repeatType: "reverse", repeatDelay: 1.5 }}
                    style={{ transformStyle: "preserve-3d" }}
                >
                    <div className="absolute inset-0 flex items-center justify-center backface-hidden bg-emerald-50 rounded-2xl border-2 border-emerald-200">
                        <div>
                            <p className="text-xs text-emerald-500 font-bold uppercase tracking-wider mb-2">Biology</p>
                            <h3 className="text-lg font-bold text-emerald-900">Mitochondria</h3>
                        </div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-white rounded-2xl border-2 border-emerald-200" style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}>
                        <p className="text-base font-medium text-emerald-800 px-4">The powerhouse of the cell — produces ATP through cellular respiration.</p>
                    </div>
                </motion.div>
            </div>
        )
    }
  ];
}

const ROTATE_INTERVAL_MS = 4_500;

export function SparksShowcase() {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const reduceMotion = Boolean(useReducedMotion());
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const panelId = `spark-showcase-panel-${useId()}`;
    const sparks = getSparksData(reduceMotion);

    useEffect(() => {
        if (paused || reduceMotion) return;
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % sparks.length);
        }, ROTATE_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [paused, reduceMotion, sparks.length]);

    const activeSpark = sparks[currentIndex];

    function selectSpark(index: number, moveFocus = false) {
        setPaused(true);
        setCurrentIndex(index);
        if (moveFocus) tabRefs.current[index]?.focus();
    }

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row gap-6 items-stretch min-h-[480px] mb-8">
            {/* Left side: Navigation */}
            <div
                className="w-full md:w-[200px] lg:w-[220px] flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0 shrink-0"
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
                            id={`spark-tab-${spark.id}`}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            aria-controls={panelId}
                            tabIndex={isActive ? 0 : -1}
                            onFocus={() => setPaused(true)}
                            onClick={() => selectSpark(index)}
                            onKeyDown={(event) => {
                                const nextIndex = getNextSparkTabIndex(index, event.key, sparks.length);
                                if (nextIndex === index && !["Home", "End"].includes(event.key)) return;
                                event.preventDefault();
                                selectSpark(nextIndex, true);
                            }}
                            className={cn(
                                "relative text-left p-3 rounded-2xl border-2 transition-all duration-300 ease-out shrink-0 md:shrink",
                                isActive
                                    ? "bg-white shadow-[3px_3px_0px_rgba(0,0,0,0.12)] border-[#e05a3a] md:translate-x-1"
                                    : "bg-[#f5ede0] border-transparent hover:bg-[#fff8f0]"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <div className={cn(
                                    "p-1.5 rounded-lg transition-colors shrink-0",
                                    isActive ? spark.colorClass : "bg-gray-200 text-gray-600"
                                )}>
                                    {spark.icon}
                                </div>
                                <h4 className={cn(
                                    "font-bold font-brand text-sm leading-tight",
                                    isActive ? "text-[#1c1208]" : "text-[#5f4f40]"
                                )}>
                                    {spark.title}
                                </h4>
                            </div>
                            {isActive && (
                                <motion.p
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    className="text-xs mt-2 text-gray-600 leading-snug hidden md:block"
                                >
                                    {spark.description}
                                </motion.p>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Right side: Content */}
            <div
                id={panelId}
                role="tabpanel"
                aria-labelledby={`spark-tab-${activeSpark.id}`}
                tabIndex={0}
                className="flex-1 relative rounded-3xl border-4 border-[#1c1208] bg-white shadow-[8px_8px_0px_#1c1208] overflow-hidden flex flex-col p-2 min-h-[320px]"
            >
                <div className="w-full h-8 border-b-2 border-gray-100 flex items-center px-4 gap-2 mb-2 shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    <div className="ml-3 flex items-center gap-1.5">
                        <span className="animate-pulse motion-reduce:animate-none w-1.5 h-1.5 bg-[#e05a3a] rounded-full" />
                        <span className="font-mono text-xs text-[#6b5a47]">Studi is generating a Spark...</span>
                    </div>
                </div>

                <div className="flex-1 relative overflow-hidden bg-gray-50 rounded-xl">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeSpark.id}
                            initial={reduceMotion ? false : { y: 16, opacity: 0, filter: "blur(4px)" }}
                            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                            exit={reduceMotion ? undefined : { y: -16, opacity: 0, filter: "blur(4px)" }}
                            transition={reduceMotion ? { duration: 0 } : { duration: 0.35, ease: "easeOut" }}
                            className="absolute inset-0 p-2"
                        >
                            {activeSpark.content}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
