import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { pricingMetadata } from "@/lib/site-metadata";

export const metadata = pricingMetadata;

export default function PricingLayout({ children }: { children: ReactNode }) {
  return <ClerkProvider>{children}</ClerkProvider>;
}
