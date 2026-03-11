"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { api } from "@/convex/_generated/api";

export function PricingPageView() {
  const { isSignedIn } = useUser();
  const searchParams = useSearchParams();
  const lastCaptureKeyRef = useRef<string | null>(null);
  const billingState = useQuery(
    api.billing.getViewerBillingState,
    isSignedIn ? {} : "skip",
  );

  useEffect(() => {
    if (isSignedIn && billingState === undefined) {
      return;
    }

    const rawEntryPoint = searchParams.get("entry_point");
    const entryPoint =
      rawEntryPoint === "chat_banner" ||
      rawEntryPoint === "settings" ||
      rawEntryPoint === "unknown"
        ? rawEntryPoint
        : "direct";
    const lockedSurface = searchParams.get("surface") ?? undefined;
    const captureKey = JSON.stringify({
      entryPoint,
      planKey: billingState?.planKey ?? null,
      lockedSurface: lockedSurface ?? null,
    });

    if (lastCaptureKeyRef.current === captureKey) {
      return;
    }
    lastCaptureKeyRef.current = captureKey;

    posthog.capture("pricing_page_viewed", {
      entry_point: entryPoint,
      plan_key: billingState?.planKey,
      locked_surface: lockedSurface,
    });
  }, [billingState, isSignedIn, searchParams]);

  return null;
}
