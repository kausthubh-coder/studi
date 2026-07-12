"use client";

/* eslint-disable react/no-unescaped-entities */

import { useEffect, useId, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { motion, AnimatePresence } from "framer-motion";

type FormState = "idle" | "loading" | "success" | "error";

const TALLY_FORM_URL = "https://tally.so/r/WOAjRv";

export function WaitlistForm({
  variant = "coral",
}: {
  variant?: "coral" | "teal";
}) {
  const [state, setState] = useState<FormState>("idle");
  const [email, setEmail] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [alreadyOnList, setAlreadyOnList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalTriggerRef = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const dialogTitleId = useId();

  const joinWaitlist = useAction(api.waitlistPublic.joinWaitlist);

  const accentColor = variant === "teal" ? "#3a9e8a" : "#e05a3a";

  useEffect(() => {
    if (!showModal) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : null;
    const modalTrigger = modalTriggerRef.current;
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowModal(false);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) return;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      const restoreTarget = previouslyFocused?.isConnected
        ? previouslyFocused
        : modalTrigger;
      restoreTarget?.focus();
    };
  }, [showModal]);
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
        setShowModal(true);
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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-4"
          >
            <p className="font-brand text-2xl text-fg mb-1">
              {alreadyOnList
                ? "You're already on the list!"
                : "You're on the list!"}
            </p>
            <p className="font-body text-fg-muted">
              Check your inbox for updates.{" "}
              <button
                ref={modalTriggerRef}
                type="button"
                onClick={() => setShowModal(true)}
                className="underline underline-offset-2 font-semibold text-fg hover:text-accent transition-colors"
              >
                Get ahead in line →
              </button>
            </p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full">
            <div className="flex flex-col sm:flex-row gap-2.5 w-full">
              <input
                ref={inputRef}
                type="email"
                aria-label="Email address"
                aria-describedby={state === "error" ? errorId : undefined}
                aria-invalid={state === "error"}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (state === "error") setState("idle");
                }}
                placeholder="your@email.com"
                disabled={state === "loading"}
                className="flex-1 px-4 py-3 rounded-xl border-2 border-fg bg-white font-ui text-base text-fg placeholder:text-fg-faint shadow-[3px_3px_0px_var(--fg)] focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={state === "loading"}
                style={{ backgroundColor: accentColor }}
                className="px-6 py-3 rounded-xl border-2 border-fg bg-accent hover:bg-accent-hover text-fg font-ui font-bold text-base whitespace-nowrap transition-colors shadow-[3px_3px_0px_var(--fg)] active:translate-y-0.5 active:shadow-none disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {state === "loading" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
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
                  className="text-sm font-ui font-semibold text-red-600 px-1"
                >
                  {errorMsg}
                </motion.p>
              )}
            </AnimatePresence>

            <p className="text-xs font-bold text-fg-faint text-center font-ui">
              No credit card required. Free for students.
            </p>
          </form>
        )}
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              aria-hidden="true"
              className="fixed inset-0 bg-fg/50 z-50 backdrop-blur-sm"
            />
            <motion.div
              ref={dialogRef}
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby={dialogTitleId}
              className="fixed z-50 inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto"
            >
              <div className="relative bg-white rounded-3xl border-[3px] border-fg shadow-[8px_8px_0px_var(--accent2)] p-8 text-center">
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="absolute top-4 right-4 grid w-11 h-11 place-items-center rounded-lg border-2 border-fg bg-white text-fg text-sm font-bold hover:bg-bg-alt transition-colors shadow-[2px_2px_0px_var(--fg)] active:translate-y-0.5 active:shadow-none"
                  aria-label="Close"
                >
                  ✕
                </button>

                <div className="grid w-14 h-14 place-items-center bg-accent2 rounded-2xl border-2 border-fg mx-auto mb-4 text-fg text-2xl font-bold shadow-[3px_3px_0px_var(--fg)]">
                  ✓
                </div>

                <h2
                  id={dialogTitleId}
                  className="font-brand text-3xl text-fg mb-2"
                >
                  {alreadyOnList
                    ? "Already on the list!"
                    : "You're on the list!"}
                </h2>
                <p className="font-body text-fg-muted mb-6 leading-relaxed">
                  {alreadyOnList
                    ? "Your email is already registered. Want to move up in line?"
                    : "We'll let you know the moment Studi opens its doors."}
                  <br />
                  <span className="font-semibold text-fg">
                    Take 2 minutes to fill out our full form and get ahead of
                    the queue.
                  </span>
                </p>

                <a
                  href={TALLY_FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block w-full font-ui font-bold px-6 py-4 rounded-2xl border-2 border-fg bg-accent2 text-fg hover:bg-[#2c8a76] transition-colors text-lg mb-3 shadow-[4px_4px_0px_var(--fg)] active:translate-y-0.5 active:shadow-[2px_2px_0px_var(--fg)]"
                >
                  Get ahead in line →
                </a>

                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="inline-flex min-h-11 w-full items-center justify-center text-sm text-fg-faint hover:text-fg-muted transition-colors font-ui"
                >
                  No thanks, I'll wait my turn
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
