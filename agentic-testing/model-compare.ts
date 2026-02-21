import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CompareScope = "scene" | "both";

type CompareOptions = {
  models: string[];
  prompts: string[];
  userId: string;
  repeats: number;
  pollMs: number;
  scope: CompareScope;
  includeContext: boolean;
  debugRaw: boolean;
};

type HtmlMetrics = {
  htmlLength: number;
  controls: number;
  sliders: number;
  handlers: number;
  hasSvgOrCanvas: boolean;
  usesTailwindBrowser: boolean;
};

type TrialResult = {
  model: string;
  prompt: string;
  repeat: number;
  artifactPath?: string;
  totalDurationMs?: number;
  sparkDurationMs?: number;
  sparkFailures?: number;
  sceneFilePath?: string;
  actionResultText?: string;
  html?: HtmlMetrics;
  qualityScore?: number;
  error?: string;
};

type RunArtifactLike = {
  totalDurationMs?: unknown;
  actionResultText?: unknown;
  spark?: {
    failures?: unknown;
    totalDurationMs?: unknown;
  };
  sceneFiles?: Array<{
    filePath?: unknown;
  }>;
};

type CompareReport = {
  runId: string;
  createdAt: string;
  options: CompareOptions;
  previousEnv: {
    OPENROUTER_MODEL: string | null;
    SPARK_WORKER_SCENE_MODEL: string | null;
  };
  trials: TrialResult[];
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(`
Model Compare CLI

Compares spark scene generation speed + output quality across models.

Usage:
  bun agentic-testing/model-compare.ts --models "anthropic/claude-sonnet-4.6,x-ai/grok-code-fast-1" --prompt "Create a derivative tangent scene"

Flags:
  --models <csv>          Required comma-separated model list
  --prompt <text>         Prompt (repeat flag for multiple prompts)
  --userId <id>           User id (default: model-compare-user)
  --repeats <n>           Repeats per model+prompt (default: 1)
  --pollMs <n>            Poll interval ms for agentic:test (default: 250)
  --scope <scene|both>    scene=only SPARK_WORKER_SCENE_MODEL, both=also OPENROUTER_MODEL
  --context               Pass --context to agentic:test runs
  --debugRaw              Pass --debugRaw to agentic:test runs

Output:
  - JSON report: .tmp/agent-lab/model-compare/<runId>/report.json
  - Saved scene HTML files per trial
`);

  process.exit(1);
}

function getFlagValues(argv: string[], key: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== `--${key}`) {
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      out.push("true");
    } else {
      out.push(value);
      i += 1;
    }
  }
  return out;
}

function getLastFlagValue(argv: string[], key: string): string | undefined {
  const values = getFlagValues(argv, key);
  return values.length > 0 ? values[values.length - 1] : undefined;
}

function hasBooleanFlag(argv: string[], key: string): boolean {
  return getFlagValues(argv, key).length > 0;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    printUsageAndExit(`--value must be a positive integer: ${raw}`);
  }
  return parsed;
}

function parseOptions(argv: string[]): CompareOptions {
  const modelsRaw = getLastFlagValue(argv, "models");
  if (!modelsRaw) {
    printUsageAndExit("Missing required --models");
  }
  const models = modelsRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (models.length === 0) {
    printUsageAndExit("--models must include at least one model");
  }

  const prompts = getFlagValues(argv, "prompt")
    .map((value) => value.trim())
    .filter((value) => value !== "true" && value.length > 0);
  if (prompts.length === 0) {
    printUsageAndExit("Provide at least one --prompt");
  }

  const scopeRaw = getLastFlagValue(argv, "scope") ?? "scene";
  const scope: CompareScope =
    scopeRaw === "both" || scopeRaw === "scene"
      ? scopeRaw
      : printUsageAndExit("--scope must be scene or both");

  return {
    models,
    prompts,
    userId: getLastFlagValue(argv, "userId") ?? "model-compare-user",
    repeats: parsePositiveInt(getLastFlagValue(argv, "repeats"), 1),
    pollMs: parsePositiveInt(getLastFlagValue(argv, "pollMs"), 250),
    scope,
    includeContext: hasBooleanFlag(argv, "context"),
    debugRaw: hasBooleanFlag(argv, "debugRaw"),
  };
}

