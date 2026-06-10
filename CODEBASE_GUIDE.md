# Studi — Codebase Guide & Audit

A practical map of the codebase: what each part does, how to learn it, what's
worth refactoring, and what's dead weight you can delete. Written 2026-05-29.

---

## 1. The mental model (read this first)

Studi is an **agentic tutor**. Strip away the features and the whole app is one loop:

```
You type a message
  → Convex saves it (a fast DB mutation)
  → Convex schedules an async job to call the LLM
  → the LLM (via OpenRouter) streams an answer back, and can call tools
  → tools produce "Sparks" (interactive learning widgets) rendered in the chat
  → everything streams to the browser in real time
```

There is a single agent:
- **studi** — the tutor (tools: `create_spark`, `get_code_spark_context`)

Everything else (billing, telemetry, waitlist, the landing page) is supporting
machinery around that core loop.

---

## 2. Tech stack

| Layer | Tech | Where |
|---|---|---|
| Frontend | Next.js 16 (app router) + React 19 + TS | `app/`, `components/` |
| Backend / realtime DB | Convex + `@convex-dev/agent` | `convex/` |
| Auth & billing | Clerk | `convex/auth.config.ts`, `proxy.ts`, layout, `convex/billing*.ts` |
| LLM | OpenRouter (model routing in `lib/model-config.ts`) | `convex/agent.ts` |
| Styling | Tailwind v4 (`@theme inline`) | `app/globals.css` |
| Package manager | **bun only** (never npm/npx) | — |

---

## 3. Repo map

```
app/                      Next.js routes (thin — mostly auth gates around a component)
  layout.tsx              ClerkProvider → ConvexClientProvider → fonts → PostHog sync
  page.tsx                "/"  → LandingPage (public marketing)
  chat/page.tsx           "/chat" → StudiChat (the actual app)
  settings/page.tsx       "/settings" → UsagePanel
  pricing/page.tsx        "/pricing" → Clerk pricing table
  waitlist/page.tsx       "/waitlist" → embedded Tally form
  globals.css             3,700-line design system (tokens, landing, scenes, CoT)

components/
  StudiChat.tsx           ★ top-level app orchestrator (924 lines)
  ConvexClientProvider.tsx  wires Clerk JWT → Convex auth
  studi-chat/             chat UI pieces (sidebar, composer, message renderer…)
  sparks/                 Spark rendering (renderer + side panel + 6 scenes)
  landing/                marketing page + sparks showcase + waitlist form
  settings/               UsagePanel (usage meters + Clerk billing/account tabs)

convex/                   Backend. Every file = a set of queries/mutations/actions
  schema.ts               ★ all DB tables — start here to understand the data
  agent.ts                builds the studi agent + usage tracking handler
  chat.ts                 user-facing: sendMessage, listThreads, attachments…
  chatActions.ts          async orchestration: generateAssistantReply (the core)
  sparks/tools.ts         ★ createSparkTool — the LLM-worker that builds Sparks
  billing.ts              plan caps, quota enforcement, usage rollups
  billingActions.ts       syncs Clerk subscription → billingProfiles
  telemetry.ts            raw usage + event logging + monthly aggregation
  rateLimits.ts           per-plan token-bucket rate limits
  waitlist.ts / waitlistActions.ts / waitlistPublic.ts   Tally→Clerk waitlist
  http.ts                 the Tally webhook endpoint
  sparkFeedback.ts        persists code-playground edits/runs for agent context
  playground.ts           Convex Agent Playground (debugging only)

lib/                      Shared, framework-agnostic code
  model-config.ts         model routing profiles (balanced/fast/quality)
  sparks/contracts.ts     ★ all Spark types + validators + normalizers (1,277 lines)
  sparks/catalog.ts       registry that feeds Spark skills into the agent prompt
  sparks/skills/generated.ts   auto-generated from prompts/ (do not edit)
  prompts/                loads + syncs the markdown prompt files
  voice/contracts.ts      voice warning types
  agent-tools/getCodeSparkContextTool.ts   lets the agent read the learner's code attempts

prompts/                  ★ the actual system prompts as editable markdown
  agents/studi.md, agents/shru.md
  sparks/skills/*.md      one per spark type
  (run `bun run prompts:sync` to regenerate lib/**/generated.ts after editing)

tests/                    playwright e2e + vitest unit tests
```

`★` = the highest-leverage files to understand.

---

## 4. How to learn it — a reading path

Follow this order. Each step builds on the last.

**Step 1 — The data model.** Read `convex/schema.ts` (186 lines). Every feature
maps to a table here: `userThreads` (chat ownership), `attachments`,
`sparkInteractions` (code playground state), `billingProfiles` / `billingUsagePeriods`
/ `billingOnboarding` (money), `rawUsage` / `telemetryEvents` (observability),
`waitlistWebhookEvents`.

