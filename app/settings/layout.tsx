import type { ReactNode } from "react";
import { settingsMetadata } from "@/lib/site-metadata";

export const metadata = settingsMetadata;

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}