function runCommand(
  command: string,
  args: string[],
): {
  ok: boolean;
  stdout: string;
  stderr: string;
} {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });

  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function getConvexEnvVar(name: string): string | null {
  const result = runCommand("bunx", ["convex", "env", "get", name]);
  if (!result.ok) {
    return null;
  }
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

function setConvexEnvVar(name: string, value: string): void {
  const result = runCommand("bunx", ["convex", "env", "set", name, value]);
  if (!result.ok) {
    throw new Error(
      `Failed to set Convex env ${name}: ${result.stderr || result.stdout}`,
    );
  }
}

function removeConvexEnvVar(name: string): void {
  const result = runCommand("bunx", ["convex", "env", "remove", name]);
  if (!result.ok) {
    throw new Error(
      `Failed to remove Convex env ${name}: ${result.stderr || result.stdout}`,
    );
  }
}

function sanitizePathSegment(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
}

function parseArtifactPath(stdout: string): string | undefined {
  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^- artifact:\s*(.+)$/);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function countMatches(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function scoreQuality(params: {
  success: boolean;
  html?: HtmlMetrics;
  actionResultText?: string;
}): number {
  if (!params.success || !params.html) {
    return 0;
  }

  let score = 50;
  if (params.html.htmlLength >= 1200 && params.html.htmlLength <= 16000) {
    score += 12;
  }
  if (params.html.controls >= 2) {
    score += 10;
  }
  if (params.html.handlers >= 2) {
    score += 10;
  }
  if (params.html.hasSvgOrCanvas) {
    score += 8;
  }
  if (params.html.usesTailwindBrowser) {
    score += 5;
  }

  const text = (params.actionResultText ?? "").toLowerCase();
  if (/(drag|slider|adjust|click|move)/.test(text)) {
    score += 5;
  }

  return Math.min(100, score);
}

async function runTrial(params: {
  model: string;
  prompt: string;
  repeat: number;
  options: CompareOptions;
  outputDir: string;
}): Promise<TrialResult> {
  const modelDir = path.join(
    params.outputDir,
    sanitizePathSegment(params.model),
  );
  const promptDir = path.join(modelDir, `prompt-${params.repeat}`);

  const args = [
    "agentic-testing/agent-lab.ts",
    "run",
    "--userId",
    params.options.userId,
    "--newThread",
    "--saveSceneHtml",
    "--sceneOutDir",
    promptDir,
    "--modelLabel",
    params.model,
    "--pollMs",
    String(params.options.pollMs),
    "--prompt",
    params.prompt,
  ];

  if (params.options.includeContext) {
    args.push("--context");
  }
  if (params.options.debugRaw) {
    args.push("--debugRaw");
  }

  const run = runCommand("bun", args);
  if (!run.ok) {
    return {
      model: params.model,
      prompt: params.prompt,
      repeat: params.repeat,
      error: `agentic:test failed: ${run.stderr || run.stdout}`,
    };
  }

  const artifactPath = parseArtifactPath(run.stdout);
  if (!artifactPath) {
    return {
      model: params.model,
      prompt: params.prompt,
      repeat: params.repeat,
      error: "Could not parse run artifact path from agentic:test output.",
    };
  }

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(await readFile(artifactPath, "utf8"));
  } catch (error) {
    return {
      model: params.model,
      prompt: params.prompt,
      repeat: params.repeat,
      artifactPath,
      error: `Failed to parse artifact JSON: ${String(error)}`,
    };
  }

  const parsed =
    parsedUnknown && typeof parsedUnknown === "object"
      ? (parsedUnknown as RunArtifactLike)
      : ({} as RunArtifactLike);

  const sceneFilePath =
    Array.isArray(parsed.sceneFiles) && parsed.sceneFiles.length > 0
      ? typeof parsed.sceneFiles[0]?.filePath === "string"
        ? parsed.sceneFiles[0]?.filePath
        : undefined
      : undefined;

  let html: HtmlMetrics | undefined;
  if (typeof sceneFilePath === "string") {
    try {
      const htmlText = await readFile(sceneFilePath, "utf8");
      html = {
        htmlLength: htmlText.length,
        controls: countMatches(htmlText, /<(button|input|select|textarea)\b/gi),
        sliders: countMatches(htmlText, /<input\b[^>]*type=["']range["']/gi),
        handlers: countMatches(
          htmlText,
          /(addEventListener\(|on(click|input|change|pointerdown|pointermove|pointerup)=|requestAnimationFrame\()/gi,
        ),
        hasSvgOrCanvas: /<(svg|canvas)\b/i.test(htmlText),
        usesTailwindBrowser:
          /cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4/i.test(htmlText),
      };
    } catch {
      html = undefined;
    }
  }

  const sparkFailures =
    typeof parsed.spark?.failures === "number" ? parsed.spark.failures : 0;
  const success = sparkFailures === 0;

  return {
    model: params.model,
    prompt: params.prompt,
    repeat: params.repeat,
    artifactPath,
    totalDurationMs:
      typeof parsed.totalDurationMs === "number"
        ? parsed.totalDurationMs
        : undefined,
    sparkDurationMs:
      typeof parsed.spark?.totalDurationMs === "number"
        ? parsed.spark.totalDurationMs
        : undefined,
    sparkFailures,
    sceneFilePath,
    actionResultText:
      typeof parsed.actionResultText === "string"
        ? parsed.actionResultText
        : undefined,
    html,
    qualityScore: scoreQuality({
      success,
      html,
      actionResultText:
        typeof parsed.actionResultText === "string"
          ? parsed.actionResultText
          : undefined,
    }),
  };
}

function printSummary(report: CompareReport): void {
  const byModel = new Map<string, TrialResult[]>();
  for (const trial of report.trials) {
    const bucket = byModel.get(trial.model) ?? [];
    bucket.push(trial);
    byModel.set(trial.model, bucket);
  }

  console.log("\nModel comparison complete\n");
  console.log(
    "model | trials | successRate | avgTotalMs | avgSparkMs | avgQuality",
  );
  console.log(
    "----- | ------ | ----------- | ---------- | ---------- | ----------",
  );

  for (const [model, trials] of byModel.entries()) {
    const valid = trials.filter((t) => !t.error);
    const successes = valid.filter((t) => (t.sparkFailures ?? 1) === 0).length;
    const successRate =
      valid.length > 0
        ? `${Math.round((successes / valid.length) * 100)}%`
        : "0%";
    const avgTotalMs =
      valid.length > 0
        ? Math.round(
            valid.reduce((sum, t) => sum + (t.totalDurationMs ?? 0), 0) /
              valid.length,
          )
        : 0;
    const avgSparkMs =
      valid.length > 0
        ? Math.round(
            valid.reduce((sum, t) => sum + (t.sparkDurationMs ?? 0), 0) /
              valid.length,
          )
        : 0;
    const avgQuality =
      valid.length > 0
        ? Math.round(
            valid.reduce((sum, t) => sum + (t.qualityScore ?? 0), 0) /
              valid.length,
          )
        : 0;

    console.log(
      `${model} | ${trials.length} | ${successRate} | ${avgTotalMs} | ${avgSparkMs} | ${avgQuality}`,
    );
  }
}

async function restoreEnv(name: string, value: string | null): Promise<void> {
  if (value === null) {
    try {
      removeConvexEnvVar(name);
    } catch {
      // no-op
    }
    return;
  }
  setConvexEnvVar(name, value);
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  const runId = `${new Date().toISOString().replace(/[.:]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const baseDir = path.join(
    process.cwd(),
    ".tmp",
    "agent-lab",
    "model-compare",
    runId,
  );
  await mkdir(baseDir, { recursive: true });

  const previousOpenRouterModel = getConvexEnvVar("OPENROUTER_MODEL");
  const previousSceneModel = getConvexEnvVar("SPARK_WORKER_SCENE_MODEL");

  const report: CompareReport = {
    runId,
    createdAt: new Date().toISOString(),
    options,
    previousEnv: {
      OPENROUTER_MODEL: previousOpenRouterModel,
      SPARK_WORKER_SCENE_MODEL: previousSceneModel,
    },
    trials: [],
  };

  try {
    for (const model of options.models) {
      console.log(`\n=== Model: ${model} ===`);
      setConvexEnvVar("SPARK_WORKER_SCENE_MODEL", model);
      if (options.scope === "both") {
        setConvexEnvVar("OPENROUTER_MODEL", model);
      }

      for (const prompt of options.prompts) {
        for (let repeat = 1; repeat <= options.repeats; repeat += 1) {
          console.log(`- Running prompt (repeat ${repeat}/${options.repeats})`);
          const trial = await runTrial({
            model,
            prompt,
            repeat,
            options,
            outputDir: path.join(baseDir, "scenes"),
          });
          report.trials.push(trial);

          if (trial.error) {
            console.log(`  error: ${trial.error}`);
          } else {
            console.log(
              `  totalMs=${trial.totalDurationMs ?? "n/a"}, sparkMs=${trial.sparkDurationMs ?? "n/a"}, quality=${trial.qualityScore ?? 0}`,
            );
          }
        }
      }
    }
  } finally {
    await restoreEnv("SPARK_WORKER_SCENE_MODEL", previousSceneModel);
    if (options.scope === "both") {
      await restoreEnv("OPENROUTER_MODEL", previousOpenRouterModel);
    }
  }

  const reportPath = path.join(baseDir, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  printSummary(report);
  console.log(`\nReport: ${reportPath}`);
}

main().catch((error) => {
  console.error(`Fatal: ${String(error)}`);
  process.exit(1);
});
