"use client";

import type { ReactNode } from "react";
import { ConvexProvider, ConvexReactClient } from "convex/react";

const publicConvexClient = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL!,
);

export default function PublicConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ConvexProvider client={publicConvexClient}>{children}</ConvexProvider>
  );
}
