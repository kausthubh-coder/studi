# Next.js + Convex (Bun)

This is the default framework file for this repository.

## Install

```bash
bun add posthog-js posthog-node
```

## Environment Variables

```bash
# .env.local (client-safe)
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Convex/Server env (private)
POSTHOG_API_KEY=phc_xxxxxxxxxxxxxxxxxxxx
POSTHOG_HOST=https://us.i.posthog.com
```

## Client Setup (Next.js App Router)

Create a reusable client initializer.

```ts
// lib/posthog.ts
import posthog from "posthog-js";

export function initPostHog() {
  if (typeof window !== "undefined" && !posthog.__loaded) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false,
      capture_pageleave: true,
      loaded: (client) => {
        if (process.env.NODE_ENV === "development") {
          client.debug();
        }
      },
    });
  }

  return posthog;
}

export { posthog };
```

Add a provider to initialize and track route changes.

```tsx
// app/providers.tsx
"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { initPostHog, posthog } from "@/lib/posthog";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    initPostHog();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    let url = window.origin + pathname;
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
```

Wrap in layout.

```tsx
// app/layout.tsx
import { PostHogProvider } from "./providers";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
```

## Convex Server Tracking

For backend events, use `posthog-node` in Convex actions and call from mutations/queries as needed.

```ts
// convex/posthog.ts
"use node";

import { PostHog } from "posthog-node";

export function createPosthogClient() {
  return new PostHog(process.env.POSTHOG_API_KEY!, {
    host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
  });
}
```

```ts
// convex/analyticsActions.ts
"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { createPosthogClient } from "./posthog";

export const captureServerEvent = internalAction({
  args: {
    distinctId: v.string(),
    event: v.string(),
    properties: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    const client = createPosthogClient();
    try {
      client.capture({
        distinctId: args.distinctId,
        event: args.event,
        properties:
          (args.properties as Record<string, unknown> | undefined) ?? {},
      });
    } finally {
      await client.shutdown();
    }
    return null;
  },
});
```

## Feature Flags

Client-side:

```tsx
import { useFeatureFlagEnabled } from "posthog-js/react";

const enabled = useFeatureFlagEnabled("new-dashboard-ui");
```

Server-side (example):

```ts
import { PostHog } from "posthog-node";

const client = new PostHog(process.env.POSTHOG_API_KEY!);
const flags = await client.getAllFlags(userId);
await client.shutdown();
```

## Recommended Events for This App

- `user_signed_up`, `user_logged_in`, `user_logged_out`
- `thread_created`, `message_sent`, `assistant_reply_stream_started`, `assistant_reply_completed`
- `attachment_uploaded`, `spark_created`, `lab_created`, `lab_archived`
- `feature_flag_exposure`
- `error_occurred`

## Safety Notes

- Do not send prompt/message raw content unless explicitly required and approved.
- Prefer metadata (sizes, counts, durations, status) over user-generated text.
- Capture once per action boundary to avoid duplicates in streaming flows.