**Step 2 — The message loop.** Read in this order:
1. `components/StudiChat.tsx` — find `onSend` to see what the client sends.
2. `convex/chat.ts` → `sendMessage` mutation — note the requestId dedup and the
   `ctx.scheduler.runAfter(0, ...)` that kicks off the async reply.
3. `convex/chatActions.ts` → `generateAssistantReply` — agent selection +
   `thread.streamText`. **This is the heart of the app.**
4. `convex/agent.ts` — how the studi/shru agents are built and what tools they get.

**Step 3 — Sparks (the signature feature).** Read:
1. `lib/sparks/contracts.ts` — skim the 6 type definitions and their validators.
2. `convex/sparks/tools.ts` → `createSparkTool` — the worker LLM call → parse →
   validate → repair-once pipeline.
3. `components/sparks/SparkSceneRenderer.tsx` — how a generated artifact becomes UI.
4. One scene, e.g. `components/sparks/scenes/QuizScene.tsx` (simple) then
   `WebPlaygroundScene.tsx` (complex).

**Step 4 — Real-time rendering.** Read `components/studi-chat/MessageRenderer.tsx`.
`deriveAgentUiState` / `deriveAssistantActivity` turn streaming message "parts"
into the thinking/tool/spark UI. Big file — read the derive functions first, then
`ArticleMessage`.

**Step 5 — Pick one supporting subsystem** depending on interest: voice
(`convex/voiceActions.ts` + `components/voice/useVoiceSession.ts`) or billing
(`convex/billing.ts`).

**Tip:** run `bun run playground` to poke the agents live, and use the Convex
dashboard to watch tables change as you chat.

---

## 5. Feature → code map

| Feature | Frontend | Backend | Shared |
|---|---|---|---|
| Multi-thread chat | `StudiChat.tsx`, `studi-chat/ThreadSidebar.tsx`, `MessageColumn.tsx` | `chat.ts`, `chatActions.ts` | — |
| Streaming replies | `MessageRenderer.tsx` (`deriveAgentUiState`) | `chatActions.generateAssistantReply`, `agent.ts` | — |
| Attachments | `Composer.tsx` | `chat.ts` (`generateUploadUrl`, `saveAttachment`, `resolveAttachments`) | — |
| Sparks (6 types) | `sparks/SparkSceneRenderer.tsx`, `sparks/scenes/*` | `sparks/tools.ts` | `lib/sparks/contracts.ts`, `catalog.ts`, `prompts/sparks/skills/*.md` |
| Code-playground state | `scenes/CodePlaygroundScene.tsx` | `sparkFeedback.ts` | `lib/agent-tools/getCodeSparkContextTool.ts` |
| Voice mode | `voice/useVoiceSession.ts`, `studi-chat/VoiceComposer.tsx`, `VoiceWarningBanner.tsx` | `voiceActions.ts`, `voiceTools.ts` | `lib/voice/contracts.ts` |
| Billing & quotas | `settings/UsagePanel.tsx` | `billing.ts`, `billingActions.ts`, `rateLimits.ts` | — |
| Telemetry / usage | `analytics/*` | `telemetry.ts`, `posthog.ts` | — |
| Waitlist | `landing/WaitlistForm.tsx`, `app/waitlist` | `waitlist.ts`, `waitlistActions.ts`, `waitlistPublic.ts`, `http.ts` | — |
| Landing page | `landing/LandingPage.tsx`, `SparksShowcase.tsx` | — | — |
| Auth | `ConvexClientProvider.tsx`, `app/layout.tsx` | `auth.config.ts`, `proxy.ts` | — |

---

## 6. Refactoring candidates (large / mixed-concern files)

Ranked by payoff. None are bugs — they're maintainability risks.

1. **`convex/sparks/tools.ts` (2,276 lines)** — one file holds the worker prompt
   building, 6 per-type `build*Spark` functions, all validators, timeouts, cost
   tracking, and telemetry. Split into `sparks/validators.ts`, `sparks/workers.ts`
   (per-type generation), and keep `tools.ts` as the thin tool entry. Highest payoff.

2. **`components/voice/useVoiceSession.ts` (1,318 lines)** — a single hook doing
   WebRTC setup, SDP negotiation, data-channel event parsing, device switching,
   transcript dedup, and tool-call queuing. Extract `useRTCConnection`,
   `useAudioInputDevices`, `useVoiceTranscripts`. Heavy ref usage → consider a
   reducer/state machine.

3. **`lib/sparks/contracts.ts` (1,277 lines)** — types + validators + normalizers
   for all 6 spark types in one file. Split per type (`contracts/quiz.ts`, etc.)
   with a barrel export.

