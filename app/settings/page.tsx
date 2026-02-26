"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { RedirectToSignIn } from "@clerk/nextjs";
import { UsagePanel } from "@/components/settings/UsagePanel";

export default function SettingsPage() {
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
        <UsagePanel />
      </Authenticated>

      <Unauthenticated>
        <RedirectToSignIn redirectUrl="/settings" />
      </Unauthenticated>
    </>
  );
}
