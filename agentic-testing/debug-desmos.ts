/**
 * Desmos spark debug script.
 *
 * Usage:
 *   bun agentic-testing/debug-desmos.ts --context "plot y = x^2 and y = 2x"
 *   bun agentic-testing/debug-desmos.ts --context "sine wave" --model google/gemini-2.5-flash-preview
 *   bun agentic-testing/debug-desmos.ts --batch   # run all built-in test cases
 *
 * Env vars (loaded from .env.local automatically by Bun):
 *   OPENROUTER_API_KEY  (required)
 *   SPARK_WORKER_DESMOS_MODEL  (optional override)
 *   SPARK_WORKER_DESMOS_TIMEOUT_MS  (optional override)
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";

// ─── inline copies of the types/schemas from contracts + tools ─────────────

type DesmosTableValue = string | number | null;

type DesmosTableColumn = {
  latex?: string;
  values?: DesmosTableValue[];
};

type DesmosEquationExpression = {
  id?: string;
  type?: "expression";
  latex: string;
  color?: string;
  hidden?: boolean;
};

type DesmosTableExpression = {
  id?: string;
  type: "table";
  columns?: DesmosTableColumn[];
  hidden?: boolean;
};

type DesmosTextExpression = {
  id?: string;
  type: "text";
  text: string;
};

type DesmosExpressionState =
  | DesmosEquationExpression
  | DesmosTableExpression
  | DesmosTextExpression;

type DesmosGraphPayload = {
  expressions: DesmosExpressionState[];
  settings?: Record<string, string | number | boolean>;
  viewport?: { left: number; right: number; bottom: number; top: number };
  hint?: string;
};

const desmosTableValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.null(),
]);

const desmosTableColumnSchema = z.object({
  latex: z.string().optional(),
  values: z.array(desmosTableValueSchema).optional(),
});

const desmosEquationExpressionSchema = z.object({
  id: z.string().optional(),
  type: z.literal("expression").optional(),
  latex: z.string().min(1),
  color: z.string().optional(),
  hidden: z.boolean().optional(),
});

const desmosTableExpressionSchema = z.object({
  id: z.string().optional(),
  type: z.literal("table"),
  columns: z.array(desmosTableColumnSchema).min(1),
  hidden: z.boolean().optional(),
});

const desmosTextExpressionSchema = z.object({
  id: z.string().optional(),
  type: z.literal("text"),
  text: z.string().min(1),
});

const desmosExpressionSchema = z.union([
  desmosEquationExpressionSchema,
  desmosTableExpressionSchema,
  desmosTextExpressionSchema,
]);

const desmosPayloadSchema: z.ZodType<DesmosGraphPayload> = z.object({
  expressions: z.array(desmosExpressionSchema).min(1),
  viewport: z
    .object({
      left: z.number(),
      right: z.number(),
      bottom: z.number(),
      top: z.number(),
    })
    .optional(),
  hint: z.string().optional(),
});

const desmosWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: desmosPayloadSchema,
});

// ─── simple deterministic draft builder (mirrors tools.ts) ─────────────────

const allowedIdentifiers = new Set([
  "x",
  "y",
  "a",
  "b",
  "t",
  "n",
  "f",
  "g",
  "h",
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "asin",
  "acos",
  "atan",
  "log",
  "ln",
  "sqrt",
  "abs",
  "theta",
  "pi",
  "e",
]);

function extractEquationCandidates(context: string): string[] {
  const blockers = [
    "table",
    "parametric",
    "polar",
    "inequality",
    "piecewise",
    "regression",
  ];
  const lowered = context.replace(/\s+/g, " ").trim().toLowerCase();
  if (blockers.some((t) => lowered.includes(t))) return [];

  const chunks = context
    .replace(/i\.e\./gi, "")
    .split(/\n|,|;|\band\b|\bplus\b|\bwith\b/gi)
    .map((p) =>
      p
        .replace(/^[^a-zA-Z0-9(\-]+/, "")
        .replace(/[^a-zA-Z0-9)\]}]+$/, "")
        .trim(),
    )
    .filter(Boolean);

  const results: string[] = [];
  const seen = new Set<string>();
  const eqPattern = /([a-zA-Z](?:[a-zA-Z0-9'_]*|\([^)]*\))*\s*=\s*[^,;\n]+)/g;

  for (const chunk of chunks) {
    if (!chunk.includes("=")) continue;
    for (const match of chunk.matchAll(eqPattern)) {
      let candidate = (match[1] ?? "")
        .trim()
        .replace(/\s+\b(and|with|where|for|to|in)\b\s+.*$/i, "")
        .replace(/\.\s+[a-zA-Z].*$/, "")
        .replace(/\s+\(or\b[\s\S]*$/i, "")
        .replace(/[.;]\s*$/, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!candidate.includes("=") || /https?:\/\//i.test(candidate)) continue;
      if (candidate.length > 100) continue;
      if (!/^[a-zA-Z0-9_'()\s+\-*/^.=]+$/.test(candidate)) continue;

      const firstEq = candidate.indexOf("=");
      const secondEq = candidate.indexOf("=", firstEq + 1);
      if (secondEq !== -1) candidate = candidate.slice(0, secondEq).trim();

      const lhs = candidate.split("=")[0]?.trim() ?? "";
      if (!/[a-zA-Z]/.test(lhs)) continue;

      const rhs = candidate.split("=")[1]?.trim() ?? "";
      if (!rhs) continue;

      const rhsWords = rhs.toLowerCase().match(/[a-zA-Z]+/g) ?? [];
      if (rhsWords.some((w) => !allowedIdentifiers.has(w))) continue;

      const key = candidate.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(candidate);
    }
  }
  return results;
}

