"use client";

import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import StudiChat from "@/components/StudiChat";

function AuthScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg">
      <div className="w-full max-w-sm px-6 text-center">
        <p className="mb-1 font-brand text-[3.5rem] italic text-fg leading-none tracking-tight">
          Studi
        </p>
        <p className="mb-10 font-heading text-sm italic text-fg-muted">
          your learning companion
        </p>
        <div className="flex flex-col gap-3">
          <SignInButton mode="modal">
            <button className="w-full rounded-md bg-accent px-6 py-2.5 font-heading text-sm font-medium tracking-wide text-white transition-opacity hover:opacity-90 active:opacity-75">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="w-full rounded-md border border-border-warm bg-bg px-6 py-2.5 font-heading text-sm font-medium text-fg transition-colors hover:bg-bg-alt active:opacity-75">
              Create account
            </button>
          </SignUpButton>
        </div>
        <div className="mt-12 flex items-center justify-center gap-3">
          <div className="h-px w-10 bg-border-warm" />
          <span className="text-[11px] tracking-[0.15em] text-fg-faint uppercase">
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
