"use client";

import { Authenticated, Unauthenticated } from "convex/react";
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import StudiChat from "@/components/StudiChat";

function AuthCard() {
  return (
    <div className="mx-auto mt-20 flex w-full max-w-md flex-col gap-4 rounded-xl border border-slate-200 p-6 text-center dark:border-slate-800">
      <h1 className="text-2xl font-semibold">Welcome to Studi</h1>
      <p className="text-sm opacity-80">
        Sign in to start an agentic learning thread with streaming responses.
      </p>
      <SignInButton mode="modal">
        <button className="rounded-md bg-foreground px-4 py-2 text-background">
          Sign in
        </button>
      </SignInButton>
      <SignUpButton mode="modal">
        <button className="rounded-md border border-slate-300 px-4 py-2 dark:border-slate-700">
          Create account
        </button>
      </SignUpButton>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-background px-4 py-3 dark:border-slate-800">
        <p className="font-semibold">Studi</p>
        <UserButton />
      </header>
      <main>
        <Authenticated>
          <StudiChat />
        </Authenticated>
        <Unauthenticated>
          <AuthCard />
        </Unauthenticated>
      </main>
    </>
  );
}
