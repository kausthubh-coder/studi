import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

type Command = "preflight" | "run" | "rank";
type CaseBucket = "studi" | "spark_coding" | "spark_normal";

type CandidateBlueprint = {
  id: string;
  label: string;
  modelId: string;
  agentName: string;
  fallbackModelId?: string;
  fallbackAgentName?: string;
};

type CandidateResolved = {
  id: string;
  label: string;
  modelId: string;
  agentName: string;
  promptCostPerToken: number;
  completionCostPerToken: number;
  usedFallback: boolean;
  fallbackFromModelId?: string;
};

type BakeoffCase = {
  id: string;
  label: string;
  bucket: CaseBucket;
  prompt: string;
  expectSparkTool: boolean;
};

type RunUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type UsageBreakdown = {
  totals: {
    calls: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cachedInputTokens: number;
    estimatedCostUsd: number;
  };
};

type BakeoffResult = {
  candidateId: string;
  candidateLabel: string;
  modelId: string;
  agentName: string;
  caseId: string;
  caseLabel: string;
  bucket: CaseBucket;
  status: "success" | "failed";
  threadId?: string;
  artifactPath?: string;
  usage: RunUsage;
  estimatedCostUsd: number;
  costSource: "telemetry" | "pricing_estimate";
  durationMs?: number;
  error?: string;
};

type BakeoffReport = {
  runId: string;
  createdAt: string;
  budgetUsd: number;
  spentUsd: number;
  stoppedEarly: boolean;
  stopReason?: string;
  userId: string;
  pollMs: number;
  candidates: CandidateResolved[];
  cases: BakeoffCase[];
  results: BakeoffResult[];
};

type ManualScoreItem = {
  candidateId: string;
  caseId: string;
  bucket: CaseBucket;
  qualityScore: number | null;
  notes?: string;
};

type ManualScoresPayload = {
  runId?: string;
  scores: ManualScoreItem[];
};

const CANDIDATE_BLUEPRINTS: CandidateBlueprint[] = [
  {
    id: "seed-mini",
    label: "ByteDance Seed 2.0 Mini",
    modelId: "bytedance-seed/seed-2.0-mini",
    agentName: "studi-bakeoff-seed-2-0-mini",
  },
  {
    id: "gemini-flash-lite",
    label: "Gemini 3.1 Flash Lite Preview",
    modelId: "google/gemini-3.1-flash-lite-preview",
    agentName: "studi-bakeoff-gemini-3-1-flash-lite-preview",
  },
  {
    id: "kimi-k2-0905",
    label: "Kimi K2 0905 Nitro",
    modelId: "moonshotai/kimi-k2-0905:nitro",
    agentName: "studi-bakeoff-kimi-k2-0905-nitro",
    fallbackModelId: "moonshotai/kimi-k2-0905",
    fallbackAgentName: "studi-bakeoff-kimi-k2-0905",
  },
];

