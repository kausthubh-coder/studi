"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

export function PricingPageView() {
  useEffect(() => {
    posthog.capture("pricing_page_viewed");
  }, []);

  return null;
}
