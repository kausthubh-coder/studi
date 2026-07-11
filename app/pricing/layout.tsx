import type { ReactNode } from "react";
import { pricingMetadata } from "@/lib/site-metadata";

export const metadata = pricingMetadata;

export default function PricingLayout({ children }: { children: ReactNode }) {
  return children;
}
