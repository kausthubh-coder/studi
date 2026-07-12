# Studi Project Guide

## Project

- Purpose: build an intuition-first, one-on-one AI tutor that shortens time to an aha moment through questions, micro-problems, and interactive Sparks.
- Audience: learners using auth, chat, Sparks, billing, settings, and the waitlist.
- Current status: Code Spark supports small inline TypeScript/JavaScript and Python workspaces or challenges. Labs remain a separate future persistent-IDE surface.

## Runbook

- Install: `bun install`
- Run: `PORT=3030 bun run dev`
- Test: `bun run test`
- Full code gate: `bun run check`
- Build: `bun run build`
- Browser verification: follow `test.md`; real Code Spark provider tests are explicit opt-in commands.
- Prompt changes: edit `prompts/`, then run `bun run prompts:sync` and `bun run prompts:check`.

## Architecture

- App: Next.js App Router in `app/` with the chat shell in `components/StudiChat.tsx`.
- Chat rendering: `components/studi-chat/` renders persisted Convex Agent messages and Spark tool results.
- Sparks: contracts and validation live in `lib/sparks/`; renderers live in `components/sparks/`; generation tools live in `convex/sparks/`.
- Code Spark: UI in `components/sparks/scenes/CodeSparkScene.tsx`; persistence/admission in `convex/codeSparks.ts`; execution action in `convex/codeSparkActions.ts`; provider adapter in `convex/codeSparkRuntime.ts`.
- Data/state: Convex schema and functions live in `convex/`; Clerk supplies user identity.
- External services: Clerk, Convex, Vercel, Vercel Sandbox, FreeModel's Anthropic-compatible API, OpenRouter/OpenAI, Desmos, PostHog, and Tally. Environment variable names and safe setup checks are documented in `test.md`; never commit values.

## Conventions

- Use `bun` and `bunx` for project commands.
- Use test-driven development for behavior changes and close the loop with browser verification for operable surfaces.
- Preserve Studi's warm visual system, clear status language, 44px touch targets, and usable inline/mobile layouts.
- Challenge tests are learner-visible success criteria with concealed implementation details, not a cryptographic secrecy boundary.
- `local_fake` is test-only evidence. Production Code Spark claims require the opt-in real-provider flow with `vercel_sandbox`.
- Never commit `.env*`, auth URLs, tokens, raw provider logs, browser session state, or unredacted transcripts.

## Oracle Workspace

- Plans: `.artifacts/plans/`
- Run ledgers: `.artifacts/runs/`
- Designs: `.artifacts/designs/`
- Conclusions: `.artifacts/conclusions/`
- Sandboxes: `.sandbox/`
- Testing guide: `test.md`

## Known Gaps

- Code Spark runtime support is intentionally limited to TypeScript/JavaScript and Python in this release.
- Persistent multi-step coding projects belong in the future Labs surface, not Code Spark.
- Production behavior must be reverified after every backend or frontend promotion; local provider proof is not production proof.

## Last Oracle Update

- 2026-07-10: Code Spark release loop documented with local code, auth, real-provider, expanded, and mobile verification lanes.
