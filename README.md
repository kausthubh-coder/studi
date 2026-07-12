# Studi

Studi is an agentic tutor built with Next.js, Convex, Clerk, FreeModel, and OpenRouter.

## What You Have Built

- Chat-first tutoring with multi-thread conversations per user
- Real-time assistant streaming with Convex Agent (single `studi` agent)
- Attachments in chat (images/files) with ownership checks
- Sparks: inline interactive learning artifacts
- Billing & usage quotas (Clerk subscriptions → plan caps)
- Waitlist (Tally → Clerk) for early access
- Telemetry and usage tracking in Convex

## Spark Types

- `scene`: sandboxed HTML/CSS/JS interaction
- `desmos_graph`: interactive graph artifact
- `quiz`: multi-question quiz artifacts
- `flash_card`: flashcard artifact sets

## Core Architecture

Message flow:

1. User sends a message from the frontend.
2. `convex/chat.ts` saves the message and schedules assistant generation.
3. `convex/chatActions.ts` runs the `studi` agent and streams output.
4. Frontend subscribes via `useUIMessages(..., { stream: true })`.

Key backend modules:

- `convex/agent.ts`: agent definition + tool wiring
- `convex/chat.ts`: threads, messages, uploads, send flow
- `convex/chatActions.ts`: create/send/delete thread actions + reply generation
- `convex/sparks/tools.ts`: spark generation, validation, retry logic
- `convex/billing.ts` / `convex/billingActions.ts`: plan caps, quotas, Clerk sync
- `convex/telemetry.ts`: usage + event logging
- `convex/waitlist*.ts` / `convex/http.ts`: Tally → Clerk waitlist
- `convex/schema.ts`: data model for threads, usage, billing, telemetry, waitlist

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- Convex + `@convex-dev/agent`
- Clerk authentication & billing
- FreeModel's Anthropic-compatible endpoint (primary text + Spark generation)
- OpenRouter (automatic text + Spark fallback)

## Prerequisites

- Bun (required package manager)
- Convex project configured
- Clerk app configured
- A FreeModel key and/or an OpenRouter key

## Environment Variables

Set frontend vars in `.env.local`, model/backend secrets in Convex env settings,
and deployment credentials in the matching Vercel environment.

```bash
# Primary model access
FREEMODEL_API_KEY=...
# Optional override; defaults to https://api-cc.freemodel.dev/v1
FREEMODEL_ANTHROPIC_BASE_URL=...

# Fallback model access
OPENROUTER_API_KEY=...

# Sparks (required for desmos_graph rendering)
NEXT_PUBLIC_DESMOS_API_KEY=...

# Clerk (billing sync)
CLERK_SECRET_KEY=...
```

Model routing is configured in `lib/model-config.ts`. When both providers are
configured, Studi tries FreeModel first and retries provider failures through
OpenRouter. If only one key is configured, Studi uses that provider directly.

Vercel builds run `bunx convex deploy --cmd 'bun run build'` from
`vercel.json`. Give Vercel two separate `CONVEX_DEPLOY_KEY` values: a production
deploy key scoped only to Production and either a project preview key or a key
for a dedicated preview deployment scoped only to Preview. Do not expose the
production key to Preview or Development builds. Generate project preview keys
in the Convex dashboard; the Convex CLI can create an expiring dedicated preview
deployment and a deploy key for one-off release verification.

## Local Development

```bash
bun install
bun run dev
```

`bun run dev` starts frontend and backend in parallel.

Open:

`http://localhost:3000`

## Scripts

- `bun run dev`: Next.js + Convex
- `bun run dev:frontend`: Next.js only
- `bun run dev:backend`: Convex only
- `bun run build`: production build
- `bun run lint`: lint
- `bun run test`: unit + convex tests
- `bun run test:e2e`: Playwright e2e tests
- `bun run check`: prompts check + lint + tests + build
- `bun run playground`: Convex Agent Playground
- `bun run prompts:sync`: sync prompt files into generated prompt module

## Agent Playground

Issue a playground key:

```bash
bunx convex run --component agent apiKeys:issue '{"name":"studi-playground"}'
```

Then use:

- Hosted UI: `https://get-convex.github.io/agent/`
- API module path: `playground`

Or run locally:

```bash
bun run playground
```
