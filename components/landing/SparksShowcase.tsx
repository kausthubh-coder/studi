"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Code2, BrainCircuit, Box, Calculator, LibraryBig } from "lucide-react";

export type SparkDemo = {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    colorClass: string;
    content: React.ReactNode;
};

const SPARKS_DATA: SparkDemo[] = [
    {
        id: "scene",
        title: "Interactive Scene",
        description: "Physics simulations and visual models built on the fly.",
        icon: <Box className="w-6 h-6" />,
        colorClass: "bg-teal-100 text-teal-900 border-teal-300",
        content: (
            <div className="w-full h-full flex items-center justify-center bg-teal-50 rounded-xl border border-teal-200 overflow-hidden relative">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="w-24 h-24 border-4 border-teal-500 rounded-lg absolute"
                />
                <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 border-4 border-teal-400 rounded-full absolute"
                />
                <p className="font-bold text-teal-800 z-10 bg-white/80 px-3 py-1 rounded-full text-sm shadow-sm backdrop-blur-sm">Collision Physics</p>
            </div>
        ),
    },
    {
        id: "desmos",
        title: "Desmos Graphing",
        description: "Real-time math visualization seamlessly integrated.",
        icon: <Calculator className="w-6 h-6" />,
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
                            initial={{ pathLength: 0 }}
                            animate={{ pathLength: 1 }}
                            transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                        />
                    </motion.svg>
                </div>
                <p className="text-sm font-mono text-purple-800 mt-4 bg-purple-200/50 px-3 py-1 rounded">y = sin(x) + cos(2x)</p>
            </div>
        ),
    },
    {
        id: "playground",
        title: "Code Playground",
        description: "Write and execute Python interactively with the tutor.",
        icon: <Code2 className="w-6 h-6" />,
        colorClass: "bg-amber-100 text-amber-900 border-amber-300",
        content: (
            <div className="w-full h-full bg-[#1e1e1e] rounded-xl border border-amber-900/50 p-4 font-mono text-sm shadow-inner flex flex-col text-left">
                <div className="flex gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <p className="text-blue-400">def <span className="text-yellow-200">fibonacci</span><span className="text-gray-300">(n):</span></p>
                    <p className="text-gray-300 pl-4">if n {'<='} 1:</p>
                    <p className="text-gray-300 pl-8 text-pink-400">return <span className="text-gray-300">n</span></p>
                    <p className="text-pink-400 pl-4">return <span className="text-gray-300">fibonacci(n-1) + fibonacci(n-2)</span></p>
                    <div className="mt-4 border-t border-gray-700 pt-2 text-green-400">
                        &gt; Output: 55
                    </div>
                </motion.div>
            </div>
        ),
    },
    {
        id: "quiz",
        title: "Adaptive Quizzes",
        description: "Fast-paced checks to ensure deep understanding.",
        icon: <BrainCircuit className="w-6 h-6" />,
        colorClass: "bg-sky-100 text-sky-900 border-sky-300",
        content: (
            <div className="w-full h-full flex flex-col justify-center bg-sky-50 rounded-xl border border-sky-200 p-4">
                <p className="font-semibold text-sky-900 mb-4 text-center">What is the time complexity of QuickSort?</p>
                <div className="space-y-2 w-full">
                    <motion.div className="w-full bg-white border-2 border-sky-200 p-2 rounded-lg text-center text-sm font-medium text-sky-800" whileHover={{ scale: 1.02 }}>O(n)</motion.div>
                    <motion.div className="w-full bg-green-100 border-2 border-green-400 p-2 rounded-lg text-center text-sm font-bold text-green-800 flex justify-between items-center" initial={{ scale: 0.95 }} animate={{ scale: 1 }}>
                        <span>O(n log n)</span>
                        <span className="bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✓</span>
                    </motion.div>
                    <motion.div className="w-full bg-white border-2 border-sky-200 p-2 rounded-lg text-center text-sm font-medium text-sky-800" whileHover={{ scale: 1.02 }}>O(n²)</motion.div>
                </div>
            </div>
        ),
    },
    {
        id: "flashcard",
        title: "Spaced Repetition",
        description: "Memory retention built effortlessly into your workflow.",
        icon: <LibraryBig className="w-6 h-6" />,
        colorClass: "bg-rose-100 text-rose-900 border-rose-300",
        content: (
            <div className="w-full h-full flex items-center justify-center relative perspective-1000 p-4">
                <motion.div
                    className="w-full h-full max-w-sm absolute inset-4 bg-white border-2 border-rose-300 rounded-2xl shadow-xl flex flex-col items-center justify-center text-center p-6"
                    initial={{ rotateY: 0 }}
                    animate={{ rotateY: 180 }}
                    transition={{ duration: 2, repeat: Infinity, repeatType: "reverse", repeatDelay: 1 }}
                    style={{ transformStyle: "preserve-3d" }}
                >
                    <div className="absolute inset-0 flex items-center justify-center backface-hidden bg-rose-50 rounded-2xl border-2 border-rose-200">
                        <h3 className="text-xl font-bold text-rose-900">Mitochondria</h3>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center bg-white rounded-2xl border-2 border-rose-200" style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}>
                        <p className="text-lg font-medium text-rose-800 px-4">The powerhouse of the cell.</p>
                    </div>
                </motion.div>
            </div>
        )
    }
];

export function SparksShowcase() {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % SPARKS_DATA.length);
        }, 4000); // Rotate every 4 seconds
        return () => clearInterval(timer);
    }, []);

    const activeSpark = SPARKS_DATA[currentIndex];

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col md:flex-row gap-8 items-stretch h-[500px] mb-16">
            {/* Left side: Navigation / List */}
            <div className="w-full md:w-1/3 flex flex-col gap-3">
                {SPARKS_DATA.map((spark, index) => {
                    const isActive = index === currentIndex;
                    return (
                        <button
                            key={spark.id}
                            onClick={() => setCurrentIndex(index)}
                            className={cn(
                                "relative text-left p-4 rounded-2xl border-2 transition-all duration-300 ease-out",
                                isActive
                                    ? "bg-white shadow-[4px_4px_0px_rgba(0,0,0,0.1)] border-[#e05a3a] translate-x-1"
                                    : "bg-[#f5ede0] border-transparent hover:bg-[#fff8f0] text-gray-400"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "p-2 rounded-xl transition-colors",
                                    isActive ? spark.colorClass : "bg-gray-200 text-gray-500"
                                )}>
                                    {spark.icon}
                                </div>
                                <div>
                                    <h4 className={cn("font-bold font-brand text-lg", isActive ? "text-[#1c1208]" : "text-gray-500")}>
                                        {spark.title}
                                    </h4>
                                    {isActive && (
                                        <motion.p
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: "auto" }}
                                            className="text-sm mt-1 text-gray-600"
                                        >
                                            {spark.description}
                                        </motion.p>
                                    )}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Right side: Active Content Display */}
            <div className="w-full md:w-2/3 relative rounded-3xl border-4 border-[#1c1208] bg-white shadow-[8px_8px_0px_#1c1208] overflow-hidden flex flex-col p-2">
                <div className="w-full h-8 border-b-2 border-gray-100 flex items-center px-4 gap-2 mb-2 shrink-0">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                    <div className="ml-4 font-mono text-xs text-gray-400">Agent generating...</div>
                </div>

                <div className="flex-1 relative overflow-hidden bg-gray-50 rounded-xl">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeSpark.id}
                            initial={{ y: 20, opacity: 0, filter: "blur(4px)" }}
                            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                            exit={{ y: -20, opacity: 0, filter: "blur(4px)" }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
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
