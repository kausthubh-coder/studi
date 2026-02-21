# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install              # install dependencies
bun run dev              # start frontend (Next.js) + backend (Convex) in parallel
bun run dev:frontend     # Next.js only
bun run dev:backend      # Convex only
bun run build            # production build
bun run lint             # ESLint
bun test                 # run tests (Bun native)
bun test path/to/file.test.ts              # single test file
bun test --test-name-pattern "name"        # single test by name
bun run playground       # launch Convex Agent Playground locally
```

**Package manager**: always use `bun` / `bunx`. Never use `npm` / `npx`.

**Environment variables** (`.env.local` + Convex env):

```
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=anthropic/claude-sonnet-4.6   # optional, this is the default
SPARK_WORKER_MODEL=z-ai/glm-5                  # optional, model for Spark generation
NEXT_PUBLIC_DESMOS_API_KEY=...                 # required for desmos_graph sparks
```

`predev` runs `convex dev --until-success` before starting — Convex must be configured before `bun run dev` works.

## Architecture

Studi is an **agentic tutor**: a Next.js 16 + React 19 frontend, a Convex backend for real-time data and AI orchestration, Clerk for auth, and OpenRouter for LLM access.

### Message flow

```
User submits → chat.sendMessage (mutation)
  → saves user message via @convex-dev/agent saveMessage
  → schedules chatActions.generateAssistantReply (internalAction)
     → studiAgent.continueThread → thread.streamText
     → streams deltas back to client via syncStreams
```

`sendMessage` is a Convex **mutation** (fast, transactional). It queues the AI work via `ctx.scheduler.runAfter(0, ...)`. The mutation also implements **request-ID deduplication**: if the same `requestId` arrives twice, it returns the existing `promptMessageId` without re-saving.

### Convex backend (`convex/`)

| File               | Role                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts`        | `userThreads` table (maps Clerk userId → Agent threadId) + `attachments` table                                                            |
| `agent.ts`         | `studiAgent` — `@convex-dev/agent` Agent wired to OpenRouter with `create_spark` tool                                                     |
| `chat.ts`          | Public queries/mutations: `listThreads`, `listThreadMessages`, `sendMessage`, `generateUploadUrl`, `saveAttachment` plus internal helpers |
| `chatActions.ts`   | Actions: `createThread` (public), `generateAssistantReply` (internal)                                                                     |
| `sparks/tools.ts`  | `createSparkTool` — Convex tool that calls a spark-worker LLM, validates HTML, retries once on failure                                    |
| `convex.config.ts` | Registers `@convex-dev/agent` component                                                                                                   |
| `playground.ts`    | Exposes Agent Playground API (for debugging)                                                                                              |

`userThreads` is the ownership bridge: Convex Agent manages the actual thread/message storage, while `userThreads` lets us do auth checks and list/sort threads per user.

### Sparks system

**Sparks** are inline interactive learning artifacts — self-contained HTML files rendered inside an `<iframe>` sandbox.

```
lib/sparks/
  contracts.ts       — types (SparkType, SparkSceneArtifact, CreateSparkToolResult) + validation/normalization utils
  catalog.ts         — sparkSkillCatalog registry + sparkCatalogPromptBlock() for the agent system prompt
  skills/scene.ts    — spark-scene skill definition (name, description, whenToUse, LLM instructions)

convex/sparks/
  tools.ts           — createSparkTool: calls worker LLM → parses JSON → validates HTML → retries once

components/sparks/
  SparkSceneRenderer.tsx    — renders a SparkSceneArtifact; dispatches to scene-type components
  scenes/
    HtmlCssJsSandboxScene.tsx  — renders scene HTML in a sandboxed iframe
```

To add a new Spark type: (1) add its id to `sparkTypes` in `contracts.ts`, (2) create a skill in `lib/sparks/skills/`, (3) register it in `catalog.ts`, (4) handle it in `tools.ts` `buildSceneSpark`, (5) add a renderer entry in `SparkSceneRenderer.tsx`.

### Frontend (`app/`, `components/`)

```
app/
  layout.tsx        — ClerkProvider wraps ConvexClientProvider; Google Fonts loaded here
  page.tsx          — Authenticated → <StudiChat>, Unauthenticated → sign-in/sign-up UI

components/
  ConvexClientProvider.tsx   — wires Clerk JWT to Convex auth
  StudiChat.tsx              — top-level orchestrator: thread selection, send, upload, streaming
  studi-chat/
    ThreadSidebar.tsx        — thread list + "new thread" button
    MessageColumn.tsx        — scrolling message list
    Composer.tsx             — textarea + attachment previews + send button
    types.ts                 — PendingAttachment, ThreadSummary
```

`StudiChat` uses `useUIMessages` from `@convex-dev/agent/react` with `stream: true` to receive real-time streaming deltas. Agent activity state (thinking/streaming/tool calls) is derived via `deriveAgentUiState` in `MessageRenderer`.

### Convex rules (critical)

- Always define `args` and `returns` validators on every Convex function.
- Use `query/mutation/action` for public API; `internalQuery/internalMutation/internalAction` for private.
- Prefer `withIndex(...)` over `filter` for all queries.
- Add `"use node"` at top of files that use Node.js built-ins (e.g. `agent.ts`, `chatActions.ts`, `sparks/tools.ts`).
- Never call `ctx.db` inside actions — use `ctx.runQuery`/`ctx.runMutation`.
- HTTP routes go in `convex/http.ts` using `httpAction`.
- Use `api` for public refs, `internal` for internal refs.

### Reference material

- `examples/shru/` — older Studi version, read-only reference
- `examples/agent-tldraw/`, `examples/chat-tldraw/` — tldraw integration examples
