"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { RedirectToSignIn } from "@clerk/nextjs";
import StudiChat from "@/components/StudiChat";

export default function ChatPage() {
  return (
    <>
      <AuthLoading>
        <div className="landing-auth-loading">
          <p
            className="animate-fade-in"
            style={{
              fontFamily: "var(--font-dm-serif)",
              fontSize: "2rem",
              color: "var(--fg-faint)",
            }}
          >
            studi
          </p>
        </div>
      </AuthLoading>

      <Authenticated>
        <StudiChat />
      </Authenticated>

      <Unauthenticated>
        <RedirectToSignIn redirectUrl="/chat" />
      </Unauthenticated>
    </>
  );
}
