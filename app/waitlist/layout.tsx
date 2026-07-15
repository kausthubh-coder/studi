import type { ReactNode } from "react";
import { waitlistMetadata } from "@/lib/site-metadata";

export const metadata = waitlistMetadata;

export default function WaitlistLayout({ children }: { children: ReactNode }) {
  return children;
}