4. **`components/studi-chat/MessageRenderer.tsx` (1,220 lines)** — mixes part-parsing,
   activity derivation, markdown/KaTeX rendering, and spark embedding. Extract
   `MessageActivity.tsx`, `MessageText.tsx`, and a `useMessageActivity` hook.

5. **`components/StudiChat.tsx` (924 lines)** — orchestrator mixing send/upload,
   voice plumbing, mobile gestures, spark-panel resize, and the paywall banner.
   Extract `useMessageSending`, `useMobileResponsive`, `useSparkResizing`, and a
   `PaywallBanner` component.

6. **`components/landing/LandingPage.tsx` (831 lines)** — one component for the
   whole marketing page. Split into `LandingHeader`, `LandingHero`, `FaqSection`,
   `FeaturesGrid`, `LandingFooter`.

7. **`app/globals.css` (3,703 lines)** — workable, but consider splitting per concern
   (tokens / landing / scenes / chat) and `@import`-ing.

---

## 7. Dead code & unnecessary files

### 7a. The Labs feature is gone but its baggage remains
Labs (CodeSandbox-backed coding sandboxes) was removed from the active code — there
is **no `labs.ts`, `labTools.ts`, or `labIde.ts`**, and no `CSB_*` usage outside
`schema.ts`. Leftovers you can delete:

- **`codesandbox/templates/` — 270 tracked files.** Entirely orphaned (template
  scaffolds for the removed Labs feature). Biggest single cleanup. Verify nothing
  in your deploy pipeline references it, then delete.
- **Vestigial schema fields**: `billingUsagePeriods.labSessionCount`,
  `labActiveSeconds`, `labEstimatedCostUsd`, `lastLabActivityAt`
  (`schema.ts:86-90`) and the `"lab_tool"` value in `telemetryEvents.source`
  (`schema.ts:137`). Safe to drop once you confirm no historical rows need them.

### 7b. Plan mode is gone too
No `plans.ts` / `planActions.ts`; only a vestigial `"plan_tool"` value in the
`telemetryEvents.source` enum (`schema.ts:138`) and a reference in `telemetry.ts`.

### 7c. Confirmed dead exports
- **`updateThreadTitle`** (`convex/chat.ts:516`) — internalMutation, never called
  anywhere. Title is set in `createThreadRecord` and inline in `sendMessage`.
- **`chatActions.sendMessage`** (`convex/chatActions.ts:87`) — a redundant action
  wrapper; the client calls the `api.chat.sendMessage` mutation directly. Remove
  the wrapper.
- **`backfillThreadActivityForCurrentUser`** (`convex/chat.ts:91`) — one-time
  migration mutation, not wired to any UI. Keep only if migration is still pending.

### 7d. Scratch/binary assets tracked in git (not needed for the app)
- `current-plan-ui.png`, `plan-intake-panel.png`, `plan-intake-top.png` (~1.9 MB,
  root) — screenshots of the removed plan UI.
- `ui-refrences/` — 7 inspiration images (note the typo'd folder name).
- `.playwright-mcp/` — 14 captured test screenshots.
- `changes.md`, `codex-audit.md` — working notes (codex-audit.md's findings are
  partly addressed; treat as historical).

Consider moving these to a `docs/` or untracking them (add to `.gitignore`).

### 7e. Documentation drift (fix these)
- **`README.md`** still documents `convex/plans.ts`, `planActions.ts`, `labs.ts`,
  `labTools.ts`, `labIde.ts` and `csb:templates:*` / `agentic:*` scripts that
  **don't exist** in `package.json` or the tree.
- **`AGENTS.md`** documents a **"codi" agent** and the labs files — neither exists.
  Only `studi` and `shru` are real.
- Update both to match the current studi/shru + no-labs/no-plans reality.

---

## 8. Things that look unused but are NOT (don't delete)

- `proxy.ts` — this *is* the Clerk auth middleware (Next.js 16's renamed
  `middleware.ts`). Loaded by convention, so grep finds no imports. Keep it.
- `*.vitest.tsx` / `*.test.ts` files — real tests.
- `lib/**/generated.ts` — generated from `prompts/`; don't hand-edit, run
  `bun run prompts:sync`.
- `convex/_generated/` — Convex codegen output.
- `playground.ts` — debugging tool, intentionally kept.

---

## 9. Quick cleanup checklist

- [ ] Delete `codesandbox/templates/` (270 files) after confirming deploy doesn't use it
- [ ] Delete root plan screenshots + untrack `ui-refrences/`, `.playwright-mcp/`
- [ ] Remove `updateThreadTitle` and the `chatActions.sendMessage` wrapper
- [ ] Drop vestigial lab/plan schema fields + telemetry enum values
- [ ] Rewrite README.md and AGENTS.md to match current reality (studi/shru, no labs, no plans)
- [ ] (Bigger) Split `convex/sparks/tools.ts` and `useVoiceSession.ts`
</content>
