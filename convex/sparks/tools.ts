"use node";

import { createTool } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { z } from "zod";
import { sparkSkillById } from "../../lib/sparks/catalog";
import {
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

type SceneDraft = {
  title: string;
  summary: string;
  workerSummary: string;
  html: string;
};

type DesmosDraft = {
  title: string;
  summary: string;
  workerSummary: string;
  payload: DesmosGraphPayload;
};

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function parseJsonObjectFromText(text: string): unknown {
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);
  const fallbackStart = text.indexOf("{");
  const fallbackEnd = text.lastIndexOf("}");
  const fallbackRaw =
    fallbackStart >= 0 && fallbackEnd > fallbackStart
      ? text.slice(fallbackStart, fallbackEnd + 1)
      : text;
  const raw = jsonBlockMatch?.[1] ?? fallbackRaw;

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Worker response was not valid JSON.");
  }
}

function parseSceneDraftFromText(text: string): SceneDraft {
  const parsed = parseJsonObjectFromText(text);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Worker response JSON must be an object.");
  }

  const candidate = parsed as Partial<SceneDraft>;
  if (
    typeof candidate.title !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.workerSummary !== "string" ||
    typeof candidate.html !== "string"
  ) {
    throw new Error(
      "Scene response must include string fields: title, summary, workerSummary, html.",
    );
  }

  return {
    title: candidate.title,
    summary: candidate.summary,
    workerSummary: candidate.workerSummary,
    html: candidate.html,
  };
}

function parseDesmosDraftFromText(text: string): DesmosDraft {
  const parsed = parseJsonObjectFromText(text);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Worker response JSON must be an object.");
  }

  const candidate = parsed as {
    title?: unknown;
    summary?: unknown;
    workerSummary?: unknown;
    payload?: unknown;
    graph?: unknown;
  };

  if (
    typeof candidate.title !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.workerSummary !== "string"
  ) {
    throw new Error(
      "Desmos response must include string fields: title, summary, workerSummary.",
    );
  }

  const rawPayload = candidate.payload ?? candidate.graph;
  const payloadResult = desmosPayloadSchema.safeParse(rawPayload);
  if (!payloadResult.success) {
    throw new Error(
      `Invalid desmos payload: ${payloadResult.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
    );
  }

  return {
    title: candidate.title,
    summary: candidate.summary,
    workerSummary: candidate.workerSummary,
    payload: payloadResult.data,
  };
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

async function generateWorkerText(prompt: string): Promise<string> {
  const result = await generateText({
    model: openrouter.chat(sparkWorkerModel),
    prompt,
    temperature: 0.2,
  });

  return result.text;
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
          "html must be one complete HTML file string.",
        ]
      : [
          "Return strict JSON with keys: title, summary, workerSummary, payload.",
          "payload must be a JSON object compatible with Desmos setExpressions usage.",
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
): Promise<CreateSparkToolResult> {
  const skill = sparkSkillById.scene;
  let firstRaw = "";
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
    firstRaw = await generateWorkerText(prompt);
    const firstDraft = parseSceneDraftFromText(firstRaw);
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
      previousOutput: firstRaw,
      previousErrors: firstErrors,
    });
    const repairedRaw = await generateWorkerText(repairPrompt);
    const repairedDraft = parseSceneDraftFromText(repairedRaw);
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
): Promise<CreateSparkToolResult> {
  const skill = sparkSkillById.desmos_graph;
  let firstRaw = "";
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
    firstRaw = await generateWorkerText(prompt);
    const firstDraft = parseDesmosDraftFromText(firstRaw);
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
      previousOutput: firstRaw,
      previousErrors: firstErrors,
    });
    const repairedRaw = await generateWorkerText(repairPrompt);
    const repairedDraft = parseDesmosDraftFromText(repairedRaw);
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

export const createSparkTool = createTool<
  CreateSparkToolInput,
  CreateSparkToolResult
>({
  description:
    "Create a Spark artifact for inline learning interaction. Provide the sparkId and focused learner context.",
  args: createSparkInputSchema,
  handler: async (_ctx, args) => {
    const input = normalizeCreateSparkInput(args);

    try {
      if (input.sparkId === "scene") {
        return await buildSceneSpark(input);
      }

      if (input.sparkId === "desmos_graph") {
        return await buildDesmosGraphSpark(input);
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
