import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { settingsMetadata } from "@/lib/site-metadata";

export const metadata = settingsMetadata;

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ClerkProvider>
  );
}
