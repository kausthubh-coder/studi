"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useAction } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "@/convex/_generated/api";
import { WAITLIST_PRICING_ASSURANCE } from "@/lib/billing/plan-catalog";

type FormState = "idle" | "loading" | "success" | "error";

type WaitlistFormProps = {
  variant?: "coral" | "teal";
};

export function WaitlistForm({ variant = "coral" }: WaitlistFormProps) {
  const [state, setState] = useState<FormState>("idle");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const noteId = useId();
  const errorId = useId();

  const joinWaitlist = useAction(api.waitlistPublic.joinWaitlist);
  const accentColor = variant === "teal" ? "#3a9e8a" : "#e05a3a";

  useEffect(() => {
    if (state === "success") {
      successRef.current?.focus({ preventScroll: true });
    }
  }, [state]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = email.trim();
    if (
      !trimmed ||
      trimmed.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
    ) {
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
        setState("success");
        return;
      }

      setErrorMsg(result.error ?? "Something went wrong. Please try again.");
      setState("error");
    } catch (error) {
      console.error("Join waitlist failed", error);
      setErrorMsg("Something went wrong. Please try again.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <motion.div
        ref={successRef}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={-1}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full py-4 text-center outline-none"
      >
        <p className="mb-1 font-brand text-2xl text-fg">
          You&apos;re on the list!
        </p>
        <p className="font-body text-fg-muted">
          One email is all it takes. Check your inbox for updates.
        </p>
        <Link
          href="/waitlist?source=landing"
          style={{ backgroundColor: accentColor }}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-fg px-4 py-2 font-ui font-bold text-fg shadow-[3px_3px_0px_var(--fg)] transition-colors hover:brightness-95"
        >
          Optional: answer 8 short steps →
        </Link>
        <p className="mt-2 font-ui text-xs text-fg-muted">
          About two minutes. This is not required to keep your spot.
        </p>
      </motion.div>
    );
  }

  const describedBy = state === "error" ? `${noteId} ${errorId}` : noteId;

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3">
      <div className="flex w-full flex-col gap-2.5 sm:flex-row">
        <input
          ref={inputRef}
          type="email"
          maxLength={254}
          aria-label="Email address"
          aria-describedby={describedBy}
          aria-invalid={state === "error"}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (state === "error") setState("idle");
          }}
          placeholder="your@email.com"
          disabled={state === "loading"}
          className="min-h-11 flex-1 rounded-xl border-2 border-fg bg-white px-4 py-3 font-ui text-base text-fg shadow-[3px_3px_0px_var(--fg)] placeholder:text-fg-faint focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          style={{ backgroundColor: accentColor }}
          className="min-h-11 whitespace-nowrap rounded-xl border-2 border-fg px-6 py-3 font-ui text-base font-bold text-fg shadow-[3px_3px_0px_var(--fg)] transition-colors hover:brightness-95 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "loading" ? (
            <span className="flex items-center justify-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none"
              />
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
            id={errorId}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-1 font-ui text-sm font-semibold text-red-600"
          >
            {errorMsg}
          </motion.p>
        )}
      </AnimatePresence>

      <p
        id={noteId}
        className="text-center font-ui text-xs font-bold text-fg-faint"
      >
        {WAITLIST_PRICING_ASSURANCE} One email joins the waitlist; the
        questionnaire is optional.
      </p>
    </form>
  );
}
