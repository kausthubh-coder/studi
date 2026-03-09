# Studi

Studi is an agentic tutor built with Next.js, Convex, Clerk, and OpenRouter.

## What You Have Built

- Chat-first tutoring with multi-thread conversations per user
- Real-time assistant streaming with Convex Agent
- Attachments in chat (images/files) with ownership checks
- Sparks: inline interactive learning artifacts
- Plan mode: draft, accept, and track milestone-based learning plans
- Labs: Daytona-backed coding sandboxes linked to threads
- Voice mode: realtime spoken tutoring + tool calls
- Telemetry and usage tracking (Convex + optional PostHog)

## Spark Types

- `scene`: sandboxed HTML/CSS/JS interaction
- `desmos_graph`: interactive graph artifact
- `code_playground`: Python playground (Monaco + Pyodide)
- `web_playground`: editable HTML/CSS/JS live preview
- `quiz`: multi-question quiz artifacts
- `flash_card`: flashcard artifact sets

## Core Architecture

Message flow:

1. User sends a message from the frontend.
2. `convex/chat.ts` saves the message and schedules assistant generation.
3. `convex/chatActions.ts` picks the active agent (`studi`, `codi`, or `shru`) and streams output.
4. Frontend subscribes via `useUIMessages(..., { stream: true })`.

Key backend modules:

- `convex/agent.ts`: agent definitions + tool wiring
- `convex/chat.ts`: threads, messages, uploads, send flow
- `convex/chatActions.ts`: create/send/delete thread actions + reply generation
- `convex/plans.ts` and `convex/planActions.ts`: plan lifecycle and plan drafting worker
- `convex/labs.ts`, `convex/labTools.ts`, `convex/labIde.ts`: lab sessions and sandbox tools
- `convex/sparks/tools.ts`: spark generation, validation, retry logic
- `convex/voiceActions.ts`: realtime voice session + tool execution + usage/events
- `convex/schema.ts`: data model for threads, plans, labs, usage, telemetry

## Tech Stack

- Next.js 16 + React 19 + TypeScript
- Convex + `@convex-dev/agent`
- Clerk authentication
- OpenRouter (text/spark/plan generation)
- OpenAI Realtime API (voice mode)
- Daytona sandboxes (labs)

## Prerequisites

- Bun (required package manager)
- Convex project configured
- Clerk app configured
- OpenRouter key
- OpenAI key (voice mode)
- Daytona key (labs)

## Environment Variables

Set frontend vars in `.env.local` and backend secrets in Convex env settings.

```bash
# Core model access
OPENROUTER_API_KEY=...

# Sparks (required for desmos_graph rendering)
NEXT_PUBLIC_DESMOS_API_KEY=...

# Labs
DAYTONA_API_KEY=...
DAYTONA_API_URL=https://app.daytona.io/api

# Voice mode (OpenAI Realtime)
OPENAI_API_KEY=...

# Optional analytics
POSTHOG_API_KEY=...
POSTHOG_HOST=https://us.i.posthog.com
```

Model routing is configured in `lib/model-config.ts`.

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
- `bun test`: tests
- `bun run playground`: Convex Agent Playground
- `bun run prompts:sync`: sync prompt files into generated prompt module
- `bun run agentic:test`: run agentic lab harness
- `bun run agentic:observability`: agentic observability smoke suite
- `bun run agentic:compare`: compare models
- `bun run agentic:models`: list/check model routing helpers

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
