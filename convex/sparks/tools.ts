"use node";

import { createTool } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";
import { sparkSkillById } from "../../lib/sparks/catalog";
import {
  normalizeCreateSparkInput,
  normalizeSparkDesmosGraphDraft,
  normalizeSparkSceneDraft,
  type CreateSparkToolInput,
  type CreateSparkToolResult,
  type DesmosGraphPayload,
  type DesmosSparkDraft,
  type JsonValue,
  type SparkType,
  type SparkValidationResult,
} from "../../lib/sparks/contracts";

const openRouterApiKey = process.env.OPENROUTER_API_KEY;

if (!openRouterApiKey) {
  throw new Error(
    "OPENROUTER_API_KEY is missing. Set it in .env.local and Convex env vars.",
  );
}

const sceneWorkerModel =
  process.env.SPARK_WORKER_SCENE_MODEL ??
  process.env.SPARK_WORKER_MODEL ??
  "google/gemini-3-flash-preview";

const desmosWorkerModel =
  process.env.SPARK_WORKER_DESMOS_MODEL ??
  process.env.SPARK_WORKER_MODEL ??
  "google/gemini-3-flash-preview";

function parseSparkWorkerTimeoutMs(
  value: string | undefined,
  fallbackMs = 18_000,
): number {
  const parsed = Number.parseInt(value ?? String(fallbackMs), 10);
  if (!Number.isFinite(parsed)) {
    return fallbackMs;
  }
  return Math.min(120_000, Math.max(2_000, parsed));
}

const sparkWorkerTimeoutMs = parseSparkWorkerTimeoutMs(
  process.env.SPARK_WORKER_TIMEOUT_MS,
);

const desmosWorkerTimeoutMs = parseSparkWorkerTimeoutMs(
  process.env.SPARK_WORKER_DESMOS_TIMEOUT_MS,
  Math.min(sparkWorkerTimeoutMs, 20_000),
);

const sceneWorkerTimeoutMs = parseSparkWorkerTimeoutMs(
  process.env.SPARK_WORKER_SCENE_TIMEOUT_MS,
  Math.min(sparkWorkerTimeoutMs, 35_000),
);

const tailwindBrowserScriptSrc =
  "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4";

const openrouter = createOpenRouter({
  apiKey: openRouterApiKey,
});

const createSparkInputSchema = z.object({
  sparkId: z
    .enum(["scene", "desmos_graph"])
    .describe("Spark id to generate. Use scene or desmos_graph."),
  context: z
    .string()
    .min(1)
    .describe("Short description of what the learner should explore."),
  title: z
    .string()
    .optional()
    .describe("Optional display title for the spark artifact."),
  summary: z
    .string()
    .optional()
    .describe("Optional one-line display summary for the spark artifact."),
});

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const desmosExpressionSchema = z.record(z.string(), jsonValueSchema);

const desmosPayloadSchema: z.ZodType<DesmosGraphPayload> = z
  .object({
    expressions: z.array(desmosExpressionSchema).min(1),
    settings: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    viewport: z
      .object({
        left: z.number(),
        right: z.number(),
        bottom: z.number(),
        top: z.number(),
      })
      .optional(),
    hint: z.string().optional(),
  })
  .refine(
    (payload) =>
      payload.expressions.every((expression) => {
        const latex = expression.latex;
        if (typeof latex === "string" && latex.trim().length > 0) {
          return true;
        }

        const type = expression.type;
        const columns = expression.columns;
        return type === "table" && Array.isArray(columns) && columns.length > 0;
      }),
    {
      message:
        "Each Desmos expression must include latex, or be a table with columns.",
    },
  );

const sceneWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  html: z.string(),
});

const desmosWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: desmosPayloadSchema,
});

type SceneDraft = z.infer<typeof sceneWorkerOutputSchema>;
type DesmosDraft = z.infer<typeof desmosWorkerOutputSchema>;

type WorkerErrorKind = "timeout" | "cancelled" | "provider" | "other";

class SparkWorkerError extends Error {
  kind: WorkerErrorKind;
  model: string;

