# Studi Testing Runbook

Use `bun` and `bunx` for every command.

This file covers two testing styles:

- Agent Browser Use: Codex opens a real browser session, clicks around, and reports what it sees.
- Programmatic testing: Vitest, Convex tests, Playwright, lint, and build checks.

## Required Auth Principle

Do not bypass Studi auth in application code for tests. Use a dedicated Clerk test user and Clerk's supported testing/session tools.

Use a test user such as:

```bash
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com
```

For all authenticated browser testing, `CLERK_SECRET_KEY` must match the Clerk instance used by the target app.

## Local Agent Browser Use

Use this when Codex Browser Use should test the local app like a signed-in user.

Start Studi locally:

```bash
PORT=3030 bun run dev
```

In another terminal, create a one-time Clerk Agent Task URL:

```bash
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
STUDI_AGENT_BASE_URL=http://127.0.0.1:3030 \
bun run browser:auth-url
```

Open the printed URL with Codex Browser Use. It should redirect to:

```text
http://127.0.0.1:3030/chat
```

The agent can then click around, send messages, inspect Sparks, check settings, and report visible behavior.

## Deployed Agent Browser Use

Use this when Codex Browser Use should test production, staging, or a Vercel preview.

Production:

```bash
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
STUDI_AGENT_BASE_URL=https://www.getstudi.com \
bun run browser:auth-url
```

Vercel preview or staging:

```bash
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
STUDI_AGENT_BASE_URL=https://your-preview-url.vercel.app \
bun run browser:auth-url
```

Open the printed URL with Codex Browser Use. It should redirect to `/chat` on the deployed target.

Important deployed caveats:

- `CLERK_SECRET_KEY` must belong to the same Clerk instance used by that deployed target.
- Use a dedicated test user only.
- Do not use a real learner account for agent testing.
- If Cloudflare, Clerk, or Vercel blocks the browser, report the exact blocker text.

## Manual Production Browser Handoff

Use this when the human wants Codex to open a real production browser window, log in as the dedicated production test user, and then hand control back to the human for exploratory testing or process notes.

This is not a fake auth bypass. It creates a short-lived Clerk sign-in token for the dedicated test user, opens that token URL in the system browser, then opens production `/chat`. Do not print the token URL. Delete temp files when done.

```bash
tmp_env="$(mktemp -t studi-prod-env.XXXXXX)"
trap 'rm -f "$tmp_env"' EXIT

bunx vercel env pull "$tmp_env" --environment=production --yes

bun --env-file="$tmp_env" --silent - <<'TS'
import { createClerkClient } from "@clerk/backend";

const email = "studi-agent+clerk_test@example.com";
const baseUrl = "https://www.getstudi.com";
const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error("production CLERK_SECRET_KEY missing");

const client = createClerkClient({ secretKey, apiUrl: process.env.CLERK_API_URL });
const users = await client.users.getUserList({ emailAddress: [email], limit: 1 });
const user = (Array.isArray(users) ? users : users.data)?.[0];
if (!user) throw new Error(`Missing production Clerk test user: ${email}`);

const signInToken = await client.signInTokens.createSignInToken({
  userId: user.id,
  expiresInSeconds: 15 * 60,
});

Bun.spawnSync(["open", signInToken.url]);
await new Promise((resolve) => setTimeout(resolve, 6_000));
Bun.spawnSync(["open", `${baseUrl}/chat`]);

console.log("opened production Studi chat in the system browser");
console.log("test user email:", email);
console.log("test user id prefix:", `${user.id.slice(0, 8)}...`);
TS
```

After opening the browser, verify before claiming signed-in coverage:

- The visible URL is `https://www.getstudi.com/chat`.
- The composer is visible.
- Settings shows the account as `studi-agent+clerk_test@example.com`.

Known production-test-account caveat: if Settings shows `Free prompts left: 0` or chat shows `You've used your free onboarding chats. Choose a plan to keep going.`, the login still worked, but message-send and Spark-generation testing are blocked until the dedicated test account is reset or placed on a testable plan.

## Dev Test Billing Reset

Use this only for the dedicated Clerk dev/test account when browser verification is blocked by exhausted free onboarding prompts in a non-production Convex deployment.

```bash
bun run billing:reset-dev-test-user
```

