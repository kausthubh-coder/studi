import type { ReactNode } from "react";
import { chatMetadata } from "@/lib/site-metadata";

export const metadata = chatMetadata;

export default function ChatLayout({ children }: { children: ReactNode }) {
  return children;
}
