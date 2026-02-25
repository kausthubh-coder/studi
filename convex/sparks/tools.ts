"use node";

import { createTool } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import type { FunctionReference } from "convex/server";
import { z } from "zod";
import {
  getActiveModelConfig,
  getModelConfig,
  type ModelConfig,
  type ModelProfile,
} from "../../lib/model-config";
import { renderPrompt } from "../../lib/prompts";
import { sparkSkillById } from "../../lib/sparks/catalog";
import {
  getSparkTypeLabel,
  normalizeSparkFlashCardDraft,
  normalizeSparkCodePlaygroundDraft,
  normalizeSparkWebPlaygroundDraft,
  normalizeCreateSparkInput,
  normalizeSparkQuizDraft,
  type CodePlaygroundPayload,
  type CodePlaygroundSparkDraft,
  type FlashCardSparkDraft,
  type FlashCardSparkPayload,
  normalizeSparkDesmosGraphDraft,
  normalizeSparkSceneDraft,
  type CreateSparkToolInput,
  type CreateSparkToolResult,
  type DesmosGraphPayload,
  type DesmosSparkDraft,
  type QuizSparkDraft,
  type QuizSparkPayload,
  type SparkType,
  type SparkValidationResult,
  type WebPlaygroundPayload,
  type WebPlaygroundSparkDraft,
} from "../../lib/sparks/contracts";
import { internal } from "../_generated/api";
import { capturePosthogEvent } from "../posthog";

const internalApi = internal as unknown as {
  telemetry: {
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

const openRouterApiKey = process.env.OPENROUTER_API_KEY;

if (!openRouterApiKey) {
  throw new Error(
    "OPENROUTER_API_KEY is missing. Set it in .env.local and Convex env vars.",
  );
}

type SparkWorkerModels = Pick<
  ModelConfig,
  "sparkScene" | "sparkDesmos" | "sparkCode" | "sparkQuiz" | "sparkFlash"
>;

function toSparkWorkerModels(modelConfig: ModelConfig): SparkWorkerModels {
  return {
    sparkScene: modelConfig.sparkScene,
    sparkDesmos: modelConfig.sparkDesmos,
    sparkCode: modelConfig.sparkCode,
    sparkQuiz: modelConfig.sparkQuiz,
    sparkFlash: modelConfig.sparkFlash,
  };
}

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

const codeWorkerTimeoutMs = parseSparkWorkerTimeoutMs(
  process.env.SPARK_WORKER_CODE_TIMEOUT_MS,
  Math.min(sparkWorkerTimeoutMs, 25_000),
);

const quizWorkerTimeoutMs = parseSparkWorkerTimeoutMs(
  process.env.SPARK_WORKER_QUIZ_TIMEOUT_MS,
  Math.min(sparkWorkerTimeoutMs, 25_000),
);

const flashWorkerTimeoutMs = parseSparkWorkerTimeoutMs(
  process.env.SPARK_WORKER_FLASH_TIMEOUT_MS,
  Math.min(sparkWorkerTimeoutMs, 25_000),
);

const tailwindBrowserScriptSrc =
  "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4";

const openrouter = createOpenRouter({
  apiKey: openRouterApiKey,
});

const createSparkInputSchema = z.object({
  sparkId: z
    .enum([
      "scene",
      "quiz",
      "flash_card",
      "desmos_graph",
      "code_playground",
      "web_playground",
    ])
    .describe(
      "Spark id to generate. Use scene, quiz, flash_card, desmos_graph, code_playground, or web_playground.",
    ),
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

const codePlaygroundPayloadSchema: z.ZodType<CodePlaygroundPayload> = z.object({
  language: z.literal("python"),
  instructions: z.string().min(1),
  starterCode: z.string().min(1),
  testCode: z.string().optional(),
  runHint: z.string().optional(),
});

const webPlaygroundPayloadSchema: z.ZodType<WebPlaygroundPayload> = z.object({
  html: z.string().min(1),
  css: z.string().optional(),
  js: z.string().optional(),
  instructions: z.string().optional(),
  runHint: z.string().optional(),
});

const quizChoiceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

const quizQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.array(quizChoiceSchema).min(2),
  correctChoiceId: z.string().min(1),
  explanation: z.string().optional(),
});

const quizPayloadSchema: z.ZodType<QuizSparkPayload> = z.object({
  instructions: z.string().optional(),
  questions: z.array(quizQuestionSchema).min(3),
});

const flashCardItemSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
});