The helper defaults to `studi-agent+clerk_test@example.com`, refuses non-`+clerk_test` emails, and refuses `CONVEX_DEPLOYMENT` values that are not `dev:*`. To use another allowlisted Clerk test email:

```bash
bun run billing:reset-dev-test-user -- --email=another+clerk_test@example.com
```

The Convex mutation also verifies that the allowlisted email is paired with the exact Clerk user id before resetting usage. It clears only that dedicated dev user's billing counters plus Code Spark reservation/operational-usage rows, so the cumulative monthly provider cap is reproducible across repeated test runs. Set one of these Convex env values in dev:

```bash
DEV_TEST_CLERK_USER_ID=user_...
DEV_TEST_BILLING_RESET_TARGETS=studi-agent+clerk_test@example.com=user_...
```

## Sandbox Worktree Auth Verification

Use this before claiming signed-in browser coverage from any sandbox or git worktree, especially Code Spark / Code Challenge worktrees.

Why this matters: a feature sandbox can be green on unit/build/runtime checks while still missing the newer Clerk browser-auth testing lane from the main checkout. In that case the blocker is the sandbox test harness, not necessarily the feature runtime.

For every new sandbox worktree:

- Create it from a checkout or branch that already contains the current auth-testing lane.
- Keep `test.md` in the sandbox root.
- Run the prerequisite check below before browser testing.
- Make sure the app target and auth env belong to the same Clerk/Convex deployment. Do not mix production Clerk secrets with a local app using different public Clerk or Convex values.
- Use a fresh browser context or clear the target domain cookies if a previous Clerk session is stuck.

For any preexisting sandbox worktree, run this from the sandbox root before trying Browser Use or Playwright auth:

```bash
bun --silent - <<'TS'
import { existsSync, readFileSync } from "node:fs";

const requiredFiles = [
  "test.md",
  "docs/testing.md",
  "docs/agent-browser-testing.md",
  "scripts/create-clerk-agent-task.ts",
  "tests/e2e/authenticated-chat.spec.ts",
  "tests/e2e/helpers/clerk-auth.ts",
];

const missingFiles = requiredFiles.filter((file) => !existsSync(file));
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const scripts = packageJson.scripts ?? {};
const missingScripts = ["browser:auth-url", "test:e2e:auth"].filter(
  (script) => !scripts[script],
);

console.log("missing auth files:", missingFiles.length ? missingFiles : "(none)");
console.log("missing auth scripts:", missingScripts.length ? missingScripts : "(none)");

if (missingFiles.length || missingScripts.length) {
  process.exitCode = 1;
}
TS
```

If that check fails, fix the sandbox before doing browser verification:

- Preferred: recreate or rebase the sandbox from the current checkout that contains the auth-testing lane.
- Acceptable for a short-lived verifier sandbox: copy in the missing auth-testing files and package scripts from the current checkout, then run `bun install` if dependencies or `bun.lock` changed.
- Do not report Code Spark, Spark Run, or Spark Test as browser-blocked by runtime code until this auth lane exists and the env is matched.

For local sandbox auth testing, use the local app target:

```bash
PORT=3030 bun run dev
```

Then, in another terminal from the same sandbox root:

```bash
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
STUDI_AGENT_BASE_URL=http://127.0.0.1:3030 \
bun run browser:auth-url
```

Open the printed URL with Browser Use. It should land on:

```text
http://127.0.0.1:3030/chat
```

For programmatic local auth from the same sandbox root:

```bash
E2E_CLERK_AUTH_MODE=agent-task \
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
PORT=3030 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3030 \
STUDI_AGENT_BASE_URL=http://127.0.0.1:3030 \
bun run test:e2e:auth
```

If a sign-in-token fallback or Agent Task creates an infinite redirect/session loop, treat it as an auth/env/session mismatch until proven otherwise:

- Confirm `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are from the same Clerk instance.
- Confirm `NEXT_PUBLIC_CONVEX_URL` points at the Convex deployment expected by that app instance.
- Confirm `CLERK_API_URL`, if set, belongs with the same Clerk instance.
- Clear cookies or use a fresh browser context for `getstudi.com`, `accounts.getstudi.com`, and local app origins.
- Record the exact redirect URL or Clerk blocker text.

For Code Spark browser claims, "real signed-in browser coverage" means all of these happened in the same browser session:

- The browser landed on authenticated `/chat` as the dedicated test user.
- The test user could send the prompt that creates the Code Spark. If the account is out of prompts, report quota-blocked instead.
- The Code Spark appeared from a real chat-created assistant response.
- The tester clicked `Run` and `Test` in the visible browser UI.
- The report includes visible output, visible errors, console/network issues, and screenshots or an artifact path.

## Programmatic Local Testing

Fast focused checks:

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

Run a single unit test file:

```bash
bunx vitest run --config vitest.config.ts path/to/file.test.ts
```

Run a single Convex test file:

```bash
bunx vitest run --config vitest.convex.config.ts convex/chat.test.ts
```

Prompt changes:

```bash
bun run prompts:sync
bun run prompts:check
```

## Programmatic Local Browser Testing

### Live Code Spark provider flow (explicit opt-in)

The real chat-created Code Spark test is intentionally excluded from
`bun run test:e2e` and `bun run test:all`. Those default commands keep public,
auth, static, and mocked coverage cheap; they do not send the Code Spark prompt
or allocate a provider sandbox.

Run the live flow only when provider cost and shared test-account mutation are
intentional:

```bash
E2E_CODE_SPARK_PROVIDER_EXPECTED=vercel_sandbox \
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
PORT=3030 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3030 \
bun run test:e2e:code-spark:real
```

The dedicated script sets `E2E_CODE_SPARK_REAL_CHAT=1`. The spec also checks
the Clerk browser prerequisites documented above and requires
`E2E_CODE_SPARK_PROVIDER_EXPECTED=vercel_sandbox`. That provider variable is a
non-secret operator opt-in; it does not configure Convex or supply provider
credentials. The rendered Code Spark must also expose the server-derived
`data-runtime-provider="vercel_sandbox"` value, so `local_fake` cannot satisfy
the live-provider assertion. Before setting the opt-in, verify the target Convex deployment
has the Vercel Sandbox configuration described in **Code Spark Vercel Sandbox
Auth** below. A missing prerequisite skips before browser fixtures, prompt send,
or sandbox allocation and names only the missing environment variables.

The visual redesign flow is independently opt-in and creates its own fresh
challenge. It requires a provider-backed Run to pass, the initial visible Test
to fail, a real Monaco edit to save, the repaired Test to pass, the terminal
result to switch to `Changes not run` after the edit instead of showing stale
output, and the expanded mobile layout to avoid horizontal overflow:

```bash
E2E_CODE_SPARK_PROVIDER_EXPECTED=vercel_sandbox \
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
PORT=3030 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3030 \
bun run test:e2e:code-spark:visual
```

Both live Code Spark specs carry `@live-code-spark-provider`, so neither may
allocate a provider sandbox from `bun run test:e2e` or `bun run test:all`.

The live test contract remains exact:

- authenticate the dedicated Clerk test user on `/chat`;
- send the prompt that requests a tiny TypeScript Code Spark;
- wait for the chat-created Code Spark to become visible;
- require the server-derived runtime provider to equal `vercel_sandbox`;
- click the visible `Run` and `Test` controls;
- require each completed action to expose
  `data-runtime-execution-provider="vercel_sandbox"` plus the matching
  `data-runtime-execution-kind` (`run` or `test`), so configured-provider
  metadata alone cannot satisfy the live execution claim;
- capture screenshots before the prompt, after generation, after Run, and after
  Test under `.artifacts/thread-browser/20260709-real-chat-codespark/`;
- fail on quota, Spark-generation, provider, runtime, page, or relevant console
  errors instead of replacing the live flow with mocked evidence.

For a direct Playwright invocation, both the tag and environment guard still
apply:

```bash
E2E_CODE_SPARK_REAL_CHAT=1 \
E2E_CODE_SPARK_PROVIDER_EXPECTED=vercel_sandbox \
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
bunx playwright test tests/e2e/code-spark-real-chat.spec.ts \
  --grep @live-code-spark-provider