function buildSimpleDesmosDraft(context: string): DesmosGraphPayload | null {
  const equations = extractEquationCandidates(context).slice(0, 4);
  if (equations.length === 0) return null;
  return {
    expressions: equations.map((latex, i) => ({ id: `eq${i + 1}`, latex })),
    viewport: { left: -10, right: 10, bottom: -10, top: 10 },
    hint:
      equations.length === 1
        ? "Edit the equation or add another one to compare shapes."
        : "Toggle equations and zoom near intersections.",
  };
}

// ─── validation mirrors tools.ts validateDesmosPayload ─────────────────────

function validateDesmosPayload(payload: DesmosGraphPayload): {
  ok: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (payload.expressions.length === 0)
    errors.push("Must include at least one expression.");

  if (payload.viewport) {
    if (payload.viewport.left >= payload.viewport.right)
      errors.push("viewport: left must be < right.");
    if (payload.viewport.bottom >= payload.viewport.top)
      errors.push("viewport: bottom must be < top.");
  }

  const hasLatex = payload.expressions.some(
    (e) =>
      "latex" in e && typeof e.latex === "string" && e.latex.trim().length > 0,
  );
  if (!hasLatex) warnings.push("No latex equations found.");

  return { ok: errors.length === 0, errors, warnings };
}

// ─── skill instructions (mirrors lib/sparks/skills/desmosGraph.ts) ─────────

const desmosSkillInstructions = `You are building a Desmos Graph Spark artifact.

Output requirements:
- Return strict JSON with keys: title, summary, workerSummary, payload.
- payload must be a JSON object with this shape:
  {
    "expressions": [ ... ],
    "viewport": { "left": number, "right": number, "bottom": number, "top": number } optional,
    "hint": "short learner instruction" optional
  }
- expressions must be valid Desmos expression states usable with calculator.setExpressions([...]).
- Keep Desmos editable for learners (do not output read-only restrictions).
- Include meaningful content based on learner context. Use combinations of:
  - equations (latex)
  - plotted points
  - tables (type: "table", with columns)

Math and LaTeX:
- Use valid Desmos LaTeX for expression strings.
- For multi-character symbols (sin, pi, theta), use proper escaped backslashes.
- Keep expressions simple and readable; avoid malformed escaping.

Safety and implementation constraints:
- Output JSON only. Do not output HTML.
- Do not include network URLs, scripts, or markup.
- Do not include popups, navigation, or storage behavior in the payload.`;

// ─── LLM call ───────────────────────────────────────────────────────────────

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const DEFAULT_MODEL =
  process.env.SPARK_WORKER_DESMOS_MODEL ??
  process.env.SPARK_WORKER_MODEL ??
  "google/gemini-3-flash-preview";
const DEFAULT_TIMEOUT_MS = Math.min(
  20_000,
  Number.parseInt(
    process.env.SPARK_WORKER_DESMOS_TIMEOUT_MS ??
      process.env.SPARK_WORKER_TIMEOUT_MS ??
      "20000",
    10,
  ) || 20_000,
);

function buildDesmosPrompt(context: string): string {
  return [
    "Build a desmos_graph spark for an educational chat.",
    "Spark id: desmos_graph",
    "Return strict JSON with keys: title, summary, workerSummary, payload.",
    "Do not include markdown fences.",
    `Learning context: ${context}`,
    "",
    "Skill instructions:",
    desmosSkillInstructions,
  ].join("\n");
}

