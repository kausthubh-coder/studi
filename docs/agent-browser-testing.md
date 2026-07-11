# Agent Browser Testing

This is the supported path for agents that need to test authenticated Studi routes without manual Clerk login loops.

## Clerk browser auth

Use a dedicated Clerk dev-instance test user. Prefer an email containing `+clerk_test`, for example `studi-agent+clerk_test@example.com`, so Clerk suppresses test email delivery.

Required local env for the default Playwright path:

```bash
CLERK_SECRET_KEY=...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=...
NEXT_PUBLIC_CONVEX_URL=...
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com
```

Run:

```bash
PORT=3030 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3030 bun run test:e2e:auth
```

The default mode uses `@clerk/testing` to sign in by email through Clerk's Backend API, then opens `/chat` and verifies the protected composer.

## Codex Browser Use

This is the human-like browser path. Start Studi, create a one-time Clerk Agent Task URL, then open that URL in Codex Browser Use.

```bash
PORT=3030 bun run dev
```

In another terminal:

```bash
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
STUDI_AGENT_BASE_URL=http://127.0.0.1:3030 \
bun run browser:auth-url
```

Open the printed URL with Browser Use. Clerk will create a real browser session for the test user and redirect to `/chat`, so the agent can click, type, inspect Sparks, and report what it actually sees.

## Clerk Agent Tasks Mode

Agent Tasks create the one-time URL above. The same mode can also be used inside the Playwright smoke test.

Use it when the agent needs the task-URL flow specifically:

```bash
E2E_CLERK_AUTH_MODE=agent-task \
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
PORT=3030 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3030 \
bun run test:e2e:auth
```

You can set `E2E_CLERK_USER_ID` instead of `E2E_CLERK_USER_EMAIL`. Keep this scoped to dev/test users only.

## Convex per-agent backend

For local, ephemeral agent work where webhooks and shared defaults are not required:

```bash
bun install
bunx convex dev --once
```

For a cloud dev deployment per agent/worktree, create a fresh dev deployment, mint a deployment-scoped token, seed env, then push once:

```bash
bunx convex deployment create --type=dev --select team-slug:project-slug:dev/$USER-codex/$(basename "$PWD") --expiration "in 5 days"
bunx convex deployment token create agent-token --save-env
bunx convex env set --from-file ./path/to/.env.agent
bunx convex dev --once
```

That keeps agent tests away from the shared dev deployment while still giving the browser a real Convex URL.
