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
- `--saveSceneHtml` save successful scene spark HTML files to `.tmp/agent-lab/scenes/<runId>/`
- `--sceneOutDir <path>` choose a custom output directory for scene HTML (implies `--saveSceneHtml`)
- `--expectTools create_lab,run,glob` fail assertions if expected tools were not called
- `--failOnToolError` set process exit to non-zero when any tool fails

When a scene file is saved, the CLI prints a ready-to-run browser test command, for example:

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

For a deeper walkthrough:

```bash
bun run agentic:test suite --file agentic-testing/suites/lab-react-demo.json --userId dev-user
```

Notes:

- Tracing is local-only: artifacts are written under `.tmp/agent-lab/`.
- No additional Convex tables or HTTP routes are required for CLI diagnostics.

## Model Comparison (Spark Scene)

Use this to compare model speed and spark output quality across the same prompts.

```bash
bun run agentic:compare --models "anthropic/claude-sonnet-4.6,x-ai/grok-code-fast-1,x-ai/grok-4.1-fast,google/gemini-3-flash-preview,google/gemini-2.5-flash" --prompt "Create a derivative tangent-line scene with draggable point and secant-to-tangent intuition." --prompt "Create a projectile-motion physics scene with angle/speed sliders and trajectory." --repeats 1
```

What it does:

- updates `SPARK_WORKER_SCENE_MODEL` per model during the run (and restores it afterward)
- runs `agentic:test run` for each model+prompt combination
- saves generated scene HTML files for manual inspection
- writes a consolidated report JSON with latency + quality heuristics

Optional flags:

- `--scope both` also sets `OPENROUTER_MODEL` to the tested model for full pipeline comparison
- `--context` include prompt context snapshots in each run artifact
- `--debugRaw` include raw playground message payloads
