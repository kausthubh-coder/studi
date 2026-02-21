"use node";

import { createTool } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { z } from "zod";
import { sparkSkillById } from "../../lib/sparks/catalog";
import {
  normalizeCreateSparkInput,
  normalizeSparkSceneDraft,
  type CreateSparkToolInput,
  type CreateSparkToolResult,
  type SparkSceneValidationResult,
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
  sparkId: z.literal("scene"),
  context: z.string().min(1),
  title: z.string().optional(),
  summary: z.string().optional(),
});

type SparkSceneDraft = {
  title: string;
  summary: string;
  workerSummary: string;
  html: string;
};

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function parseSparkSceneDraftFromText(text: string): SparkSceneDraft {
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/i);
  const fallbackStart = text.indexOf("{");
  const fallbackEnd = text.lastIndexOf("}");
  const fallbackRaw =
    fallbackStart >= 0 && fallbackEnd > fallbackStart
      ? text.slice(fallbackStart, fallbackEnd + 1)
      : text;
  const raw = jsonBlockMatch?.[1] ?? fallbackRaw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Worker response was not valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Worker response JSON must be an object.");
  }

  const candidate = parsed as Partial<SparkSceneDraft>;
  if (
    typeof candidate.title !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.workerSummary !== "string" ||
    typeof candidate.html !== "string"
  ) {
    throw new Error(
      "Worker response must include string fields: title, summary, workerSummary, html.",
    );
  }

  return {
    title: candidate.title,
    summary: candidate.summary,
    workerSummary: candidate.workerSummary,
    html: candidate.html,
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

function validateSceneHtml(html: string): SparkSceneValidationResult {
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
      // Syntax-only check for inline scripts.
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
    artifact: normalizeSparkSceneDraft("scene", {
      html,
      title: "Spark Scene",
      summary: "",
      workerSummary: "",
    }),
  };
}

async function generateSceneDraft(params: {
  context: string;
  title?: string;
  summary?: string;
  skillInstructions: string;
  previousHtml?: string;
  previousErrors?: string[];
}): Promise<SparkSceneDraft> {
  const promptLines = [
    "Build a Spark Scene for an educational chat.",
    "Return strict JSON with keys: title, summary, workerSummary, html.",
    "html must be one complete HTML file string.",
    `Learning context: ${params.context}`,
    params.title ? `Preferred title: ${params.title}` : "",
    params.summary ? `Preferred summary: ${params.summary}` : "",
    "",
    "Skill instructions:",
    params.skillInstructions,
  ];

  if (params.previousHtml) {
    promptLines.push(
      "",
      "Repair this previous draft and fix validation issues:",
      params.previousHtml,
    );
  }

  if (params.previousErrors && params.previousErrors.length > 0) {
    promptLines.push(
      "",
      "Validation errors to fix:",
      params.previousErrors.map((error) => `- ${error}`).join("\n"),
    );
  }

  const result = await generateText({
    model: openrouter.chat(sparkWorkerModel),
    prompt: promptLines.filter(Boolean).join("\n"),
    temperature: 0.2,
  });

  return parseSparkSceneDraftFromText(result.text);
}

async function buildSceneSpark(
  input: CreateSparkToolInput,
): Promise<CreateSparkToolResult> {
  const skill = sparkSkillById.scene;

  const firstDraft = await generateSceneDraft({
    context: input.context,
    title: input.title,
    summary: input.summary,
    skillInstructions: skill.instructions,
  });

  const firstValidation = validateSceneHtml(firstDraft.html);

  if (firstValidation.ok) {
    return {
      status: "success",
      workerSummary: firstDraft.workerSummary,
      warnings: firstValidation.warnings,
      artifact: normalizeSparkSceneDraft("scene", firstDraft),
    };
  }

  const repairedDraft = await generateSceneDraft({
    context: input.context,
    title: input.title,
    summary: input.summary,
    skillInstructions: skill.instructions,
    previousHtml: firstDraft.html,
    previousErrors: firstValidation.errors,
  });

  const repairedValidation = validateSceneHtml(repairedDraft.html);
  if (repairedValidation.ok) {
    return {
      status: "success",
      workerSummary: repairedDraft.workerSummary,
      warnings: repairedValidation.warnings,
      artifact: normalizeSparkSceneDraft("scene", repairedDraft),
    };
  }

  return {
    status: "failed",
    workerSummary:
      repairedDraft.workerSummary ||
      "Spark worker could not produce a valid scene in two attempts.",
    warnings: [...firstValidation.warnings, ...repairedValidation.warnings],
    error: repairedValidation.errors.join(" "),
  };
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