```

Public route Playwright smoke:

```bash
PORT=3030 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3030 bun run test:e2e
```

Authenticated `/chat` Playwright smoke:

```bash
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
PORT=3030 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3030 \
bun run test:e2e:auth
```

To force Clerk Agent Tasks mode inside the programmatic auth smoke:

```bash
E2E_CLERK_AUTH_MODE=agent-task \
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
PORT=3030 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3030 \
bun run test:e2e:auth
```

## Programmatic Deployed Browser Testing

Use `PLAYWRIGHT_BASE_URL` for the deployed target.

Production public-route smoke:

```bash
PLAYWRIGHT_BASE_URL=https://www.getstudi.com bun run test:e2e
```

Production authenticated smoke:

```bash
E2E_CLERK_AUTH_MODE=agent-task \
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
PLAYWRIGHT_BASE_URL=https://www.getstudi.com \
STUDI_AGENT_BASE_URL=https://www.getstudi.com \
bun run test:e2e:auth
```

Preview authenticated smoke:

```bash
E2E_CLERK_AUTH_MODE=agent-task \
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
PLAYWRIGHT_BASE_URL=https://your-preview-url.vercel.app \
STUDI_AGENT_BASE_URL=https://your-preview-url.vercel.app \
bun run test:e2e:auth
```

## Reproducible Production Deployment Smoke

Use this for `https://www.getstudi.com` after a production deploy. Production uses live Clerk, so do not rely on `.env.local` if it contains test-mode Clerk keys. Pull production env into a temp file, use a dedicated test user, and delete the temp file when done.

Prerequisites:

- Vercel CLI is logged in and this checkout is linked to the production Vercel project.
- Production Vercel env contains `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_CONVEX_URL`.
- Production Convex env contains `CLERK_JWT_ISSUER_DOMAIN`.
- Use only `studi-agent+clerk_test@example.com` or another dedicated test account. Do not use a real learner account.

First, run the public/protection smoke:

```bash
PLAYWRIGHT_BASE_URL=https://www.getstudi.com \
bun run test:e2e tests/e2e/public-routes.spec.ts tests/e2e/chat-protection.spec.ts
```

Ensure the production Clerk test user exists. This command is idempotent and prints only safe metadata, not secret values:

```bash
tmp_env="$(mktemp -t studi-prod-env.XXXXXX)"
trap 'rm -f "$tmp_env"' EXIT

bunx vercel env pull "$tmp_env" --environment=production --yes

bun --env-file="$tmp_env" --silent - <<'TS'
import { createClerkClient } from "@clerk/backend";

const email = "studi-agent+clerk_test@example.com";
const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error("production CLERK_SECRET_KEY missing");

const client = createClerkClient({ secretKey, apiUrl: process.env.CLERK_API_URL });
const existing = await client.users.getUserList({ emailAddress: [email], limit: 1 });
const existingUser = (Array.isArray(existing) ? existing : existing.data)?.[0];

let user = existingUser;
let created = false;
if (!user) {
  user = await client.users.createUser({
    emailAddress: [email],
    firstName: "Studi",
    lastName: "Agent Test",
    skipPasswordRequirement: true,
    skipLegalChecks: true,
    privateMetadata: {
      purpose: "production_e2e_smoke",
      owner: "codex",
      createdBy: "studi-testing-runbook",
    },
    publicMetadata: { role: "test_user" },
  });
  created = true;
}

console.log("production test user created:", created);
console.log("production test user exists:", Boolean(user));
console.log("production test user id prefix:", user?.id ? `${user.id.slice(0, 8)}...` : "missing");
TS
```

Try the preferred Clerk Agent Tasks auth smoke:

```bash
tmp_env="$(mktemp -t studi-prod-env.XXXXXX)"
trap 'rm -f "$tmp_env"' EXIT

bunx vercel env pull "$tmp_env" --environment=production --yes

E2E_CLERK_AUTH_MODE=agent-task \
E2E_CLERK_USER_EMAIL=studi-agent+clerk_test@example.com \
PLAYWRIGHT_BASE_URL=https://www.getstudi.com \
STUDI_AGENT_BASE_URL=https://www.getstudi.com \
bun --env-file="$tmp_env" run test:e2e:auth
```

If Agent Tasks creates successfully but the browser lands back on Clerk sign-in instead of authenticated `/chat`, record that as an Agent Tasks handshake blocker and use this Clerk sign-in-token fallback to complete the deployed smoke. This is still a real Clerk session for the dedicated test user.

