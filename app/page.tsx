"use client";

import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import StudiChat from "@/components/StudiChat";

function AuthScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg">
      <div className="animate-rise w-full max-w-sm px-6 text-center">
        <p className="mb-1 font-brand text-[3.5rem] italic leading-none tracking-tight text-fg">
          Studi
        </p>
        <p className="mb-10 font-heading text-sm italic text-fg-muted">
          your learning companion
        </p>
        <div className="flex flex-col gap-3">
          <SignInButton mode="modal">
            <button className="w-full rounded-xl bg-accent px-6 py-3 font-heading text-sm font-medium tracking-wide text-white transition-all hover:opacity-90 active:scale-[0.98]">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="w-full rounded-xl border border-border-warm bg-bg px-6 py-3 font-heading text-sm font-medium text-fg transition-all hover:bg-bg-alt active:scale-[0.98]">
              Create account
            </button>
          </SignUpButton>
        </div>
        <div className="mt-12 flex items-center justify-center gap-3">
          <div className="h-px w-10 bg-border-warm" />
          <span className="text-[11px] uppercase tracking-[0.15em] text-fg-faint">
            learn at your own pace
          </span>
          <div className="h-px w-10 bg-border-warm" />
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <Authenticated>
        <StudiChat />
      </Authenticated>
      <Unauthenticated>
        <AuthScreen />
      </Unauthenticated>
    </>
  );
}
