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
PORT=3030 bun run dev:frontend
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

## Interpret auth evidence honestly

The signed-out route-protection test proves that a learner reaches an operable Clerk identifier form. It does not prove an authenticated Studi session. Keep these signals separate:

- If the frontend logs `Clerk: Refreshing the session token resulted in an infinite redirect loop`, treat authenticated coverage as blocked by a Clerk key, target, or stale-session mismatch even if the signed-out form loads.
- An `@clerk/testing` pass and a Clerk Agent Task pass exercise different session paths. Report each result independently; one must not replace the other.
- If Agent Task navigation fails with `page.goto: net::ERR_ABORTED; maybe frame was detached?`, report that exact navigation blocker. Clear target-domain cookies or use a fresh browser context, confirm the publishable and secret keys belong to the same Clerk instance, and rerun before claiming authenticated `/chat` coverage.
- A passing signed-out or authenticated test against local does not clear a production Clerk or Cloudflare blocker. Run the same focused check against the intended target and name that target in the report.

## Convex per-agent backend

For an isolated backend per worktree, use the installed Convex CLI's project-local deployment mode. Convex 1.32 stores this deployment's state under `.convex/local/default`, so each worktree gets separate data without mutating the shared cloud dev deployment. In the first terminal:

```bash
bun install
bunx convex dev --configure existing --team team-slug --project project-slug --dev-deployment local
```

Keep this terminal running. The local backend is a child of `convex dev` and stops when that command exits. The CLI writes the selected local deployment URL to this worktree's ignored `.env.local`; if the initial push reports a missing deployment variable, its watcher remains available to retry after the variable changes.

In a second terminal, from the same worktree, seed required backend variables one at a time with the supported `env set NAME value` command:

```bash
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-clerk-domain.example
```

Wait for the first terminal to report a successful sync, leave it running, and start only the frontend in the second terminal:

```bash
PORT=3030 bun run dev:frontend
```

This local deployment is appropriate for isolated application and browser testing where external cloud-only integrations are not required. It is not evidence for Convex webhooks, production configuration, or cloud-provider behavior. A cloud-isolated preview requires a separately provisioned Convex Preview Deploy Key; the installed CLI cannot mint deployment tokens from this repo.