const flashCardPayloadSchema: z.ZodType<FlashCardSparkPayload> = z.object({
  instructions: z.string().optional(),
  cards: z.array(flashCardItemSchema).min(4),
});

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

const codePlaygroundWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: codePlaygroundPayloadSchema,
});

const webPlaygroundWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: webPlaygroundPayloadSchema,
});

const quizWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: quizPayloadSchema,
});

const flashCardWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: flashCardPayloadSchema,
});

type SceneDraft = z.infer<typeof sceneWorkerOutputSchema>;
type DesmosDraft = z.infer<typeof desmosWorkerOutputSchema>;
type CodePlaygroundDraft = z.infer<typeof codePlaygroundWorkerOutputSchema>;
type WebPlaygroundDraft = z.infer<typeof webPlaygroundWorkerOutputSchema>;
type QuizDraft = z.infer<typeof quizWorkerOutputSchema>;
type FlashCardDraft = z.infer<typeof flashCardWorkerOutputSchema>;

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

function createArtifactId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `spark_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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

function validateCodePlaygroundPayload(
  payload: CodePlaygroundPayload,
): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (payload.language !== "python") {
    errors.push("Code playground currently supports only python.");
  }

  if (!payload.instructions.trim()) {
    errors.push("Code playground instructions are required.");
  }

  if (!payload.starterCode.trim()) {
    errors.push("Code playground starterCode is required.");
  }

  const starterLines = payload.starterCode.split(/\r?\n/);
  if (starterLines.length < 2) {
    errors.push(
      "Code playground starterCode must be multi-line Python code with proper indentation.",
    );
  }

  const hasInlineCommentedFunctionBody = starterLines.some((line) =>
    /^\s*def\s+[A-Za-z_]\w*\([^)]*\):\s*#/.test(line),
  );
  if (hasInlineCommentedFunctionBody) {
    errors.push(
      "Function definitions must not place TODO comments inline after ':'. Put comments on the next indented line.",
    );
  }

  if (payload.starterCode.length > 22_000) {
    errors.push("Code playground starterCode is too large.");
  }

  if (payload.testCode && payload.testCode.length > 22_000) {
    errors.push("Code playground testCode is too large.");
  }

  if (/\brequests\b|\burllib\b|\bsocket\b/i.test(payload.starterCode)) {
    warnings.push("Starter code may rely on network-related modules.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function validateWebPlaygroundPayload(
  payload: WebPlaygroundPayload,
): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!payload.html.trim()) {
    errors.push("Web playground html is required.");
  }

  if (payload.html.length > 22_000) {
    errors.push("Web playground html is too large.");
  }

  if (payload.css && payload.css.length > 22_000) {
    errors.push("Web playground css is too large.");
  }

  if (payload.js && payload.js.length > 22_000) {
    errors.push("Web playground js is too large.");
  }

  if (payload.instructions && payload.instructions.length > 1_200) {
    errors.push("Web playground instructions are too long.");
  }

  if (payload.runHint && payload.runHint.length > 240) {
    errors.push("Web playground runHint is too long.");
  }

  if (/\bfetch\(/i.test(payload.html)) {
    warnings.push("Web playground html uses fetch(). Avoid network calls.");
  }

  if (payload.js && /\bfetch\(|\bXMLHttpRequest\b/i.test(payload.js)) {
    warnings.push("Web playground js may rely on network requests.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function validateQuizPayload(payload: QuizSparkPayload): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (payload.questions.length < 3) {
    errors.push("Quiz payload must include at least 3 questions.");
  }

  for (const [questionIndex, question] of payload.questions.entries()) {
    if (!question.prompt.trim()) {
      errors.push(`Question ${questionIndex + 1} prompt is required.`);
    }

    if (question.choices.length < 2) {
      errors.push(`Question ${questionIndex + 1} needs at least 2 choices.`);
    }

    const hasCorrectChoice = question.choices.some(
      (choice) => choice.id === question.correctChoiceId,
    );
    if (!hasCorrectChoice) {
      errors.push(
        `Question ${questionIndex + 1} has an invalid correctChoiceId.`,
      );
    }
  }

  if (!payload.instructions || !payload.instructions.trim()) {
    warnings.push("Quiz payload is missing learner instructions.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function validateFlashCardPayload(
  payload: FlashCardSparkPayload,
): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (payload.cards.length < 4) {
    errors.push("Flash-card payload must include at least 4 cards.");
  }

  for (const [cardIndex, card] of payload.cards.entries()) {
    if (!card.front.trim()) {
      errors.push(`Card ${cardIndex + 1} is missing front text.`);
    }
    if (!card.back.trim()) {
      errors.push(`Card ${cardIndex + 1} is missing back text.`);
    }
  }

  if (!payload.instructions || !payload.instructions.trim()) {
    warnings.push("Flash-card payload is missing learner instructions.");
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
    "parametric",
    "polar",
    "inequality",
    "piecewise",
    "regression",
  ];

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
  const equationPattern =
    /([a-zA-Z](?:[a-zA-Z0-9'_]*|\([^)]*\))*\s*=\s*[^,;\n]+)/g;
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

  for (const chunk of chunks) {
    if (!chunk.includes("=")) {
      continue;
    }

    const matches = Array.from(chunk.matchAll(equationPattern));
    for (const match of matches) {
      let candidate = (match[1] ?? "").trim();

      candidate = candidate
        .replace(/\s+\b(and|with|where|for|to|in)\b\s+.*$/i, "")
        .replace(/\.\s+[a-zA-Z].*$/, "")
        .replace(/\s+\(or\b[\s\S]*$/i, "")
        .replace(/[.;]\s*$/, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!candidate.includes("=") || /https?:\/\//i.test(candidate)) {
        continue;
      }

      if (candidate.length > 100) {
        continue;
      }

      if (!/^[a-zA-Z0-9_'()\s+\-*/^.=]+$/.test(candidate)) {
        continue;
      }

      const firstEquals = candidate.indexOf("=");
      const secondEquals = candidate.indexOf("=", firstEquals + 1);
      if (secondEquals !== -1) {
        candidate = candidate.slice(0, secondEquals).trim();
      }

      const lhs = candidate.split("=")[0]?.trim() ?? "";
      if (!/[a-zA-Z]/.test(lhs)) {
        continue;
      }

      const rhs = candidate.split("=")[1]?.trim() ?? "";
      if (!rhs) {
        continue;
      }

      const rhsWords = rhs.toLowerCase().match(/[a-zA-Z]+/g) ?? [];
      const hasUnknownIdentifier = rhsWords.some(
        (word) => !allowedIdentifiers.has(word),
      );
      if (hasUnknownIdentifier) {
        continue;
      }

      const key = candidate.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push(candidate);
    }
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
  mode?: "auto" | "json" | "tool";
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
      mode: params.mode,
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
  mode?: "auto" | "json" | "tool";
}): Promise<{ object: T; warnings: string[] }> {
  const object = await generateWorkerObjectForModel({
    schema: params.schema,
    prompt: params.prompt,
    model: params.model,
    abortSignal: params.abortSignal,
    timeoutMs: params.timeoutMs,
    mode: params.mode,
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

  return renderPrompt("sparks/worker-build.md", {
    sparkType: params.sparkType,
    outputRequirements: outputRequirements.join("\n"),
    context: params.context,
    preferredTitleLine: params.title ? `Preferred title: ${params.title}` : "",
    preferredSummaryLine: params.summary
      ? `Preferred summary: ${params.summary}`
      : "",
    skillInstructions: params.skillInstructions,
    previousOutputBlock: params.previousOutput
      ? `Repair this previous draft:\n${params.previousOutput}`
      : "",
    previousErrorsBlock:
      params.previousErrors && params.previousErrors.length > 0
        ? `Validation errors to fix:\n${params.previousErrors
            .map((error) => `- ${error}`)
            .join("\n")}`
        : "",
  });
}

async function buildSceneSpark(
  input: CreateSparkToolInput,
  workerModels: SparkWorkerModels,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResult> {
  const skill = sparkSkillById.scene;
  const sparkTypeLabel = getSparkTypeLabel("scene");
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
      model: workerModels.sparkScene,
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
        workerSummary: `${sparkTypeLabel} generation failed due to provider fault.`,
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
      model: workerModels.sparkScene,
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
      workerSummary: `${sparkTypeLabel} repair failed due to provider fault.`,
      warnings: firstWarnings,
      error: toProviderFaultMessage(error),
    };
  }
}

async function buildDesmosGraphSpark(
  input: CreateSparkToolInput,
  workerModels: SparkWorkerModels,
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

  let firstDraft: DesmosDraft | null = null;
  let firstErrors: string[] = [];

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
      model: workerModels.sparkDesmos,
      abortSignal,
      timeoutMs: desmosWorkerTimeoutMs,
      mode: "json",
    });
    firstDraft = firstGeneration.object;
    firstWarnings.push(...firstGeneration.warnings);

    const firstValidation = validateDesmosPayload(firstDraft.payload);
    firstWarnings.push(...firstValidation.warnings);
    firstErrors = firstValidation.errors;

    if (firstValidation.ok) {
      return {
        status: "success",
        workerSummary: firstDraft.workerSummary,
        warnings: firstWarnings,
        artifact: normalizeSparkDesmosGraphDraft(firstDraft),
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
        workerSummary: "Desmos generation failed due to provider fault.",
        warnings: firstWarnings,
        error: toProviderFaultMessage(error),
      };
    }

    firstErrors = [toMessage(error)];
  }

  if (!firstDraft) {
    return {
      status: "failed",
      workerSummary: "Desmos worker failed before repair.",
      warnings: firstWarnings,
      error:
        firstErrors[0] ??
        "Spark worker could not produce an initial Desmos draft.",
    };
  }

  try {
    const repairPrompt = buildPrompt({
      sparkType: "desmos_graph",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
      previousOutput: JSON.stringify(firstDraft),
      previousErrors: firstErrors,
    });

    const repairedGeneration = await generateWorkerObject<DesmosDraft>({
      schema: desmosWorkerOutputSchema,
      prompt: repairPrompt,
      model: workerModels.sparkDesmos,
      abortSignal,
      timeoutMs: desmosWorkerTimeoutMs,
      mode: "json",
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
        "Desmos spark payload failed validation in two attempts.",
      warnings: [...firstWarnings, ...repairedValidation.warnings],
      error: repairedValidation.errors.join(" "),
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Desmos repair failed due to provider fault.",
      warnings: firstWarnings,
      error: toProviderFaultMessage(error),
    };
  }
}

async function buildCodePlaygroundSpark(
  input: CreateSparkToolInput,
  workerModels: SparkWorkerModels,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResult> {
  const skill = sparkSkillById.code_playground;
  const warnings: string[] = [];
  let firstDraft: CodePlaygroundSparkDraft | null = null;
  let firstErrors: string[] = [];

  try {
    const prompt = buildPrompt({
      sparkType: "code_playground",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
    });

    const firstGeneration = await generateWorkerObject<CodePlaygroundDraft>({
      schema: codePlaygroundWorkerOutputSchema,
      prompt,
      model: workerModels.sparkCode,
      abortSignal,
      timeoutMs: codeWorkerTimeoutMs,
    });

    warnings.push(...firstGeneration.warnings);
    firstDraft = {
      ...firstGeneration.object,
      artifactId: createArtifactId(),
    };

    const firstValidation = validateCodePlaygroundPayload(firstDraft.payload);
    warnings.push(...firstValidation.warnings);
    firstErrors = firstValidation.errors;

    if (firstValidation.ok) {
      return {
        status: "success",
        workerSummary: firstGeneration.object.workerSummary,
        warnings,
        artifact: normalizeSparkCodePlaygroundDraft(firstDraft),
      };
    }
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Code playground generation failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
    };
  }

  if (!firstDraft) {
    return {
      status: "failed",
      workerSummary: "Code playground worker failed before repair.",
      warnings,
      error: "Spark worker could not produce an initial code draft.",
    };
  }

  try {
    const repairPrompt = buildPrompt({
      sparkType: "code_playground",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
      previousOutput: JSON.stringify(firstDraft),
      previousErrors: firstErrors,
    });

    const repairedGeneration = await generateWorkerObject<CodePlaygroundDraft>({
      schema: codePlaygroundWorkerOutputSchema,
      prompt: repairPrompt,
      model: workerModels.sparkCode,
      abortSignal,
      timeoutMs: codeWorkerTimeoutMs,
    });

    warnings.push(...repairedGeneration.warnings);
    const repairedDraft: CodePlaygroundSparkDraft = {
      ...repairedGeneration.object,
      artifactId: firstDraft.artifactId,
    };
    const repairedValidation = validateCodePlaygroundPayload(
      repairedDraft.payload,
    );
    warnings.push(...repairedValidation.warnings);

    if (repairedValidation.ok) {
      return {
        status: "success",
        workerSummary: repairedGeneration.object.workerSummary,
        warnings,
        artifact: normalizeSparkCodePlaygroundDraft(repairedDraft),
      };
    }

    return {
      status: "failed",
      workerSummary:
        repairedGeneration.object.workerSummary ||
        "Code playground payload failed validation in two attempts.",
      warnings,
      error: repairedValidation.errors.join(" "),
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Code playground repair failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
    };
  }
}

async function buildWebPlaygroundSpark(
  input: CreateSparkToolInput,
  workerModels: SparkWorkerModels,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResult> {
  const skill = sparkSkillById.web_playground;
  const warnings: string[] = [];
  let firstDraft: WebPlaygroundSparkDraft | null = null;
  let firstErrors: string[] = [];

  try {
    const prompt = buildPrompt({
      sparkType: "web_playground",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
    });

    const firstGeneration = await generateWorkerObject<WebPlaygroundDraft>({
      schema: webPlaygroundWorkerOutputSchema,
      prompt,
      model: workerModels.sparkCode,
      abortSignal,
      timeoutMs: codeWorkerTimeoutMs,
    });

    warnings.push(...firstGeneration.warnings);
    firstDraft = {
      ...firstGeneration.object,
      artifactId: createArtifactId(),
    };

    const firstValidation = validateWebPlaygroundPayload(firstDraft.payload);
    warnings.push(...firstValidation.warnings);
    firstErrors = firstValidation.errors;

    if (firstValidation.ok) {
      return {
        status: "success",
        workerSummary: firstGeneration.object.workerSummary,
        warnings,
        artifact: normalizeSparkWebPlaygroundDraft(firstDraft),
      };
    }
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Web playground generation failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
    };
  }

  if (!firstDraft) {
    return {
      status: "failed",
      workerSummary: "Web playground worker failed before repair.",
      warnings,
      error: "Spark worker could not produce an initial web playground draft.",
    };
  }

  try {
    const repairPrompt = buildPrompt({
      sparkType: "web_playground",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
      previousOutput: JSON.stringify(firstDraft),
      previousErrors: firstErrors,
    });

    const repairedGeneration = await generateWorkerObject<WebPlaygroundDraft>({
      schema: webPlaygroundWorkerOutputSchema,
      prompt: repairPrompt,
      model: workerModels.sparkCode,
      abortSignal,
      timeoutMs: codeWorkerTimeoutMs,
    });

    warnings.push(...repairedGeneration.warnings);
    const repairedDraft: WebPlaygroundSparkDraft = {
      ...repairedGeneration.object,
      artifactId: firstDraft.artifactId,
    };
    const repairedValidation = validateWebPlaygroundPayload(
      repairedDraft.payload,
    );
    warnings.push(...repairedValidation.warnings);

    if (repairedValidation.ok) {
      return {
        status: "success",
        workerSummary: repairedGeneration.object.workerSummary,
        warnings,
        artifact: normalizeSparkWebPlaygroundDraft(repairedDraft),
      };
    }

    return {
      status: "failed",
      workerSummary:
        repairedGeneration.object.workerSummary ||
        "Web playground payload failed validation in two attempts.",
      warnings,
      error: repairedValidation.errors.join(" "),
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Web playground repair failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
    };
  }
}

async function buildQuizSpark(
  input: CreateSparkToolInput,
  workerModels: SparkWorkerModels,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResult> {
  const skill = sparkSkillById.quiz;
  const warnings: string[] = [];
  let firstDraft: QuizSparkDraft | null = null;
  let firstErrors: string[] = [];

  try {
    const prompt = buildPrompt({
      sparkType: "quiz",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
    });

    const firstGeneration = await generateWorkerObject<QuizDraft>({
      schema: quizWorkerOutputSchema,
      prompt,
      model: workerModels.sparkQuiz,
      abortSignal,
      timeoutMs: quizWorkerTimeoutMs,
    });

    warnings.push(...firstGeneration.warnings);
    firstDraft = {
      ...firstGeneration.object,
      artifactId: createArtifactId(),
    };

    const firstValidation = validateQuizPayload(firstDraft.payload);
    warnings.push(...firstValidation.warnings);
    firstErrors = firstValidation.errors;

    if (firstValidation.ok) {
      return {
        status: "success",
        workerSummary: firstGeneration.object.workerSummary,
        warnings,
        artifact: normalizeSparkQuizDraft(firstDraft),
      };
    }
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Quiz generation failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
    };
  }

  if (!firstDraft) {
    return {
      status: "failed",
      workerSummary: "Quiz worker failed before repair.",
      warnings,
      error: "Spark worker could not produce an initial quiz draft.",
    };
  }

  try {
    const repairPrompt = buildPrompt({
      sparkType: "quiz",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
      previousOutput: JSON.stringify(firstDraft),
      previousErrors: firstErrors,
    });

    const repairedGeneration = await generateWorkerObject<QuizDraft>({
      schema: quizWorkerOutputSchema,
      prompt: repairPrompt,
      model: workerModels.sparkQuiz,
      abortSignal,
      timeoutMs: quizWorkerTimeoutMs,
    });

    warnings.push(...repairedGeneration.warnings);
    const repairedDraft: QuizSparkDraft = {
      ...repairedGeneration.object,
      artifactId: firstDraft.artifactId,
    };
    const repairedValidation = validateQuizPayload(repairedDraft.payload);
    warnings.push(...repairedValidation.warnings);

    if (repairedValidation.ok) {
      return {
        status: "success",
        workerSummary: repairedGeneration.object.workerSummary,
        warnings,
        artifact: normalizeSparkQuizDraft(repairedDraft),
      };
    }

    return {
      status: "failed",
      workerSummary:
        repairedGeneration.object.workerSummary ||
        "Quiz payload failed validation in two attempts.",
      warnings,
      error: repairedValidation.errors.join(" "),
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Quiz repair failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
    };
  }
}

async function buildFlashCardSpark(
  input: CreateSparkToolInput,
  workerModels: SparkWorkerModels,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResult> {
  const skill = sparkSkillById.flash_card;
  const warnings: string[] = [];
  let firstDraft: FlashCardSparkDraft | null = null;
  let firstErrors: string[] = [];

  try {
    const prompt = buildPrompt({
      sparkType: "flash_card",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
    });

    const firstGeneration = await generateWorkerObject<FlashCardDraft>({
      schema: flashCardWorkerOutputSchema,
      prompt,
      model: workerModels.sparkFlash,
      abortSignal,
      timeoutMs: flashWorkerTimeoutMs,
    });

    warnings.push(...firstGeneration.warnings);
    firstDraft = {
      ...firstGeneration.object,
      artifactId: createArtifactId(),
    };

    const firstValidation = validateFlashCardPayload(firstDraft.payload);
    warnings.push(...firstValidation.warnings);
    firstErrors = firstValidation.errors;

    if (firstValidation.ok) {
      return {
        status: "success",
        workerSummary: firstGeneration.object.workerSummary,
        warnings,
        artifact: normalizeSparkFlashCardDraft(firstDraft),
      };
    }
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Flash-card generation failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
    };
  }

  if (!firstDraft) {
    return {
      status: "failed",
      workerSummary: "Flash-card worker failed before repair.",
      warnings,
      error: "Spark worker could not produce an initial flash-card draft.",
    };
  }

  try {
    const repairPrompt = buildPrompt({
      sparkType: "flash_card",
      context: input.context,
      title: input.title,
      summary: input.summary,
      skillInstructions: skill.instructions,
      previousOutput: JSON.stringify(firstDraft),
      previousErrors: firstErrors,
    });

    const repairedGeneration = await generateWorkerObject<FlashCardDraft>({
      schema: flashCardWorkerOutputSchema,
      prompt: repairPrompt,
      model: workerModels.sparkFlash,
      abortSignal,
      timeoutMs: flashWorkerTimeoutMs,
    });

    warnings.push(...repairedGeneration.warnings);
    const repairedDraft: FlashCardSparkDraft = {
      ...repairedGeneration.object,
      artifactId: firstDraft.artifactId,
    };
    const repairedValidation = validateFlashCardPayload(repairedDraft.payload);
    warnings.push(...repairedValidation.warnings);

    if (repairedValidation.ok) {
      return {
        status: "success",
        workerSummary: repairedGeneration.object.workerSummary,
        warnings,
        artifact: normalizeSparkFlashCardDraft(repairedDraft),
      };
    }

    return {
      status: "failed",
      workerSummary:
        repairedGeneration.object.workerSummary ||
        "Flash-card payload failed validation in two attempts.",
      warnings,
      error: repairedValidation.errors.join(" "),
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Flash-card repair failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
    };
  }
}

function createSparkToolWithModels(workerModels: SparkWorkerModels) {
  return createTool<CreateSparkToolInput, CreateSparkToolResult>({
    description:
      "Create a Spark artifact for inline learning interaction. Provide the sparkId and focused learner context.",
    args: createSparkInputSchema,
    handler: async (ctx, args, options) => {
      const startedAt = Date.now();
      const input = normalizeCreateSparkInput(args);
      let result: CreateSparkToolResult;

      const workerModelForSpark =
        input.sparkId === "scene"
          ? workerModels.sparkScene
          : input.sparkId === "desmos_graph"
            ? workerModels.sparkDesmos
            : input.sparkId === "code_playground"
              ? workerModels.sparkCode
              : input.sparkId === "web_playground"
                ? workerModels.sparkCode
                : input.sparkId === "quiz"
                  ? workerModels.sparkQuiz
                  : workerModels.sparkFlash;

      try {
        if (input.sparkId === "scene") {
          result = await buildSceneSpark(
            input,
            workerModels,
            options.abortSignal,
          );
        } else if (input.sparkId === "quiz") {
          result = await buildQuizSpark(
            input,
            workerModels,
            options.abortSignal,
          );
        } else if (input.sparkId === "flash_card") {
          result = await buildFlashCardSpark(
            input,
            workerModels,
            options.abortSignal,
          );
        } else if (input.sparkId === "desmos_graph") {
          result = await buildDesmosGraphSpark(
            input,
            workerModels,
            options.abortSignal,
          );
        } else if (input.sparkId === "code_playground") {
          result = await buildCodePlaygroundSpark(
            input,
            workerModels,
            options.abortSignal,
          );
        } else if (input.sparkId === "web_playground") {
          result = await buildWebPlaygroundSpark(
            input,
            workerModels,
            options.abortSignal,
          );
        } else {
          result = {
            status: "failed",
            workerSummary: "Unsupported spark type.",
            warnings: [],
            error: `Unsupported sparkId: ${input.sparkId}`,
          };
        }
      } catch (error) {
        result = {
          status: "failed",
          workerSummary: "Spark worker crashed while building the artifact.",
          warnings: [],
          error: toMessage(error),
        };
      }

      const durationMs = Date.now() - startedAt;
      const status = result.status === "success" ? "success" : "failed";

      if (ctx.userId) {
        await ctx
          .runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
            userId: ctx.userId,
            threadId: ctx.threadId,
            source: "spark",
            name: input.sparkId,
            status,
            durationMs,
            errorCategory:
              result.status === "failed"
                ? result.error.toLowerCase().includes("timeout")
                  ? "timeout"
                  : result.error.toLowerCase().includes("provider")
                    ? "provider"
                    : "generation_error"
                : undefined,
            retriable:
              result.status === "failed"
                ? result.error.toLowerCase().includes("provider") ||
                  result.error.toLowerCase().includes("timeout") ||
                  result.error.toLowerCase().includes("cancelled")
                : undefined,
            model: workerModelForSpark,
            metadata: {
              sparkId: input.sparkId,
              warnings: result.warnings,
              workerSummary: result.workerSummary,
              error: result.status === "failed" ? result.error : undefined,
              artifactKind:
                result.status === "success" ? result.artifact.kind : undefined,
            },
          })
          .catch((error) => {
            console.error("Failed to store spark telemetry", error);
          });

        await capturePosthogEvent({
          event: "spark_generation_result",
          distinctId: ctx.userId,
          properties: {
            thread_id: ctx.threadId,
            spark_id: input.sparkId,
            status,
            duration_ms: durationMs,
            worker_model: workerModelForSpark,
            warnings_count: result.warnings.length,
            error: result.status === "failed" ? result.error : undefined,
          },
        });
      }

      return result;
    },
  });
}

export function createSparkToolForProfile(profile: ModelProfile) {
  return createSparkToolWithModels(
    toSparkWorkerModels(getModelConfig(profile)),
  );
}

const activeSparkWorkerModels = toSparkWorkerModels(getActiveModelConfig());

export const createSparkTool = createSparkToolWithModels(
  activeSparkWorkerModels,
);
