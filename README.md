# Studi

Studi is an agentic tutor built with Next.js, Convex, Clerk, and OpenRouter.

## What You Have Built

- Chat-first tutoring with multi-thread conversations per user
- Real-time assistant streaming with Convex Agent
- Attachments in chat (images/files) with ownership checks
- Sparks: inline interactive learning artifacts
- Plan mode: draft, accept, and track milestone-based learning plans
- Labs: CodeSandbox-backed coding sandboxes linked to threads
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
- CodeSandbox sandboxes (labs)

## Prerequisites

- Bun (required package manager)
- Convex project configured
- Clerk app configured
- OpenRouter key
- OpenAI key (voice mode)
- CodeSandbox API key (labs)

## Environment Variables

Set frontend vars in `.env.local` and backend secrets in Convex env settings.

```bash
# Core model access
OPENROUTER_API_KEY=...

# Sparks (required for desmos_graph rendering)
NEXT_PUBLIC_DESMOS_API_KEY=...

# Labs
CSB_API_KEY=...
# Optional overrides for private/custom templates
CSB_TEMPLATE_ASTRO_ID=...
CSB_TEMPLATE_BUN_ID=...
CSB_TEMPLATE_ELIXIR_ID=...
CSB_TEMPLATE_GLEAM_ID=...
CSB_TEMPLATE_GO_ID=...
CSB_TEMPLATE_HTML_CSS_ID=...
CSB_TEMPLATE_JAVASCRIPT_ID=...
CSB_TEMPLATE_NEXTJS_ID=...
CSB_TEMPLATE_PYTHON_ID=...
CSB_TEMPLATE_PYTHON_FLASK_SERVER_ID=...
CSB_TEMPLATE_RAILS_ID=...
CSB_TEMPLATE_REACT_VITE_ID=...
CSB_TEMPLATE_RUST_ID=...
CSB_TEMPLATE_SVELTEKIT_ID=...
CSB_TEMPLATE_VITE_ID=...
CSB_HIBERNATION_TIMEOUT_SECONDS=1800
LAB_MIGRATION_TOKEN=... # rollout-only, for bulk legacy lab-session reset

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
- `bun run csb:templates:sync`: sync the official CodeSandbox template sources into `codesandbox/templates`
- `bun run csb:templates:build`: build synced templates and print the sandbox IDs you should save in Convex env
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
