# Testing Instructions

Use `bun` and `bunx` for every command in this repo.

## Quick Gates

Run the narrowest useful test first, then broaden when the change touches shared behavior.

```bash
bun run test:unit
bun run test:convex
bun run test
bun run lint
bun run build
```

Full local confidence pass:

```bash
bun run check
```

## Focused Tests

Unit tests:

```bash
bunx vitest run --config vitest.config.ts path/to/file.test.ts
```

Convex tests:

```bash
bunx vitest run --config vitest.convex.config.ts convex/chat.test.ts
```

Prompt changes:

```bash
bun run prompts:sync
bun run prompts:check
```

## Browser Tests

Manual Codex Browser Use with auth:

```bash
PORT=3030 bun run dev
```

In another terminal:

```bash
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
STUDI_AGENT_BASE_URL=http://127.0.0.1:3030 \
bun run browser:auth-url
```

Open the printed URL in Codex Browser Use. It should land on authenticated `/chat`.

Public route smoke:

```bash
PORT=3030 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3030 bun run test:e2e
```

Authenticated chat smoke:

```bash
PORT=3030 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3030 bun run test:e2e:auth
```

The auth smoke requires a dedicated Clerk dev/test user:

```bash
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
NEXT_PUBLIC_CONVEX_URL=...
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com
```

For Clerk Agent Tasks mode:

```bash
E2E_CLERK_AUTH_MODE=agent-task \
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
PORT=3030 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3030 \
bun run test:e2e:auth
```

More detail: `docs/agent-browser-testing.md`.

## Convex Dev Setup

For a local agent backend:

```bash
bun install
bunx convex dev --once
```

For normal local app testing:

```bash
PORT=3030 bun run dev
```

If `convex dev` fails with schema validation against shared dev rows, treat that as an environment/data compatibility blocker and record the exact table, field, and validator message before changing schema.

## Reporting Results

Always report:

- command run
- pass/fail/skip
- exact blocker text when blocked
- whether browser coverage was real, skipped, or replaced with a fallback

Do not claim signed-in browser coverage unless `/chat` actually loaded with a real Clerk session.
