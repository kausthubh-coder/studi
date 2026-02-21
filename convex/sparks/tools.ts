"use node";

import { createTool } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";
import { sparkSkillById } from "../../lib/sparks/catalog";
import {
  isCreateSparkToolResult,
  normalizeCreateSparkInput,
  normalizeSparkDesmosGraphDraft,
  normalizeSparkSceneDraft,
  type CreateSparkToolInput,
  type CreateSparkToolResult,
  type DesmosGraphPayload,
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

const sparkWorkerModel = process.env.SPARK_WORKER_MODEL ?? "z-ai/glm-5";
const sparkWorkerFallbackModel =
  process.env.SPARK_WORKER_FALLBACK_MODEL ?? "z-ai/glm-5";

function parseSparkWorkerTimeoutMs(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "18000", 10);
  if (!Number.isFinite(parsed)) {
    return 18_000;
  }
  return Math.min(120_000, Math.max(2_000, parsed));
}

const sparkWorkerTimeoutMs = parseSparkWorkerTimeoutMs(
  process.env.SPARK_WORKER_TIMEOUT_MS,
);

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

function isRetryableProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return true;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === "number") {
    if (statusCode >= 500 || statusCode === 429) {
      return true;
    }
    if (statusCode >= 400 && statusCode < 500) {
      const message = toMessage(error).toLowerCase();
      return message.includes("unsupported") || message.includes("model");
    }
  }

  return true;
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

  if (/<script\b[^>]*\ssrc\s*=\s*/i.test(html)) {
    errors.push("External script tags are not allowed. Inline scripts only.");
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
  for (const script of scripts) {
    if (!script.trim()) {
      continue;
    }
    try {
      new Function(script);
    } catch (error) {
      errors.push(`Inline script syntax error: ${toMessage(error)}`);
      break;
    }
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

function createTimeoutSignal(abortSignal?: AbortSignal): {
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
  }, sparkWorkerTimeoutMs);

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
}): Promise<T> {
  const timeout = createTimeoutSignal(params.abortSignal);

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
        `Spark worker timed out after ${sparkWorkerTimeoutMs}ms (model: ${params.model}).`,
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
  abortSignal?: AbortSignal;
}): Promise<{ object: T; warnings: string[] }> {
  const modelsToTry = Array.from(
    new Set([sparkWorkerModel, sparkWorkerFallbackModel].filter(Boolean)),
  );

  const warnings: string[] = [];
  let firstError: SparkWorkerError | null = null;

  for (let index = 0; index < modelsToTry.length; index += 1) {
    const model = modelsToTry[index];

    try {
      const object = await generateWorkerObjectForModel({
        schema: params.schema,
        prompt: params.prompt,
        model,
        abortSignal: params.abortSignal,
      });

      if (index > 0) {
        warnings.push(`Recovered using fallback worker model: ${model}.`);
      }

      return { object, warnings };
    } catch (error) {
      const workerError =
        error instanceof SparkWorkerError
          ? error
          : new SparkWorkerError("other", model, toMessage(error));

      if (!firstError) {
        firstError = workerError;
      }

      const hasAnotherModel = index < modelsToTry.length - 1;
      const shouldFailOver =
        workerError.kind === "provider" &&
        hasAnotherModel &&
        isRetryableProviderError(error);

      if (shouldFailOver) {
        warnings.push(
          `Primary worker model failed (${model}); retrying with fallback model.`,
        );
        continue;
      }

      throw workerError;
    }
  }

  if (firstError) {
    throw firstError;
  }

  throw new SparkWorkerError(
    "other",
    sparkWorkerModel,
    "Spark worker failed before model execution.",
  );
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

    const firstGeneration = await generateWorkerObject({
      schema: sceneWorkerOutputSchema,
      prompt,
      abortSignal,
    });
    firstDraft = firstGeneration.object;
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
    firstErrors = [toMessage(error)];
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

    const repairedGeneration = await generateWorkerObject({
      schema: sceneWorkerOutputSchema,
      prompt: repairPrompt,
      abortSignal,
    });
    const repairedDraft = repairedGeneration.object;
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
      workerSummary: "Spark worker failed to repair the scene draft.",
      warnings: firstWarnings,
      error: toMessage(error),
    };
  }
}

async function buildDesmosGraphSpark(
  input: CreateSparkToolInput,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResult> {
  const skill = sparkSkillById.desmos_graph;
  let firstDraft: DesmosDraft | null = null;
  let firstErrors: string[] = [];
  const firstWarnings: string[] = [];

  try {
    const prompt = buildPrompt({
      sparkType: "desmos_graph",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
    });

    const firstGeneration = await generateWorkerObject({
      schema: desmosWorkerOutputSchema,
      prompt,
      abortSignal,
    });
    firstDraft = firstGeneration.object;
    firstWarnings.push(...firstGeneration.warnings);

    const firstValidation = validateDesmosPayload(firstDraft.payload);
    firstErrors = firstValidation.errors;
    firstWarnings.push(...firstValidation.warnings);

    if (firstValidation.ok) {
      return {
        status: "success",
        workerSummary: firstDraft.workerSummary,
        warnings: firstWarnings,
        artifact: normalizeSparkDesmosGraphDraft(firstDraft),
      };
    }
  } catch (error) {
    firstErrors = [toMessage(error)];
  }

  try {
    const repairPrompt = buildPrompt({
      sparkType: "desmos_graph",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
      previousOutput: firstDraft ? JSON.stringify(firstDraft) : undefined,
      previousErrors: firstErrors,
    });

    const repairedGeneration = await generateWorkerObject({
      schema: desmosWorkerOutputSchema,
      prompt: repairPrompt,
      abortSignal,
    });
    const repairedDraft = repairedGeneration.object;
    firstWarnings.push(...repairedGeneration.warnings);

    const repairedValidation = validateDesmosPayload(repairedDraft.payload);
    if (repairedValidation.ok) {
      return {
        status: "success",
        workerSummary: repairedDraft.workerSummary,
        warnings: [...firstWarnings, ...repairedValidation.warnings],
        artifact: normalizeSparkDesmosGraphDraft(repairedDraft),
      };
    }

    return {
      status: "failed",
      workerSummary:
        repairedDraft.workerSummary ||
        "Spark worker could not produce a valid Desmos graph in two attempts.",
      warnings: [...firstWarnings, ...repairedValidation.warnings],
      error: repairedValidation.errors.join(" "),
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Spark worker failed to repair the Desmos draft.",
      warnings: firstWarnings,
      error: toMessage(error),
    };
  }
}

function summarizeSparkResultForModel(result: unknown): string {
  if (!isCreateSparkToolResult(result)) {
    return "Spark tool returned an unexpected result.";
  }

  if (result.status === "failed") {
    return `Spark failed: ${result.error}`;
  }

  const sparkType = result.artifact.sparkType;
  const title = result.artifact.title;
  const summary = result.workerSummary.trim();
  const warningSummary =
    result.warnings.length > 0
      ? ` Warnings: ${result.warnings.slice(0, 2).join("; ")}`
      : "";

  return `Spark created (${sparkType}) titled "${title}". ${summary}${warningSummary}`;
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

(
  sparkTool as typeof sparkTool & {
    toModelOutput?: (
      options: { output: CreateSparkToolResult } | CreateSparkToolResult,
    ) => { type: "text"; value: string };
  }
).toModelOutput = (options) => {
  const output =
    "output" in options ? options.output : (options as CreateSparkToolResult);

  return {
    type: "text",
    value: summarizeSparkResultForModel(output),
  };
};

export const createSparkTool = sparkTool;
