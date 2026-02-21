# Studi

Studi is an **agentic tutor** built with Next.js + Convex.

The goal: make learning intuitive, interactive, and personalized so that by the end of a lesson you feel like you could have invented the concept yourself. Learning should never be passive.

## The Bet

College is increasingly obsolete — the internet already gives you free knowledge. What it can't do is teach you directly. AI can. Over time, hiring will shift toward demonstrated skill rather than credentials. Studi is positioning to lead that shift: as learners learn, we generate artifacts and track real skills. Companies can hire directly through the platform.

## Philosophy

- **Intuition-first** — never just give the formula. Teach the _why_ until the concept feels inevitable.
- **Active learning** — instant feedback, early wins, and small victories at every step. No passive consumption.
- **Personalized** — pacing, focus areas, and teaching style adapt to each learner.
- **Meta-learning** — we study and implement what the research says about how people learn best.

## Core Experience

Chat is the primary interface. There is no mode picker upfront — you just talk.

A **`+` icon** opens the agent control panel, where you can explicitly trigger Learn, Review, and other actions.

Additionally, if you type trigger words in the chat input — things like _"learn"_, _"teach me"_, _"step by step"_, or _"review"_, _"go over"_, _"practice"_ — the app will prompt you to confirm and launch the appropriate mode automatically.

Each thread is scoped to a **specific topic** and a single intent: Learn or Review.

### Learn mode

1. Agent creates a **milestone plan** for the topic.
2. Teaching is intuition-first with small wins baked in throughout.
3. Major milestones unlock **checkpoints**: quizzes, coding challenges, or labs.
4. Progress and artifacts are tracked as the learner advances.

### Review mode

1. Agent asks for a syllabus or specific topics to review.
2. A **diagnostic** is generated to surface weak areas.
3. Agent teaches and quizzes with heavier focus on areas where the learner scored low.

## Agent Tools

Tools the agent can invoke inside a thread:

| Tool                 | Description                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Custom component** | Generate an interactive HTML/CSS/JS component to visualize or simulate a concept                                                  |
| **Graphing**         | Render 2D and 3D graphs via Desmos                                                                                                |
| **Code snippet**     | Display syntax-highlighted code examples                                                                                          |
| **Code test**        | Present a coding problem with an embedded input box; the learner submits a solution and gets instant feedback with optional hints |
| **Quiz**             | Multiple choice, open-ended, fill-in-the-blank, and more                                                                          |
| **Whiteboard**       | Shared canvas — the agent can draw on it to explain, or ask the learner to draw and then review their work                        |
| **Lab (link-out)**   | Launch a full lab space (see below)                                                                                               |

> **Future integrations**: Khan Academy and IXL — surfacing their problems and videos directly inside threads.

## Labs

Labs are standalone spaces linked from a thread. They're used for larger, hands-on projects that need their own environment.

**Example flow** — Learning React:

1. Cover fundamentals in the thread (components, props, state).
2. Milestone checkpoint → launch a lab: _build a simple to-do app_.
3. Return to the thread, continue with more concepts.
4. Another milestone → back to the lab to extend the project.
5. Repeat until the topic is complete.

Labs give learners real artifacts — proof of what they built, not just what they watched.

## Repo Structure

- `app/`, `components/`, `convex/`: active Studi app code
- `examples/shru/`: older Studi version (reference only)
- `examples/agent-tldraw/`: tldraw agent whiteboard example
- `examples/chat-tldraw/`: tldraw chat + whiteboard example

## Tech Stack