const BAKEOFF_CASES: BakeoffCase[] = [
  {
    id: "studi-brief-roadmap",
    label: "Studi concise roadmap",
    bucket: "studi",
    expectSparkTool: false,
    prompt:
      "Teach React state in plain English for a beginner in under 120 words. Include exactly 3 bullet points and 1 tiny example.",
  },
  {
    id: "studi-debug-explainer",
    label: "Studi debugging explanation",
    bucket: "studi",
    expectSparkTool: false,
    prompt:
      "In under 140 words, explain why a React component can re-render too often and give exactly 2 practical fixes.",
  },
  {
    id: "spark-web-hover",
    label: "Spark coding web playground",
    bucket: "spark_coding",
    expectSparkTool: true,
    prompt:
      "Create a web_playground spark teaching CSS hover transitions on a button. Include editable HTML, CSS, and minimal JS.",
  },
  {
    id: "spark-scene-derivative",
    label: "Spark coding scene",
    bucket: "spark_coding",
    expectSparkTool: true,
    prompt:
      "Create a scene spark for secant-to-tangent intuition with a draggable point and visible slope feedback.",
  },
  {
    id: "spark-quiz-react-hooks",
    label: "Spark normal quiz",
    bucket: "spark_normal",
    expectSparkTool: true,
    prompt:
      "Create a quiz spark with 4 short questions about React hooks and beginner-friendly explanations.",
  },
  {
    id: "spark-flash-array-methods",
    label: "Spark normal flash cards",
    bucket: "spark_normal",
    expectSparkTool: true,
    prompt:
      "Create a flash_card spark with 5 cards for JavaScript array methods map, filter, reduce, find, and some.",
  },
];

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }
  console.log(`
Model Bakeoff CLI

Usage:
  bun agentic-testing/model-bakeoff.ts preflight
  bun agentic-testing/model-bakeoff.ts run [--budgetUsd 0.50] [--userId bakeoff-user] [--pollMs 250]
  bun agentic-testing/model-bakeoff.ts rank --report <path> --scores <path>

Notes:
  - run writes report + manual-score template under .tmp/agent-lab/model-bakeoff/<runId>/
  - rank expects manual scores (0-100, or 1-5) and computes weighted winners:
    final = 0.70 * costNorm + 0.30 * qualityNorm
`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  command: Command;
  flags: Map<string, string[]>;
} {
  const command = argv[0] as Command | undefined;
  if (command !== "preflight" && command !== "run" && command !== "rank") {
    printUsageAndExit("Missing command: preflight | run | rank");
  }

  const flags = new Map<string, string[]>();
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    const hasValue = typeof next === "string" && !next.startsWith("--");
    const value = hasValue ? next : "true";
    if (!flags.has(key)) {
      flags.set(key, []);
    }
    flags.get(key)!.push(value);
    if (hasValue) {
      i += 1;
    }
  }
  return { command, flags };
}

function getLastFlagValue(
  flags: Map<string, string[]>,
  key: string,
): string | undefined {
  const values = flags.get(key);
  if (!values || values.length === 0) {
    return undefined;
  }
  return values[values.length - 1];
}

function parsePositiveNumber(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid positive number: ${raw}`);
  }
  return parsed;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid positive integer: ${raw}`);
  }
  return parsed;
}