async function callDesmosWorker(
  context: string,
  model: string,
  timeoutMs: number,
): Promise<{
  object: z.infer<typeof desmosWorkerOutputSchema> | null;
  rawError: unknown;
  durationMs: number;
}> {
  const openrouter = createOpenRouter({ apiKey: OPENROUTER_API_KEY });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const t0 = Date.now();

  try {
    const result = await generateObject({
      model: openrouter.chat(model),
      schema: desmosWorkerOutputSchema,
      prompt: buildDesmosPrompt(context),
      temperature: 0.2,
      abortSignal: controller.signal,
      mode: "json",
    });

    return {
      object: result.object,
      rawError: null,
      durationMs: Date.now() - t0,
    };
  } catch (error) {
    return { object: null, rawError: error, durationMs: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

// ─── pretty printing helpers ─────────────────────────────────────────────────

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function ok(msg: string) {
  console.log(`${GREEN}✔ ${msg}${RESET}`);
}
function fail(msg: string) {
  console.log(`${RED}✘ ${msg}${RESET}`);
}
function warn(msg: string) {
  console.log(`${YELLOW}⚠ ${msg}${RESET}`);
}
function info(msg: string) {
  console.log(`${CYAN}  ${msg}${RESET}`);
}
function header(msg: string) {
  console.log(`\n${BOLD}${msg}${RESET}`);
}

function printExpressionsTable(expressions: DesmosExpressionState[]) {
  for (const expr of expressions) {
    const id = expr.id ?? "(no id)";
    const latex = "latex" in expr ? expr.latex : "(no latex)";
    const type = expr.type;
    if (type === "table") {
      info(
        `  [table] id=${id} columns=${JSON.stringify(expr.columns).slice(0, 80)}`,
      );
    } else {
      info(`  id=${id}  latex=${String(latex).slice(0, 80)}`);
    }
  }
}

// ─── single test run ─────────────────────────────────────────────────────────

async function runTest(
  context: string,
  model: string,
  timeoutMs: number,
  withRetry = false,
): Promise<boolean> {
  header(`Testing: "${context}"`);
  info(`Model: ${model}  Timeout: ${timeoutMs}ms`);

  // Step 1: deterministic path
  const simpleDraft = buildSimpleDesmosDraft(context);
  if (simpleDraft) {
    const validation = validateDesmosPayload(simpleDraft);
    if (validation.ok) {
      ok(`Deterministic path succeeded (no LLM needed)`);
      printExpressionsTable(simpleDraft.expressions);
      if (validation.warnings.length > 0) {
        for (const w of validation.warnings) warn(`  ${w}`);
      }
      return true;
    }
    warn(
      `Deterministic path produced invalid payload: ${validation.errors.join(", ")}`,
    );
    info("  Falling through to LLM worker...");
  } else {
    info("No equations extracted from context. Using LLM worker.");
  }

  // Step 2: LLM call via generateObject with mode: 'json'
  info(`Calling LLM worker (generateObject mode: json)...`);
  const { object, rawError, durationMs } = await callDesmosWorker(
    context,
    model,
    timeoutMs,
  );

  info(`LLM call took ${durationMs}ms`);

  if (rawError) {
    fail(`LLM call threw an error`);
    const err = rawError as Record<string, unknown>;
    if (err && typeof err === "object") {
      const name = err.name;
      const statusCode = err.statusCode;
      const code = err.code;
      const message = err.message;
      const responseBody = err.responseBody;
      const cause = err.cause;
      if (name) info(`  name: ${name}`);
      if (statusCode) info(`  statusCode: ${statusCode}`);
      if (code) info(`  code: ${code}`);
      if (message) info(`  message: ${String(message).slice(0, 300)}`);
      if (responseBody)
        info(`  responseBody: ${String(responseBody).slice(0, 400)}`);
      if (cause && typeof cause === "object") {
        const causeMsg = (cause as Record<string, unknown>).message;
        if (causeMsg)
          info(`  cause.message: ${String(causeMsg).slice(0, 200)}`);
      }
    } else {
      info(`  raw: ${String(rawError).slice(0, 300)}`);
    }
    return false;
  }

  if (!object) {
    fail(`LLM returned null object (no error thrown)`);
    return false;
  }

  ok(`LLM returned a valid object`);
  info(`  title: ${object.title}`);
  info(`  summary: ${object.summary}`);
  info(`  workerSummary: ${object.workerSummary}`);
  info(`  expressions count: ${object.payload.expressions.length}`);
  printExpressionsTable(object.payload.expressions);
  if (object.payload.viewport) {
    const vp = object.payload.viewport;
    info(
      `  viewport: left=${vp.left} right=${vp.right} bottom=${vp.bottom} top=${vp.top}`,
    );
  }

  // Step 3: validate
  const validation = validateDesmosPayload(object.payload);
  if (validation.ok) {
    ok(`Payload validation passed`);
    for (const w of validation.warnings) warn(`  ${w}`);
    return true;
  }

  fail(`Payload validation failed`);
  for (const e of validation.errors) info(`  error: ${e}`);
  for (const w of validation.warnings) warn(`  warning: ${w}`);

  // Detailed per-expression diagnosis
  info("\n  Per-expression diagnosis:");
  for (let i = 0; i < object.payload.expressions.length; i++) {
    const expr = object.payload.expressions[i];
    const hasLatex =
      "latex" in expr &&
      typeof expr.latex === "string" &&
      expr.latex.trim().length > 0;
    const type = expr.type;
    const isTable =
      type === "table" &&
      Array.isArray(expr.columns) &&
      (expr.columns as unknown[]).length > 0;
    const isTextOrExpr = type === "text" || type === "expression";
    const isValid = hasLatex || isTable || isTextOrExpr;
    if (!isValid) {
      info(`  [${i}] INVALID — keys: ${Object.keys(expr).join(", ")}`);
      info(`       full: ${JSON.stringify(expr).slice(0, 200)}`);
    } else {
      const label = hasLatex
        ? `latex: ${"latex" in expr ? expr.latex : ""}`
        : isTable
          ? "table"
          : `type=${type}`;
      info(`  [${i}] ok — ${label}`);
    }
  }

  if (!withRetry) return false;

  // Retry path (mirrors production repair logic)
  warn("  Retrying with repair prompt...");
  const r2 = await callDesmosWorker(
    context +
      "\n\nPrevious attempt produced invalid output. Please output clean, valid JSON only.",
    model,
    timeoutMs,
  );
  info(`  Retry took ${r2.durationMs}ms`);

  if (r2.rawError) {
    fail("  Retry also errored");
    return false;
  }
  if (!r2.object) {
    fail("  Retry returned null");
    return false;
  }

  ok("  Retry succeeded");
  printExpressionsTable(r2.object.payload.expressions);
  const rv = validateDesmosPayload(r2.object.payload);
  if (rv.ok) {
    ok("Retry payload validation passed");
    return true;
  }
  fail(`Retry validation failed: ${rv.errors.join(", ")}`);
  return false;
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

const BATCH_CASES = [
  // Deterministic path (equation extraction)
  "plot y = x^2",
  "visualize y = x^2, y = 2x, and y = sin(x)",
  "graph the derivative of y = x^3",
  // LLM path — standard
  "show sine and cosine waves",
  "absolute value function y = |x|",
  "compare linear and quadratic growth",
  "unit circle with sin and cos labeled",
  "logistic growth model",
  // LLM path — tables
  "create a table showing x vs x^2 for x from -3 to 3",
  "make a scatter plot from a table of experimental data points",
  // LLM path — parametric/polar
  "parametric curve of a heart shape",
  "polar rose curve r = cos(3 theta)",
  // LLM path — sliders and interactivity
  "interactive parabola with vertex slider",
  "dampened harmonic oscillator with adjustable damping",
];

async function main() {
  if (!OPENROUTER_API_KEY) {
    console.error(
      `${RED}Error: OPENROUTER_API_KEY is not set in .env.local${RESET}`,
    );
    process.exit(1);
  }

  const args = process.argv.slice(2);

  let context: string | undefined;
  let model = DEFAULT_MODEL;
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  let batch = false;
  let retry = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--context" && args[i + 1]) {
      context = args[++i];
    } else if (args[i] === "--model" && args[i + 1]) {
      model = args[++i];
    } else if (args[i] === "--timeout" && args[i + 1]) {
      timeoutMs = Number(args[++i]) || timeoutMs;
    } else if (args[i] === "--batch") {
      batch = true;
    } else if (args[i] === "--retry") {
      retry = true;
    }
  }

  if (!batch && !context) {
    console.log(`
Desmos Spark Debug CLI

Usage:
  bun agentic-testing/debug-desmos.ts --context "plot y = x^2"
  bun agentic-testing/debug-desmos.ts --context "sine wave" --model google/gemini-2.5-flash-preview
  bun agentic-testing/debug-desmos.ts --batch

Flags:
  --context <text>     Context string passed to the Desmos worker
  --model <model>      OpenRouter model ID (default: ${DEFAULT_MODEL})
  --timeout <ms>       Timeout in ms (default: ${DEFAULT_TIMEOUT_MS})
  --batch              Run all built-in test cases
  --retry              Retry failed cases with repair prompt
`);
    process.exit(0);
  }

  const cases = batch ? BATCH_CASES : [context!];
  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    const success = await runTest(c, model, timeoutMs, retry);
    if (success) passed++;
    else failed++;
  }

  if (cases.length > 1) {
    header(`Results: ${passed}/${cases.length} passed`);
    if (failed > 0) fail(`${failed} case(s) failed`);
    else ok("All cases passed");
  }
}

main().catch((error) => {
  console.error(`Fatal: ${error}`);
  process.exit(1);
});