  constructor(kind: WorkerErrorKind, model: string, message: string) {
    super(message);
    this.name = "SparkWorkerError";
    this.kind = kind;
    this.model = model;
  }
}

function truncateText(text: string, maxLength: number): string {
  return text.length <= maxLength
    ? text
    : `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function extractProviderErrorDetails(error: unknown): string | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const candidate = error as Record<string, unknown>;
  const parts: string[] = [];

  const name = candidate.name;
  if (typeof name === "string" && name.trim()) {
    parts.push(`name=${name.trim()}`);
  }

  const statusCode = candidate.statusCode;
  if (typeof statusCode === "number") {
    parts.push(`status=${statusCode}`);
  }

  const code = candidate.code;
  if (typeof code === "string" && code.trim()) {
    parts.push(`code=${code.trim()}`);
  }

  const message = candidate.message;
  if (typeof message === "string" && message.trim()) {
    parts.push(`message=${truncateText(message.trim(), 240)}`);
  }

  const responseBody = candidate.responseBody;
  if (typeof responseBody === "string" && responseBody.trim()) {
    parts.push(`response=${truncateText(responseBody.trim(), 240)}`);
  }

  const cause = candidate.cause;
  if (cause && typeof cause === "object") {
    const causeRecord = cause as Record<string, unknown>;
    const causeMessage = causeRecord.message;
    if (typeof causeMessage === "string" && causeMessage.trim()) {
      parts.push(`cause=${truncateText(causeMessage.trim(), 200)}`);
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" | ");
}

function isProviderError(error: unknown): boolean {
  if (extractProviderErrorDetails(error)) {
    return true;
  }

  const message = toMessage(error).toLowerCase();
  return (
    message.includes("provider returned error") ||
    message.includes("api call") ||
    message.includes("status code")
  );
}

function toMessage(error: unknown): string {
  const providerDetails = extractProviderErrorDetails(error);
  if (providerDetails) {
    return providerDetails;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function toProviderFaultMessage(error: unknown): string {
  if (
    error instanceof SparkWorkerError &&
    (error.kind === "provider" ||
      error.kind === "timeout" ||
      error.kind === "cancelled")
  ) {
    return `Provider fault: ${toMessage(error)}`;
  }

  return toMessage(error);
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "AbortError" || /aborted/i.test(error.message);
}

function extractInlineScriptBlocks(html: string): string[] {
  const blocks: string[] = [];
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    blocks.push(match[1] ?? "");
  }

  return blocks;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractExternalScriptSrcs(html: string): string[] {
  const sources: string[] = [];
  const scriptSrcPattern = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(scriptSrcPattern)) {
    const src = (match[1] ?? "").trim();
    if (src) {
      sources.push(src);
    }
  }

  return sources;
}

function normalizeScriptSource(src: string): string {
  try {
    const parsed = new URL(src);
    const pathname = parsed.pathname.endsWith("/")
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname;
    return `${parsed.origin}${pathname}`;
  } catch {
    return src.trim();
  }
}

function normalizeSceneHtmlWithTemplate(html: string): string {
  const trimmed = html.trim();
  let normalized = trimmed;

  if (!/<html[\s>]/i.test(normalized)) {
    normalized = `<html><head></head><body>${normalized}</body></html>`;
  }

  if (!/<head[\s>]/i.test(normalized)) {
    normalized = normalized.replace(/<html([^>]*)>/i, "<html$1><head></head>");
  }

  if (!/<body[\s>]/i.test(normalized)) {
    if (/<\/head>/i.test(normalized)) {
      normalized = normalized.replace(/<\/head>/i, "</head><body></body>");
    } else if (/<\/html>/i.test(normalized)) {
      normalized = normalized.replace(/<\/html>/i, "<body></body></html>");
    } else {
      normalized = `${normalized}<body></body>`;
    }
  }

  normalized = normalized.replace(
    /<head([^>]*)>([\s\S]*?)<\/head>/i,
    (_full, attrs: string, headContent: string) => {
      let nextHeadContent = headContent;

      if (!/<meta\b[^>]*charset\s*=\s*/i.test(nextHeadContent)) {
        nextHeadContent = `\n    <meta charset="UTF-8" />${nextHeadContent}`;
      }

      if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(nextHeadContent)) {
        nextHeadContent = `\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />${nextHeadContent}`;
      }

      const tailwindScriptPattern = new RegExp(
        `<script\\b[^>]*\\bsrc\\s*=\\s*["']${escapeRegExp(tailwindBrowserScriptSrc)}["'][^>]*>\\s*<\\/script>`,
        "i",
      );
      if (!tailwindScriptPattern.test(nextHeadContent)) {
        nextHeadContent = `\n    <script src="${tailwindBrowserScriptSrc}"></script>${nextHeadContent}`;
      }

      return `<head${attrs}>${nextHeadContent}\n  </head>`;
    },
  );

  if (!/<!doctype html>/i.test(normalized)) {
    normalized = `<!doctype html>\n${normalized}`;
  }

  return normalized;
}

