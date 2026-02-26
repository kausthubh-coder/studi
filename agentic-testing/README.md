# Agentic Testing

Local CLI harness for backend-only agent testing without the frontend.

Outputs are written to `.tmp/agent-lab/` as JSON artifacts.

## Setup

Set these environment variables:

```bash
CONVEX_URL=...
STUDI_PLAYGROUND_API_KEY=...
```

Issue a Playground API key if needed:

```bash
bunx convex run --component agent apiKeys:issue '{"name":"studi-playground"}'
```

## Single Prompt Run

```bash
bun run agentic:test run --userId dev-user --prompt "Teach me binary search"
```

Useful flags:

- `--newThread` create a fresh thread
- `--threadId <id>` run inside an existing thread
- `--context` fetch prompt context snapshot
- `--verbose` print timeline events live
- `--debugRaw` include raw playground messages in artifact JSON for local tracing
- `--modelLabel <label>` attach a custom model tag for comparisons
- `--profile <balanced|fast|quality>` resolve the agent name from model profile
- `--cheap` shortcut for `--profile fast`
- `--saveSceneHtml` save successful HTML-capable spark files (`scene` + `web_playground`) to `.tmp/agent-lab/scenes/<runId>/`
- `--sceneOutDir <path>` choose a custom output directory for saved HTML spark files (implies `--saveSceneHtml`)
- `--expectTools create_lab,run,glob` fail assertions if expected tools were not called
- `--expectPlanTools start_plan_mode,generate_plan_draft` fail if expected plan tools were not called
- `--failOnToolError` set process exit to non-zero when any tool fails
- `--requirePlan` fail if no plan exists by end of run
- `--expectPlanPhase active` assert final plan phase (`discovery|draft_review|active|completed`)
- `--minPlanProgress 10` assert final plan progress percentage
- `--verifyTelemetry` query Convex telemetry summary for the run thread and assert non-zero usage/events
- `--verifyPosthog` query PostHog for run-linked events and assert baseline events are present
- `--posthogWaitMs 4000` wait before querying PostHog to allow ingestion delay

PostHog verification env vars:

```bash
POSTHOG_PERSONAL_API_KEY=phx_xxx
POSTHOG_PROJECT_ID=12345
POSTHOG_HOST=https://us.i.posthog.com   # optional
```

Notes:

- `--verifyPosthog` checks for `agent_usage_recorded` and one of `agent_reply_completed|agent_reply_failed` in a run time window.
- The CLI queries PostHog directly via HogQL API; it does **not** call MCP.

When an HTML spark file is saved, the CLI prints a ready-to-run browser test command, for example:

```bash
npx agent-browser --allow-file-access open "file:///.../scene.html" && npx agent-browser snapshot -i && npx agent-browser screenshot --full
```

## Suite Run

```bash
bun run agentic:test suite --file agentic-testing/suites/example.json --userId dev-user
```

This runs multiple prompts and writes one suite artifact with:

- per-run timings and tool outcomes
- spark failure counts
- response hash comparisons across repeats
- lab tool usage/failures and assertion failures

## Lab Smoke (Recommended)

```bash
bun run agentic:test suite --file agentic-testing/suites/lab-smoke.json --userId dev-user
```

This validates the end-to-end lab startup path (`create_lab -> run/glob`) on the active deployment.

Telemetry-aware smoke (Convex + PostHog):

```bash
bun run agentic:test suite --file agentic-testing/suites/lab-smoke.json --userId dev-user --verifyTelemetry --verifyPosthog
```

Cross-surface observability smoke (spark + lab + plan):

```bash
bun run agentic:test suite --file agentic-testing/suites/observability-smoke.json --userId dev-user --verifyTelemetry --verifyPosthog
```

For a deeper walkthrough:

```bash
bun run agentic:test suite --file agentic-testing/suites/lab-react-demo.json --userId dev-user
```

Web playground smoke (cheap profile):

```bash
bun run agentic:test suite --file agentic-testing/suites/web-playground-smoke.json --userId dev-user --cheap --saveSceneHtml
```

## Plan Mode Suites

Create and validate draft flow:

```bash
bun run agentic:test suite --file agentic-testing/suites/plan-smoke.json --userId dev-user
```

Iterative revision flow in the same thread:

```bash
bun run agentic:test suite --file agentic-testing/suites/plan-iterate.json --userId dev-user
```

Lab auto-plan path:

```bash
bun run agentic:test suite --file agentic-testing/suites/plan-lab-auto.json --userId dev-user
```

Notes:

- Tracing is local-only: artifacts are written under `.tmp/agent-lab/`.
- No additional Convex tables or HTTP routes are required for CLI diagnostics.

## Model Comparison (Spark Scene)

Use this to compare model speed and spark output quality across the same prompts.

```bash
bun run agentic:compare --profiles "balanced,fast,quality" --prompt "Create a derivative tangent-line scene with draggable point and secant-to-tangent intuition." --prompt "Create a projectile-motion physics scene with angle/speed sliders and trajectory." --repeats 1
```

What it does:

- runs `agentic:test run` for each profile+prompt combination using the profile-specific Playground agent name
- saves generated HTML spark files for manual inspection
- writes a consolidated report JSON with latency + quality heuristics

Optional flags:

- `--scope both` includes both the scene model and agent model in run labels
- `--context` include prompt context snapshots in each run artifact
- `--debugRaw` include raw playground message payloads

## Model Profiles

All model routing now lives in `lib/model-config.ts`.

- change `activeModelProfile` to switch default models used by app/runtime
- use profile-specific Playground agents for CLI testing: `studi`, `studi-fast`, `studi-quality` (the active profile always maps to plain `studi`)
- inspect profile mappings quickly: `bun run agentic:models`
- switch active profile from CLI: `bun run agentic:use-profile --profile fast`