```bash
tmp_env="$(mktemp -t studi-prod-env.XXXXXX)"
trap 'rm -f "$tmp_env"' EXIT

bunx vercel env pull "$tmp_env" --environment=production --yes

bun --env-file="$tmp_env" --silent - <<'TS'
import { createClerkClient } from "@clerk/backend";
import { chromium, expect } from "@playwright/test";

const baseUrl = "https://www.getstudi.com";
const email = "studi-agent+clerk_test@example.com";
const smokeMessage = "Production smoke test: ask me one question about derivatives.";

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error("production CLERK_SECRET_KEY missing");

const client = createClerkClient({ secretKey, apiUrl: process.env.CLERK_API_URL });
const users = await client.users.getUserList({ emailAddress: [email], limit: 1 });
const user = (Array.isArray(users) ? users : users.data)?.[0];
if (!user) throw new Error(`Missing production Clerk test user: ${email}`);

const signInToken = await client.signInTokens.createSignInToken({
  userId: user.id,
  expiresInSeconds: 15 * 60,
});

const browser = await chromium.launch({ headless: false, timeout: 15_000 });
const page = await browser.newPage();
const consoleErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text().slice(0, 240));
});

try {
  await page.goto(signInToken.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(5_000);
  await page.goto(`${baseUrl}/chat`, { waitUntil: "domcontentloaded", timeout: 30_000 });

  await expect(page).toHaveURL(/\/chat(?:[/?#]|$)/, { timeout: 15_000 });
  const composer = page.locator(
    'textarea[placeholder="What would you like to learn?"], textarea[placeholder="Ask a follow-up..."]',
  );
  await expect(composer).toBeVisible({ timeout: 15_000 });

  await composer.fill(smokeMessage);
  const send = page.getByRole("button", { name: "Send message" });
  await expect(send).toBeEnabled({ timeout: 10_000 });
  await send.click();

  await expect(page.getByText(smokeMessage, { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(25_000);

  const bodyText = await page.locator("body").innerText({ timeout: 5_000 });
  const assistantLikelyResponded = /derivative|slope|rate|change|question/i.test(
    bodyText.replace(smokeMessage, ""),
  );
  const visibleError =
    bodyText.match(/I hit a snag|failed|try again|used your free|Choose a plan|too quickly/i)?.[0] ??
    null;

  console.log("target:", `${baseUrl}/chat`);
  console.log("signed-in chat loaded:", /\/chat(?:[/?#]|$)/.test(page.url()));
  console.log("user message visible:", bodyText.includes(smokeMessage));
  console.log("assistant likely responded or started:", assistantLikelyResponded);
  console.log("visible error:", visibleError ?? "(none)");
  console.log("console errors:", JSON.stringify(consoleErrors, null, 2));
} finally {
  await browser.close();
}
TS
```

Pass means all of these are true:

- The browser lands on `https://www.getstudi.com/chat`.
- The composer is visible for the dedicated production Clerk test user.
- The smoke message is visible in the thread.
- Studi starts or returns an assistant response.
- No visible app error appears.

## Convex Notes

For local app testing:

```bash
PORT=3030 bun run dev
```

For a local agent backend:

```bash
bun install
bunx convex dev --once
```

For isolated cloud dev deployments, use Convex Agent Mode and seed the required environment variables before `bunx convex dev --once`.

If `convex dev` fails with schema validation against shared dev rows, do not call the app broken. Record the exact table, field, object, and validator message.

## Code Spark Vercel Sandbox Auth

Production Convex must use explicit Vercel token auth:

- `CODE_SPARK_PROVIDER`
- `CONVEX_DEPLOYMENT`
- `VERCEL_TOKEN`
- `VERCEL_TEAM_ID`
- `VERCEL_PROJECT_ID`

Convex dev can use Vercel OIDC only when the runtime is clearly marked as dev:

- `CONVEX_DEPLOYMENT`
- `CODE_SPARK_ALLOW_DEV_VERCEL_OIDC`
- `VERCEL_OIDC_TOKEN`

If a production Convex marker is present, the dev OIDC override is ignored and explicit Vercel token auth is required.

## Reporting Results

Always report:

- command run
- target: local, preview, staging, or production
- pass, fail, skip, or blocked
- exact blocker text when blocked
- whether browser coverage was real Browser Use, Playwright, or fallback-only
- whether authenticated `/chat` actually loaded with a real Clerk session

Do not claim signed-in browser coverage unless the browser really landed on `/chat` as the test user.