function validateSceneHtml(html: string): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!html.trim()) {
    errors.push("Scene HTML is empty.");
  }

  if (!/<!doctype html>/i.test(html)) {
    warnings.push("Scene HTML is missing <!doctype html>.");
  }

  if (!/<html[\s>]/i.test(html)) {
    errors.push("Scene HTML must include an <html> root element.");
  }

  if (!/<body[\s>]/i.test(html)) {
    warnings.push("Scene HTML is missing a <body> element.");
  }

  const externalScriptSrcs = extractExternalScriptSrcs(html);
  const disallowedScriptSrcs = externalScriptSrcs.filter(
    (src) => normalizeScriptSource(src) !== tailwindBrowserScriptSrc,
  );
  if (disallowedScriptSrcs.length > 0) {
    errors.push(
      `External script is not allowed: ${disallowedScriptSrcs[0]}. Only ${tailwindBrowserScriptSrc} is permitted.`,
    );
  }

  if (/\bfetch\(/i.test(html)) {
    warnings.push(
      "Scene HTML uses fetch(). Avoid network calls when possible.",
    );
  }

  if (html.length > 16_000) {
    errors.push("Scene HTML is too large. Keep it under 16,000 characters.");
  }

  const scripts = extractInlineScriptBlocks(html);
  if (scripts.some((script) => script.trim().length > 0)) {
    warnings.push(
      "Inline script syntax checks are skipped in this runtime environment.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function validateDesmosPayload(
  payload: DesmosGraphPayload,
): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (payload.expressions.length === 0) {
    errors.push("Desmos payload must include at least one expression.");
  }

  if (payload.viewport) {
    if (payload.viewport.left >= payload.viewport.right) {
      errors.push("Desmos viewport must satisfy left < right.");
    }
    if (payload.viewport.bottom >= payload.viewport.top) {
      errors.push("Desmos viewport must satisfy bottom < top.");
    }
  }

  const hasEquation = payload.expressions.some((expression) => {
    const latex = expression.latex;
    return typeof latex === "string" && latex.trim().length > 0;
  });
  if (!hasEquation) {
    warnings.push("Desmos payload has no latex equations.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function extractEquationCandidates(context: string): string[] {
  const blockers = [
    "table",
    "slider",
    "parametric",
    "polar",
    "inequality",
    "piecewise",
    "regression",
  ];
  const allowedMathWords = new Set([
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
  ]);

  const normalizedContext = context.replace(/\s+/g, " ").trim();
  const lowered = normalizedContext.toLowerCase();
  if (blockers.some((token) => lowered.includes(token))) {
    return [];
  }

  const chunks = normalizedContext
    .replace(/i\.e\./gi, "")
    .split(/\n|,|;|\band\b|\bplus\b|\bwith\b/gi)
    .map((part) =>
      part
        .replace(/^[^a-zA-Z0-9(\-]+/, "")
        .replace(/[^a-zA-Z0-9)\]}]+$/, "")
        .trim(),
    )
    .filter(Boolean);

  const results: string[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    if (!chunk.includes("=")) {
      continue;
    }

    let candidate = chunk
      .replace(/^(graph|plot|show|line|curve|equation|function)\s+/i, "")
      .replace(/^(the\s+)?(line|curve|parabola|equation|function)\s+/i, "")
      .replace(/^\(?\s*/, "")
      .replace(/\s*\)?$/, "")
      .trim();

    candidate = candidate
      .replace(/\([^)]*\)/g, " ")
      .replace(/\([^)]*$/, "")
      .replace(/\)\s+.*$/, "")
      .replace(/\.\s+.*$/, "")
      .replace(/\s+\b(on|where|for|to|in)\b\s+.*$/i, "")
      .trim();

    const firstEquals = candidate.indexOf("=");
    const secondEquals =
      firstEquals === -1 ? -1 : candidate.indexOf("=", firstEquals + 1);
    if (secondEquals !== -1) {
      candidate = candidate.slice(0, secondEquals).trim();
    }

    if (!candidate.includes("=") || !/[a-z]/i.test(candidate)) {
      continue;
    }

    if (candidate.length > 80 || /https?:\/\//i.test(candidate)) {
      continue;
    }

    candidate = candidate.replace(/\s+/g, " ");

    const words = candidate.toLowerCase().match(/[a-z]+/g) ?? [];
    const hasDisallowedWord = words.some(
      (word) => word.length > 2 && !allowedMathWords.has(word),
    );
    if (hasDisallowedWord) {
      continue;
    }

    const key = candidate.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    results.push(candidate);
  }

  return results;
}