function parseArtifactPath(output: string): string | undefined {
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^- artifact:\s*(.+)$/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function toNormalizedQuality(raw: number): number {
  if (!Number.isFinite(raw)) {
    return 0;
  }
  if (raw <= 5) {
    return Math.max(0, Math.min(100, raw * 20));
  }
  return Math.max(0, Math.min(100, raw));
}

function estimateCostFromPricing(
  usage: RunUsage,
  promptCostPerToken: number,
  completionCostPerToken: number,
): number {
  return (
    usage.promptTokens * promptCostPerToken +
    usage.completionTokens * completionCostPerToken
  );
}

async function fetchOpenRouterModels(): Promise<
  Array<{
    id: string;
    pricing?: {
      prompt?: string;
      completion?: string;
    };
  }>
> {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  if (!response.ok) {
    throw new Error(`OpenRouter models API failed: ${response.status}`);
  }
  const json = (await response.json()) as {
    data?: Array<{
      id: string;
      pricing?: {
        prompt?: string;
        completion?: string;
      };
    }>;
  };
  return json.data ?? [];
}

async function resolveCandidates(): Promise<CandidateResolved[]> {
  const models = await fetchOpenRouterModels();

  const findModel = (id: string) => models.find((model) => model.id === id);
  const parseRate = (value: string | undefined) => {
    const parsed = Number.parseFloat(value ?? "");
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  const resolved: CandidateResolved[] = [];
  for (const candidate of CANDIDATE_BLUEPRINTS) {
    const found = findModel(candidate.modelId);
    if (found) {
      resolved.push({
        id: candidate.id,
        label: candidate.label,
        modelId: candidate.modelId,
        agentName: candidate.agentName,
        promptCostPerToken: parseRate(found.pricing?.prompt),
        completionCostPerToken: parseRate(found.pricing?.completion),
        usedFallback: false,
      });
      continue;
    }

    if (!candidate.fallbackModelId || !candidate.fallbackAgentName) {
      console.warn(`Skipping candidate ${candidate.id}: model unavailable.`);
      continue;
    }

    const fallback = findModel(candidate.fallbackModelId);
    if (!fallback) {
      console.warn(
        `Skipping candidate ${candidate.id}: primary and fallback models unavailable.`,
      );
      continue;
    }

    resolved.push({
      id: candidate.id,
      label: candidate.label,
      modelId: candidate.fallbackModelId,
      agentName: candidate.fallbackAgentName,
      promptCostPerToken: parseRate(fallback.pricing?.prompt),
      completionCostPerToken: parseRate(fallback.pricing?.completion),
      usedFallback: true,
      fallbackFromModelId: candidate.modelId,
    });
  }

  if (resolved.length === 0) {
    throw new Error("No candidate models are available in OpenRouter catalog.");
  }
  return resolved;
}

async function fetchUsageBreakdown(
  client: ConvexHttpClient,
  userId: string,
  threadId: string,
): Promise<UsageBreakdown | undefined> {
  try {
    const playgroundApi = api as unknown as {
      playground?: {
        getThreadUsageBreakdown?: unknown;
      };
    };
    const queryRef = playgroundApi.playground?.getThreadUsageBreakdown;
    if (!queryRef) {
      return undefined;
    }

    return (await client.action(
      queryRef as never,
      {
        userId,
        threadId,
      } as never,
    )) as UsageBreakdown;
  } catch (error) {
    console.warn(`Usage breakdown fetch failed: ${String(error)}`);
    return undefined;
  }
}

function runAgenticTest(params: {
  userId: string;
  pollMs: number;
  candidate: CandidateResolved;
  testCase: BakeoffCase;
}) {
  const args = [
    "agentic-testing/agent-lab.ts",
    "run",
    "--userId",
    params.userId,
    "--newThread",
    "--pollMs",
    String(params.pollMs),
    "--agentName",
    params.candidate.agentName,
    "--modelLabel",
    params.candidate.modelId,
    "--prompt",
    params.testCase.prompt,
  ];

  if (params.testCase.expectSparkTool) {
    args.push("--expectTools", "create_spark", "--failOnToolError");
  }

  const result = spawnSync("bun", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function runPreflight(): Promise<void> {
  const candidates = await resolveCandidates();
  console.log("Resolved candidates:\n");
  for (const candidate of candidates) {
    const fallbackText = candidate.usedFallback
      ? ` (fallback from ${candidate.fallbackFromModelId})`
      : "";
    console.log(
      `- ${candidate.id}: model=${candidate.modelId}${fallbackText}, prompt=${candidate.promptCostPerToken}, completion=${candidate.completionCostPerToken}, agent=${candidate.agentName}`,
    );
  }
}

async function runBakeoff(flags: Map<string, string[]>): Promise<void> {
  const convexUrl =
    process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  const apiKey =
    process.env.STUDI_PLAYGROUND_API_KEY ?? process.env.PLAYGROUND_API_KEY ?? "";
  if (!convexUrl) {
    printUsageAndExit("Missing CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL).");
  }
  if (!apiKey) {
    printUsageAndExit(
      "Missing STUDI_PLAYGROUND_API_KEY (or PLAYGROUND_API_KEY).",
    );
  }

  const budgetUsd = parsePositiveNumber(getLastFlagValue(flags, "budgetUsd"), 0.5);
  const userId = getLastFlagValue(flags, "userId") ?? "bakeoff-user";
  const pollMs = parsePositiveInt(getLastFlagValue(flags, "pollMs"), 250);

  const candidates = await resolveCandidates();
  const client = new ConvexHttpClient(convexUrl);

  const runId = `${new Date().toISOString().replace(/[.:]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const baseDir = path.join(
    process.cwd(),
    ".tmp",
    "agent-lab",
    "model-bakeoff",
    runId,
  );
  await mkdir(baseDir, { recursive: true });

  const results: BakeoffResult[] = [];
  let spentUsd = 0;
  let stopReason: string | undefined;

  console.log(
    `Running bakeoff with budget=$${budgetUsd.toFixed(2)}, cases=${BAKEOFF_CASES.length}, candidates=${candidates.length}`,
  );

  for (const candidate of candidates) {
    console.log(`\n=== Candidate: ${candidate.label} (${candidate.modelId}) ===`);

    for (const testCase of BAKEOFF_CASES) {
      if (spentUsd >= budgetUsd) {
        stopReason = `Budget reached ($${spentUsd.toFixed(6)} >= $${budgetUsd.toFixed(2)}).`;
        break;
      }

      console.log(`- ${testCase.id}`);

      let run = runAgenticTest({
        userId,
        pollMs,
        candidate,
        testCase,
      });
      let runtimeFallbackUsed = false;

      const fallbackBlueprint = CANDIDATE_BLUEPRINTS.find(
        (item) => item.id === candidate.id,
      );
      const fallbackModelId = fallbackBlueprint?.fallbackModelId;
      const fallbackAgentName = fallbackBlueprint?.fallbackAgentName;
      const canFallbackAtRuntime =
        !candidate.usedFallback &&
        Boolean(fallbackModelId && fallbackAgentName) &&
        candidate.modelId !== fallbackModelId;

      const fallbackErrorSignal = `${run.stdout}\n${run.stderr}`.toLowerCase();
      if (
        !run.ok &&
        canFallbackAtRuntime &&
        (fallbackErrorSignal.includes("no endpoints found matching your data policy") ||
          fallbackErrorSignal.includes("provider fault") ||
          fallbackErrorSignal.includes("status=404"))
      ) {
        console.log(
          `  runtime fallback: ${candidate.modelId} -> ${fallbackModelId}`,
        );
        candidate.modelId = fallbackModelId!;
        candidate.agentName = fallbackAgentName!;
        runtimeFallbackUsed = true;
        run = runAgenticTest({
          userId,
          pollMs,
          candidate,
          testCase,
        });
      }

      const combinedOutput = `${run.stdout}\n${run.stderr}`;
      const artifactPath = parseArtifactPath(run.stdout);

      if (!run.ok || !artifactPath) {
        const errorText = !artifactPath
          ? "Could not parse run artifact path."
          : combinedOutput.trim() || `agentic:test exited with code ${run.status}`;
        results.push({
          candidateId: candidate.id,
          candidateLabel: candidate.label,
          modelId: candidate.modelId,
          agentName: candidate.agentName,
          caseId: testCase.id,
          caseLabel: testCase.label,
          bucket: testCase.bucket,
          status: "failed",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          estimatedCostUsd: 0,
          costSource: "pricing_estimate",
          error: runtimeFallbackUsed
            ? `Fallback run failed: ${errorText}`
            : errorText,
        });
        console.log(`  failed: ${errorText.slice(0, 160)}`);
        continue;
      }

      const parsed = JSON.parse(await readFile(artifactPath, "utf8")) as {
        threadId?: string;
        usage?: {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        };
        totalDurationMs?: number;
      };
      const threadId = parsed.threadId;
      const usage: RunUsage = {
        promptTokens: parsed.usage?.promptTokens ?? 0,
        completionTokens: parsed.usage?.completionTokens ?? 0,
        totalTokens: parsed.usage?.totalTokens ?? 0,
      };

      const breakdown =
        threadId && threadId.trim()
          ? await fetchUsageBreakdown(client, userId, threadId)
          : undefined;

      const telemetryCost = breakdown?.totals.estimatedCostUsd;
      const estimatedCostUsd =
        typeof telemetryCost === "number" && Number.isFinite(telemetryCost)
          ? telemetryCost
          : estimateCostFromPricing(
              usage,
              candidate.promptCostPerToken,
              candidate.completionCostPerToken,
            );
      const costSource =
        typeof telemetryCost === "number" && Number.isFinite(telemetryCost)
          ? "telemetry"
          : "pricing_estimate";

      spentUsd += estimatedCostUsd;

      results.push({
        candidateId: candidate.id,
        candidateLabel: candidate.label,
        modelId: candidate.modelId,
        agentName: candidate.agentName,
        caseId: testCase.id,
        caseLabel: testCase.label,
        bucket: testCase.bucket,
        status: "success",
        threadId,
        artifactPath,
        usage,
        estimatedCostUsd,
        costSource,
        durationMs: parsed.totalDurationMs,
      });

      console.log(
        `  ok: cost=$${estimatedCostUsd.toFixed(6)} (${costSource}), tokens=${usage.totalTokens}, spent=$${spentUsd.toFixed(6)}`,
      );
    }

    if (stopReason) {
      break;
    }
  }

  const report: BakeoffReport = {
    runId,
    createdAt: new Date().toISOString(),
    budgetUsd,
    spentUsd,
    stoppedEarly: Boolean(stopReason),
    stopReason,
    userId,
    pollMs,
    candidates,
    cases: BAKEOFF_CASES,
    results,
  };

  const reportPath = path.join(baseDir, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const manualScoresTemplate: ManualScoresPayload = {
    runId,
    scores: results
      .filter((result) => result.status === "success")
      .map((result) => ({
        candidateId: result.candidateId,
        caseId: result.caseId,
        bucket: result.bucket,
        qualityScore: null,
        notes: "",
      })),
  };

  const templatePath = path.join(baseDir, "manual-scores.template.json");
  await writeFile(
    templatePath,
    `${JSON.stringify(manualScoresTemplate, null, 2)}\n`,
    "utf8",
  );

  console.log(`\nBakeoff report: ${reportPath}`);
  console.log(`Manual score template: ${templatePath}`);
  if (stopReason) {
    console.log(`Stopped early: ${stopReason}`);
  }
  console.log(
    `Next: fill the template (0-100 or 1-5), save as manual-scores.json, then run:\n` +
      `bun run agentic:bakeoff rank --report "${reportPath}" --scores "${path.join(baseDir, "manual-scores.json")}"`,
  );
}

async function runRank(flags: Map<string, string[]>): Promise<void> {
  const reportPath = getLastFlagValue(flags, "report");
  const scoresPath = getLastFlagValue(flags, "scores");
  if (!reportPath) {
    printUsageAndExit("rank requires --report <path>");
  }
  if (!scoresPath) {
    printUsageAndExit("rank requires --scores <path>");
  }

  const report = JSON.parse(await readFile(reportPath, "utf8")) as BakeoffReport;
  const scoresRaw = JSON.parse(await readFile(scoresPath, "utf8")) as
    | ManualScoresPayload
    | ManualScoreItem[];
  const scoreItems = Array.isArray(scoresRaw)
    ? scoresRaw
    : Array.isArray(scoresRaw.scores)
      ? scoresRaw.scores
      : [];

  const scoreByKey = new Map<string, number>();
  for (const scoreItem of scoreItems) {
    if (typeof scoreItem.qualityScore !== "number") {
      continue;
    }
    scoreByKey.set(
      `${scoreItem.candidateId}::${scoreItem.caseId}`,
      toNormalizedQuality(scoreItem.qualityScore),
    );
  }

  type BucketAggregate = {
    candidateId: string;
    modelId: string;
    avgCostUsd: number;
    avgQuality: number;
    runs: number;
    costNorm: number;
    finalScore: number;
  };

  const buckets: CaseBucket[] = ["studi", "spark_coding", "spark_normal"];
  const byBucket = new Map<CaseBucket, BucketAggregate[]>();

  for (const bucket of buckets) {
    const byCandidate = new Map<
      string,
      { modelId: string; costs: number[]; qualityScores: number[] }
    >();

    for (const result of report.results) {
      if (result.bucket !== bucket || result.status !== "success") {
        continue;
      }
      const candidateBucket = byCandidate.get(result.candidateId) ?? {
        modelId: result.modelId,
        costs: [],
        qualityScores: [],
      };
      candidateBucket.costs.push(result.estimatedCostUsd);
      const quality = scoreByKey.get(`${result.candidateId}::${result.caseId}`);
      if (typeof quality === "number") {
        candidateBucket.qualityScores.push(quality);
      }
      byCandidate.set(result.candidateId, candidateBucket);
    }

    const aggregates: BucketAggregate[] = Array.from(byCandidate.entries()).map(
      ([candidateId, data]) => {
        const avgCostUsd =
          data.costs.reduce((sum, value) => sum + value, 0) /
          Math.max(1, data.costs.length);
        const avgQuality =
          data.qualityScores.length > 0
            ? data.qualityScores.reduce((sum, value) => sum + value, 0) /
              data.qualityScores.length
            : 0;
        return {
          candidateId,
          modelId: data.modelId,
          avgCostUsd,
          avgQuality,
          runs: data.costs.length,
          costNorm: 0,
          finalScore: 0,
        };
      },
    );

    const costs = aggregates.map((item) => item.avgCostUsd);
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);
    for (const aggregate of aggregates) {
      aggregate.costNorm =
        maxCost === minCost
          ? 100
          : ((maxCost - aggregate.avgCostUsd) / (maxCost - minCost)) * 100;
      aggregate.finalScore = aggregate.costNorm * 0.7 + aggregate.avgQuality * 0.3;
    }

    aggregates.sort((a, b) => b.finalScore - a.finalScore);
    byBucket.set(bucket, aggregates);
  }

  const winnerFor = (bucket: CaseBucket) => byBucket.get(bucket)?.[0];
  const studiWinner = winnerFor("studi");
  const sparkCodingWinner = winnerFor("spark_coding");
  const sparkNormalWinner = winnerFor("spark_normal");

  if (!studiWinner || !sparkCodingWinner || !sparkNormalWinner) {
    throw new Error(
      "Could not compute winners for all required buckets. Ensure run results + scores are present.",
    );
  }

  const recommendation = {
    studiAgent: studiWinner.modelId,
    sparkScene: sparkCodingWinner.modelId,
    sparkCode: sparkCodingWinner.modelId,
    sparkQuiz: sparkNormalWinner.modelId,
    sparkFlash: sparkNormalWinner.modelId,
    sparkDesmos: sparkNormalWinner.modelId,
  };

  const ranking = {
    runId: report.runId,
    createdAt: new Date().toISOString(),
    weights: {
      cost: 0.7,
      quality: 0.3,
    },
    bucketRankings: Object.fromEntries(
      Array.from(byBucket.entries()).map(([bucket, aggregates]) => [
        bucket,
        aggregates.map((item) => ({
          candidateId: item.candidateId,
          modelId: item.modelId,
          runs: item.runs,
          avgCostUsd: item.avgCostUsd,
          avgQuality: item.avgQuality,
          costNorm: item.costNorm,
          finalScore: item.finalScore,
        })),
      ]),
    ),
    recommendation,
  };

  const outputDir = path.dirname(path.resolve(reportPath));
  const rankingPath = path.join(outputDir, "ranking.json");
  await writeFile(rankingPath, `${JSON.stringify(ranking, null, 2)}\n`, "utf8");

  console.log("Rank complete\n");
  for (const bucket of buckets) {
    console.log(`- ${bucket}:`);
    for (const item of byBucket.get(bucket) ?? []) {
      console.log(
        `  ${item.candidateId} (${item.modelId}) final=${item.finalScore.toFixed(2)} costNorm=${item.costNorm.toFixed(2)} quality=${item.avgQuality.toFixed(2)} avgCost=$${item.avgCostUsd.toFixed(6)}`,
      );
    }
  }
  console.log("\nRecommended mapping:");
  console.log(
    `- studiAgent=${recommendation.studiAgent}\n` +
      `- sparkScene=${recommendation.sparkScene}\n` +
      `- sparkCode=${recommendation.sparkCode}\n` +
      `- sparkQuiz=${recommendation.sparkQuiz}\n` +
      `- sparkFlash=${recommendation.sparkFlash}\n` +
      `- sparkDesmos=${recommendation.sparkDesmos}`,
  );
  console.log(`\nRanking artifact: ${rankingPath}`);
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (command === "preflight") {
    await runPreflight();
    return;
  }
  if (command === "run") {
    await runBakeoff(flags);
    return;
  }
  if (command === "rank") {
    await runRank(flags);
    return;
  }
}

main().catch((error) => {
  console.error(`Fatal: ${String(error)}`);
  process.exit(1);
});

