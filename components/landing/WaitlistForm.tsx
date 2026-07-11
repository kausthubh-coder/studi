"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";
import { WAITLIST_PRICING_ASSURANCE } from "@/lib/billing/plan-catalog";

type FormState = "idle" | "loading" | "success" | "error";

export function WaitlistForm({ variant = "coral" }: { variant?: "coral" | "teal" }) {
  const [state, setState] = useState<FormState>("idle");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [alreadyOnList, setAlreadyOnList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const noteId = useId();

  const joinWaitlist = useAction(api.waitlistPublic.joinWaitlist);

  const accentColor = variant === "teal" ? "#217567" : "#b64028";

  useEffect(() => {
    if (state !== "success") return;
    successRef.current?.focus();
  }, [state]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setErrorMsg("Please enter a valid email address.");
      setState("error");
      inputRef.current?.focus();
      return;
    }

    setState("loading");
    setErrorMsg("");

    try {
      const result = await joinWaitlist({ email: trimmed });
      if (result.success) {
        const isAlreadyOnList = result.alreadyOnList ?? false;
        setAlreadyOnList(isAlreadyOnList);
        setState("success");
      } else {
        setErrorMsg(result.error ?? "Something went wrong. Please try again.");
        setState("error");
      }
    } catch (err) {
      console.error("Join waitlist failed", err);
      setErrorMsg("Something went wrong. Please try again.");
      setState("error");
    }
  }

  return (
    <>
      <div className="w-full">
        {state === "success" ? (
          <motion.div
            ref={successRef}
            role="status"
            aria-live="polite"
            tabIndex={-1}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-4"
          >
            <p className="font-brand text-2xl text-[#1c1208] mb-1">
              {alreadyOnList ? "You're already on the list!" : "You're on the list!"}
            </p>
            <p className="font-body text-[#6b5a47]">
              One email is all it takes. Check your inbox for updates.
            </p>
            <Link
              href="/waitlist?source=landing"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-[#1c1208] bg-[#217567] px-4 py-2 font-bold text-white shadow-[3px_3px_0px_#1c1208] transition hover:bg-[#16594f]"
            >
              Optional: answer 8 short steps →
            </Link>
            <p className="mt-2 text-xs font-ui text-[#6b5a47]">
              About two minutes. This is not required to keep your spot.
            </p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <input
                ref={inputRef}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (state === "error") setState("idle");
                }}
                placeholder="your@email.com"
                disabled={state === "loading"}
                aria-label="Email address"
                aria-describedby={noteId}
                className="flex-1 px-4 py-3 rounded-xl border-2 border-[#1c1208] bg-white font-ui text-base placeholder:text-[#6b5a47] focus:outline-none focus:ring-2 focus:ring-[#e05a3a]/40 disabled:opacity-100 shadow-[2px_2px_0px_#1c1208]"
              />
              <button
                type="submit"
                disabled={state === "loading"}
                style={{ backgroundColor: state === "loading" ? "#5f4f40" : accentColor }}
                className="px-6 py-3 rounded-xl border-2 border-[#1c1208] text-white font-bold text-base whitespace-nowrap shadow-[3px_3px_0px_#1c1208] active:translate-y-0.5 active:shadow-[0px_0px_0px_#1c1208] transition-all disabled:opacity-100 disabled:cursor-not-allowed"
              >
                {state === "loading" ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin motion-reduce:animate-none inline-block" />
                    Joining...
                  </span>
                ) : (
                  "Get Early Access"
                )}
              </button>
            </div>

            <AnimatePresence>
              {state === "error" && errorMsg && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="alert"
                  className="text-sm font-bold text-red-600 px-1"
                >
                  {errorMsg}
                </motion.p>
              )}
            </AnimatePresence>

            <p id={noteId} className="text-xs text-[#6b5a47] text-center font-ui">
              {WAITLIST_PRICING_ASSURANCE}
              {" One email joins the waitlist; the questionnaire is optional."}
            </p>
          </form>
        )}
      </div>

    </>
  );
}