- [Next.js](https://nextjs.org/) + React
- [Convex](https://convex.dev/) for backend / database / real-time functions
- [Clerk](https://clerk.com/) for authentication
- TypeScript + ESLint + Tailwind CSS

## Getting Started

0. Configure environment variables in `.env.local`:

```bash
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.6
NEXT_PUBLIC_DESMOS_API_KEY=... # required for desmos_graph sparks
```

1. Install dependencies:

```bash
bun install
```

2. Start local development (frontend + Convex):

```bash
bun run dev
```

3. Open the app:

```
http://localhost:3000
```

## Agent Playground

This repo now exposes the Convex Agent Playground API at `convex/playground.ts`.

1. Issue an API key:

```bash
bunx convex run --component agent apiKeys:issue '{"name":"studi-playground"}'
```

2. Use the hosted playground:
   - Open `https://get-convex.github.io/agent/`
   - Deployment URL: from `CONVEX_URL` in `.env.local`
   - API key: the key from step 1
   - API module path: `playground`

3. Or run playground locally:

```bash
bun run playground
```

## Current Scope

In scope:

- Chat-first thread UI with `+` agent control panel
- Trigger-word detection → mode prompt
- Learn and Review thread flows
- Milestone planning, diagnostics, and targeted practice
- Quiz / code-test / custom component / graph / whiteboard / lab orchestration

Out of scope for now:

- Employer hiring dashboards
- Full credential / portfolio system
- Complex multi-user collaboration

## Vision

A world where learning is interactive, adaptive, and measured by demonstrated ability — not credentials. Studi is the platform that gets you there.

# Studi

Studi is an intuition-first tutoring app built with Next.js, Convex, Clerk, and OpenRouter.

The current product is a chat interface where authenticated users can:

- create and switch between threads
- send text plus file/image attachments
- stream assistant responses in real time
- render inline interactive Sparks (custom HTML scenes and Desmos graphs)

## What Is Implemented

### Chat and threads

- Multi-thread chat UI with per-user thread ownership
- Real-time streaming message updates via `@convex-dev/agent/react`
- Request ID deduplication in `sendMessage` to avoid duplicate user messages
- Automatic thread title seeding from the first non-empty prompt

### Attachments

- Uploads go through Convex file storage
- Images and files are validated for ownership before model access
- Uploaded files can be attached to prompts and rendered in message history

### Sparks (interactive artifacts)

- `scene`: self-contained HTML/CSS/JS micro-interactions rendered in a sandboxed iframe
- `desmos_graph`: interactive graph artifacts rendered with the Desmos calculator API
- Spark worker does structured generation + validation + one repair retry

## Architecture Overview

Message flow:

1. User submits text/files from `components/StudiChat.tsx`.
2. `convex/chat.ts:sendMessage` stores the user message and schedules AI work.
3. `convex/chatActions.ts:generateAssistantReply` continues the agent thread and streams output.
4. Frontend subscribes with `useUIMessages(..., { stream: true })` and updates live.

Key backend files:

- `convex/agent.ts` - primary Studi agent definition and `create_spark` tool wiring
- `convex/chat.ts` - thread listing, message listing, uploads, send flow, auth checks
- `convex/chatActions.ts` - actions for thread creation and assistant generation
- `convex/sparks/tools.ts` - Spark generation, validation, retries, fallback model handling
- `convex/schema.ts` - `userThreads` and `attachments` tables

Key frontend files:

- `components/StudiChat.tsx` - top-level chat orchestration
- `components/studi-chat/` - sidebar, composer, message rendering
- `components/sparks/` - Spark artifact rendering (scene + Desmos)

## Tech Stack

- Next.js 16 + React 19
- Convex + `@convex-dev/agent`
- Clerk authentication
- OpenRouter via AI SDK provider
- TypeScript + ESLint + Tailwind CSS

## Prerequisites

- Bun (required package manager)
- A configured Convex project
- A configured Clerk app
- OpenRouter API key

## Environment Variables

Set frontend vars in `.env.local` and backend vars in Convex environment settings.

```bash
# Required (agent + spark worker)
OPENROUTER_API_KEY=...

# Optional model overrides
OPENROUTER_MODEL=anthropic/claude-sonnet-4.6
SPARK_WORKER_SCENE_MODEL=google/gemini-3-flash-preview
SPARK_WORKER_DESMOS_MODEL=z-ai/glm-5
SPARK_WORKER_TIMEOUT_MS=18000
SPARK_WORKER_SCENE_TIMEOUT_MS=35000
SPARK_WORKER_DESMOS_TIMEOUT_MS=20000

# Required for Desmos spark rendering in the browser
NEXT_PUBLIC_DESMOS_API_KEY=...

# Required by Convex + Clerk setup (values come from their dashboards)
NEXT_PUBLIC_CONVEX_URL=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
CLERK_SECRET_KEY=...
```

## Getting Started

1. Install dependencies:

```bash
bun install
```

2. Configure Convex (first run):

```bash
bunx convex dev
```

3. Start frontend + backend:

```bash
bun run dev
```

`bun run dev` runs a `predev` hook that checks Convex setup (`convex dev --until-success`) and opens the Convex dashboard.

4. Open the app:

```text
http://localhost:3000
```

## Scripts

- `bun run dev` - run Next.js + Convex in parallel
- `bun run dev:frontend` - run Next.js only
- `bun run dev:backend` - run Convex only
- `bun run build` - production build
- `bun run lint` - lint codebase
- `bun run playground` - launch local Convex Agent Playground

## Agent Playground

Studi exposes a playground module at `convex/playground.ts`.

1. Issue an API key:

```bash
bunx convex run --component agent apiKeys:issue '{"name":"studi-playground"}'
```

2. Open `https://get-convex.github.io/agent/` and set:

- deployment URL from your Convex deployment (`CONVEX_URL`)
- API key from step 1
- API module path: `playground`

Or run the local playground UI:

```bash
bun run playground
```

## Repository Layout

- `app/`, `components/`, `convex/`, `lib/` - active Studi code
- `docs/convex-agents/` - local reference docs for Convex Agent usage
- `examples/` - older/reference implementations and experiments
