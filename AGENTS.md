# AGENTS.md

Operational guide for coding agents working in this repository.

## Scope and precedence

- This file applies to the entire repository root.
- Follow direct user instructions first, then this file.
- Reuse existing patterns in the codebase before introducing new ones.

## Project snapshot

- Stack: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4.
- Backend/runtime intent: Convex + Clerk.
- Package manager policy: use `bun` and `bunx` (not `npm`/`npx`).
- App source roots: `app/`, `components/`.
- Convex source is expected under `convex/` (may be generated/added later).
- Reference-only legacy/examples live in `examples/`.

## Repository layout

- `app/`: Next.js App Router pages/layouts.
- `components/`: shared React components/providers.
- `convex/`: Convex functions/schema/generated API (when present).
- `.cursor/rules/convex_rules.mdc`: Convex-specific coding rules.
- `examples/shru/`: old Studi version (reference only unless asked).
- `examples/agent-tldraw/`, `examples/chat-tldraw/`: tldraw references.

## Required local tooling

- Bun (primary package manager and script runner).
- Node.js compatible with Next.js 16/React 19 toolchain.
- Convex CLI via `bunx convex` when needed.

## Install and run commands

- Install deps: `bun install`
- Start dev stack: `bun run dev`
- Start frontend only: `bun run dev:frontend`
- Start backend only: `bun run dev:backend`
- Build app: `bun run build`
- Start production server: `bun run start`
- Lint: `bun run lint`

## Test commands

- Current status: no first-party test runner config found yet.
- Baseline test command (Bun native): `bun test`
- Run one Bun test file: `bun test path/to/file.test.ts`
- Run one Bun test by name: `bun test --test-name-pattern "partial name"`
- If Vitest is added, run all: `bunx vitest run`
- If Vitest is added, single file: `bunx vitest run path/to/file.test.ts`
- If Vitest is added, single test: `bunx vitest run -t "test name"`
- If Jest is added, run all: `bunx jest`
- If Jest is added, single file: `bunx jest path/to/file.test.ts`
- If Jest is added, single test: `bunx jest -t "test name"`
- If Playwright is added, run all: `bunx playwright test`
- If Playwright is added, single spec: `bunx playwright test tests/e2e/foo.spec.ts`
- If Playwright is added, single test title: `bunx playwright test -g "test name"`

## Linting/formatting baseline

- ESLint uses Next core-web-vitals + Next TypeScript + Convex recommended rules.
- `convex/_generated` is ignored by ESLint.
- Prettier config is minimal (`.prettierrc` is `{}`), rely on defaults.
- Use consistent formatting produced by Prettier defaults.
- Avoid manual style churn unrelated to task.

## Package manager policy (important)

- Use `bun` for install, scripts, and dependency management.
- Use `bunx` for ad-hoc CLIs (`convex`, `playwright`, etc.).
- Do not introduce `npm`/`npx` commands in docs, scripts, or PR notes.
- Keep existing script names in `package.json`; execute them with `bun run`.

## Import conventions

- Prefer absolute imports with alias `@/` when configured and readable.
- Keep imports grouped: external packages first, then internal modules.
- Avoid unnecessary relative traversals when `@/` works.
- Import types with `import type` where appropriate.
- Do not leave unused imports.

## TypeScript conventions

- `strict` mode is enabled; keep code fully type-safe.
- Avoid `any`; prefer precise types, unions, and generics.
- Use explicit types for public function params/returns when non-trivial.
- Prefer `Readonly` and narrow literal types where useful.
- Use `as const` for discriminated unions and fixed literals.
- Do not bypass types with broad assertions unless justified.

## Naming conventions

- Components: PascalCase (`ConvexClientProvider`).
- Variables/functions: camelCase.
- Constants: camelCase unless true global constants (then UPPER_SNAKE_CASE).
- File names in Next routes follow framework conventions (`page.tsx`, `layout.tsx`).
- Keep names descriptive and domain-oriented (learning/thread/milestone/lab terms).

## React/Next conventions

- Use App Router patterns (`app/` directory).
- Add `"use client"` only when required (hooks, browser APIs, event handlers).
- Prefer server components by default; opt into client components intentionally.
- Keep components focused; extract reusable UI when repeated.
- Use `void` on intentionally unawaited async event handlers.

## Error handling guidelines

- Fail fast on invalid states and missing required data.
- Throw clear, actionable errors on server/backend boundaries.
- In UI code, handle loading/empty/error states explicitly.
- Do not swallow exceptions silently.
- Keep user-visible error messages concise and helpful.

## Convex rules (from `.cursor/rules/convex_rules.mdc`)

- Use new Convex function syntax with object-form `query/mutation/action`.
- Always define `args` and `returns` validators on Convex functions.
- Use `v.null()` when returning null/no value.
- Use `query/mutation/action` for public API functions.
- Use `internalQuery/internalMutation/internalAction` for private internals.
- Register HTTP routes in `convex/http.ts` using `httpAction`.
- Use `api` for public function refs and `internal` for internal refs.
- Prefer indexes + `withIndex(...)`; do not rely on query `filter` scans.
- Keep schema in `convex/schema.ts` and define indexes intentionally.
- Include indexed fields in index names (e.g. `by_field1_and_field2`).
- Use `Id<"table">` types from generated data model for document IDs.
- Use `ctx.runQuery/runMutation/runAction` with function references only.
- Avoid calling actions from actions unless crossing runtimes is required.
- In actions using Node.js built-ins, add `"use node"` at file top.
- Do not use `ctx.db` directly inside actions.
- For cron jobs, use `crons.interval` or `crons.cron` only.

## Cursor/Copilot rules status

- Cursor rules found: `.cursor/rules/convex_rules.mdc` (included above).
- `.cursorrules` not found.
- `.github/copilot-instructions.md` not found.

## Change hygiene for agents

- Keep edits minimal and scoped to the task.
- Do not modify generated files unless the task explicitly requires it.
- Do not refactor unrelated areas while implementing a focused change.
- Update docs/commands when behavior changes.
- When adding tests, include at least one single-test invocation in notes.

## Quick pre-handoff checklist

- Run lint: `bun run lint`
- Run tests if present: `bun test` (or project-specific runner)
- Build when changing runtime-sensitive code: `bun run build`
- Confirm no accidental `npm`/`npx` usage was introduced.