function buildSimpleDesmosDraft(
  input: CreateSparkToolInput,
): DesmosSparkDraft | null {
  const equations = extractEquationCandidates(input.context).slice(0, 4);

  if (equations.length === 0) {
    return null;
  }

  const joined = equations.join(" and ");
  const title =
    input.title ?? (equations.length === 1 ? equations[0] : "Equation Graphs");
  const summary =
    input.summary ??
    (equations.length === 1
      ? `Explore ${equations[0]} interactively.`
      : `Explore ${joined} on the same graph.`);

  return {
    title,
    summary,
    workerSummary:
      equations.length === 1
        ? `Created a deterministic Desmos graph for ${equations[0]}.`
        : `Created a deterministic Desmos graph for ${joined}.`,
    payload: {
      expressions: equations.map((latex, index) => ({
        id: `eq${index + 1}`,
        latex,
      })),
      viewport: {
        left: -10,
        right: 10,
        bottom: -10,
        top: 10,
      },
      hint:
        equations.length === 1
          ? "Edit the equation or add another one to compare shapes."
          : "Toggle equations and zoom near intersections.",
    },
  };
}

function createTimeoutSignal(
  abortSignal?: AbortSignal,
  timeoutMs = sparkWorkerTimeoutMs,
): {
  signal: AbortSignal;
  cleanup: () => void;
  didTimeout: () => boolean;
  wasCancelled: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;
  let cancelled = false;

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onAbort = () => {
    cancelled = true;
    controller.abort();
  };

  if (abortSignal) {
    if (abortSignal.aborted) {
      onAbort();
    } else {
      abortSignal.addEventListener("abort", onAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    wasCancelled: () => cancelled,
    cleanup: () => {
      clearTimeout(timeoutId);
      if (abortSignal) {
        abortSignal.removeEventListener("abort", onAbort);
      }
    },
  };
}

async function generateWorkerObjectForModel<T>(params: {
  schema: z.ZodType<T>;
  prompt: string;
  model: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}): Promise<T> {
  const timeoutMs = params.timeoutMs ?? sparkWorkerTimeoutMs;
  const timeout = createTimeoutSignal(params.abortSignal, timeoutMs);

  try {
    const result = await generateObject({
      model: openrouter.chat(params.model),
      schema: params.schema,
      prompt: params.prompt,
      temperature: 0.2,
      abortSignal: timeout.signal,
    });

    return result.object;
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new SparkWorkerError(
        "timeout",
        params.model,
        `Spark worker timed out after ${timeoutMs}ms (model: ${params.model}).`,
      );
    }
    if (timeout.wasCancelled() || isAbortError(error)) {
      throw new SparkWorkerError(
        "cancelled",
        params.model,
        `Spark generation was cancelled (model: ${params.model}).`,
      );
    }

    if (isProviderError(error)) {
      const detail = extractProviderErrorDetails(error) ?? toMessage(error);
      throw new SparkWorkerError(
        "provider",
        params.model,
        `Spark worker provider error (model: ${params.model}) - ${detail}`,
      );
    }

    throw new SparkWorkerError(
      "other",
      params.model,
      `Spark worker error (model: ${params.model}) - ${toMessage(error)}`,
    );
  } finally {
    timeout.cleanup();
  }
}

async function generateWorkerObject<T>(params: {
  schema: z.ZodType<T>;
  prompt: string;
  model: string;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
}): Promise<{ object: T; warnings: string[] }> {
  const object = await generateWorkerObjectForModel({
    schema: params.schema,
    prompt: params.prompt,
    model: params.model,
    abortSignal: params.abortSignal,
    timeoutMs: params.timeoutMs,
  });

  return {
    object,
    warnings: [],
  };
}

function buildPrompt(params: {
  sparkType: SparkType;
  context: string;
  title?: string;
  summary?: string;
  skillInstructions: string;
  previousOutput?: string;
  previousErrors?: string[];
}): string {
  const outputRequirements =
    params.sparkType === "scene"
      ? [
          "Return strict JSON with keys: title, summary, workerSummary, html.",
          "Do not include markdown fences.",
        ]
      : [
          "Return strict JSON with keys: title, summary, workerSummary, payload.",
          "Do not include markdown fences.",
        ];

  const lines = [
    `Build a ${params.sparkType} spark for an educational chat.`,
    `Spark id: ${params.sparkType}`,
    ...outputRequirements,
    `Learning context: ${params.context}`,
    params.title ? `Preferred title: ${params.title}` : "",
    params.summary ? `Preferred summary: ${params.summary}` : "",
    "",
    "Skill instructions:",
    params.skillInstructions,
  ];

  if (params.previousOutput) {
    lines.push("", "Repair this previous draft:", params.previousOutput);
  }

  if (params.previousErrors && params.previousErrors.length > 0) {
    lines.push(
      "",
      "Validation errors to fix:",
      params.previousErrors.map((error) => `- ${error}`).join("\n"),
    );
  }

  return lines.filter(Boolean).join("\n");
}

async function buildSceneSpark(
  input: CreateSparkToolInput,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResult> {
  const skill = sparkSkillById.scene;
  let firstDraft: SceneDraft | null = null;
  let firstErrors: string[] = [];
  const firstWarnings: string[] = [];

  try {
    const prompt = buildPrompt({
      sparkType: "scene",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
    });

    const firstGeneration = await generateWorkerObject<SceneDraft>({
      schema: sceneWorkerOutputSchema,
      prompt,
      model: sceneWorkerModel,
      abortSignal,
      timeoutMs: sceneWorkerTimeoutMs,
    });
    firstDraft = {
      ...firstGeneration.object,
      html: normalizeSceneHtmlWithTemplate(firstGeneration.object.html),
    };
    firstWarnings.push(...firstGeneration.warnings);

    const firstValidation = validateSceneHtml(firstDraft.html);
    firstErrors = firstValidation.errors;
    firstWarnings.push(...firstValidation.warnings);

    if (firstValidation.ok) {
      return {
        status: "success",
        workerSummary: firstDraft.workerSummary,
        warnings: firstWarnings,
        artifact: normalizeSparkSceneDraft(firstDraft),
      };
    }
  } catch (error) {
    if (
      error instanceof SparkWorkerError &&
      (error.kind === "provider" ||
        error.kind === "timeout" ||
        error.kind === "cancelled")
    ) {
      return {
        status: "failed",
        workerSummary: "Scene generation failed due to provider fault.",
        warnings: firstWarnings,
        error: toProviderFaultMessage(error),
      };
    }

    firstErrors = [toMessage(error)];
  }

  if (!firstDraft) {
    return {
      status: "failed",
      workerSummary: "Spark worker failed before scene repair.",
      warnings: firstWarnings,
      error:
        firstErrors[0] ??
        "Spark worker could not produce an initial scene draft.",
    };
  }

  try {
    const repairPrompt = buildPrompt({
      sparkType: "scene",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
      previousOutput: firstDraft ? JSON.stringify(firstDraft) : undefined,
      previousErrors: firstErrors,
    });

    const repairedGeneration = await generateWorkerObject<SceneDraft>({
      schema: sceneWorkerOutputSchema,
      prompt: repairPrompt,
      model: sceneWorkerModel,
      abortSignal,
      timeoutMs: sceneWorkerTimeoutMs,
    });
    const repairedDraft = {
      ...repairedGeneration.object,
      html: normalizeSceneHtmlWithTemplate(repairedGeneration.object.html),
    };
    firstWarnings.push(...repairedGeneration.warnings);

    const repairedValidation = validateSceneHtml(repairedDraft.html);
    if (repairedValidation.ok) {
      return {
        status: "success",
        workerSummary: repairedDraft.workerSummary,
        warnings: [...firstWarnings, ...repairedValidation.warnings],
        artifact: normalizeSparkSceneDraft(repairedDraft),
      };
    }

    return {
      status: "failed",
      workerSummary:
        repairedDraft.workerSummary ||
        "Spark worker could not produce a valid scene in two attempts.",
      warnings: [...firstWarnings, ...repairedValidation.warnings],
      error: repairedValidation.errors.join(" "),
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Scene repair failed due to provider fault.",
      warnings: firstWarnings,
      error: toProviderFaultMessage(error),
    };
  }
}

async function buildDesmosGraphSpark(
  input: CreateSparkToolInput,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResult> {
  const skill = sparkSkillById.desmos_graph;
  const firstWarnings: string[] = [];

  const simpleDraft = buildSimpleDesmosDraft(input);
  if (simpleDraft) {
    const validation = validateDesmosPayload(simpleDraft.payload);
    if (validation.ok) {
      return {
        status: "success",
        workerSummary:
          simpleDraft.workerSummary ??
          "Created deterministic Desmos graph payload.",
        warnings: [...firstWarnings, ...validation.warnings],
        artifact: normalizeSparkDesmosGraphDraft(simpleDraft),
      };
    }
  }

  try {
    const prompt = buildPrompt({
      sparkType: "desmos_graph",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
    });

    const firstGeneration = await generateWorkerObject<DesmosDraft>({
      schema: desmosWorkerOutputSchema,
      prompt,
      model: desmosWorkerModel,
      abortSignal,
      timeoutMs: desmosWorkerTimeoutMs,
    });
    const firstDraft = firstGeneration.object;
    firstWarnings.push(...firstGeneration.warnings);

    const firstValidation = validateDesmosPayload(firstDraft.payload);
    firstWarnings.push(...firstValidation.warnings);

    if (firstValidation.ok) {
      return {
        status: "success",
        workerSummary: firstDraft.workerSummary,
        warnings: firstWarnings,
        artifact: normalizeSparkDesmosGraphDraft(firstDraft),
      };
    }

    return {
      status: "failed",
      workerSummary:
        firstDraft.workerSummary ||
        "Desmos spark payload failed validation in the first attempt.",
      warnings: firstWarnings,
      error: firstValidation.errors.join(" "),
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Desmos generation failed due to provider fault.",
      warnings: firstWarnings,
      error: toProviderFaultMessage(error),
    };
  }
}

const sparkTool = createTool<CreateSparkToolInput, CreateSparkToolResult>({
  description:
    "Create a Spark artifact for inline learning interaction. Provide the sparkId and focused learner context.",
  args: createSparkInputSchema,
  handler: async (_ctx, args, options) => {
    const input = normalizeCreateSparkInput(args);

    try {
      if (input.sparkId === "scene") {
        return await buildSceneSpark(input, options.abortSignal);
      }

      if (input.sparkId === "desmos_graph") {
        return await buildDesmosGraphSpark(input, options.abortSignal);
      }

      return {
        status: "failed",
        workerSummary: "Unsupported spark type.",
        warnings: [],
        error: `Unsupported sparkId: ${input.sparkId}`,
      };
    } catch (error) {
      return {
        status: "failed",
        workerSummary: "Spark worker crashed while building the artifact.",
        warnings: [],
        error: toMessage(error),
      };
    }
  },
});

export const createSparkTool = sparkTool;
