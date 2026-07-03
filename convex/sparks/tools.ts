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
  type OpenRouterProviderOptions,
} from "../../lib/model-config";
import { renderPrompt } from "../../lib/prompts";
import { sparkSkillById } from "../../lib/sparks/catalog";
import { getSparkWorkerOutputRequirements } from "../../lib/sparks/worker-output-requirements";
import {
  getSparkTypeLabel,
  normalizeSparkFlashCardDraft,
  normalizeCreateSparkInput,
  normalizeSparkQuizDraft,
  type FlashCardSparkDraft,
  normalizeSparkDesmosGraphDraft,
  normalizeSparkSceneDraft,
  type CreateSparkToolInput,
  type CreateSparkToolResult,
  type QuizSparkDraft,
  type SparkType,
} from "../../lib/sparks/contracts";
import { internal } from "../_generated/api";
import {
  createSparkInputSchema,
  desmosWorkerOutputSchema,
  flashCardWorkerOutputSchema,
  quizWorkerOutputSchema,
  sceneWorkerOutputSchema,
  type DesmosDraft,
  type FlashCardDraft,
  type QuizDraft,
  type SceneDraft,
} from "./schemas";
import {
  buildSimpleDesmosDraft,
  createArtifactId,
  validateDesmosPayload,
  validateFlashCardPayload,
  validateQuizPayload,
  validateSceneHtml,
  validateSceneV2Payload,
} from "./validators";

const internalApi = internal as unknown as {
  billing: {
    recordTextAiCostInternal: FunctionReference<"mutation", "internal">;
  };
  telemetry: {
    insertRawUsageInternal: FunctionReference<"mutation", "internal">;
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

const openRouterApiKey = process.env.OPENROUTER_API_KEY;

if (!openRouterApiKey) {
  throw new Error(
    "OPENROUTER_API_KEY is missing. Set it in .env.local and Convex env vars.",
  );
}

type UsageSnapshot = {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  inputTokenDetails?: unknown;
  outputTokenDetails?: unknown;
  raw?: unknown;
};

type SparkWorkerUsageRecord = {
  sparkId: SparkType;
  model: string;
  attempt: "initial" | "repair";
  usage?: UsageSnapshot;
  providerMetadata?: unknown;
};

type CreateSparkToolResultWithUsage = CreateSparkToolResult & {
  workerUsage?: SparkWorkerUsageRecord[];
};

function readNumericCandidate(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function extractEstimatedCostUsd(providerMetadata: unknown): number | undefined {
  if (!providerMetadata || typeof providerMetadata !== "object") {
    return undefined;
  }

  const stack: Record<string, unknown>[] = [
    providerMetadata as Record<string, unknown>,
  ];
  const seen = new Set<Record<string, unknown>>();
  const keys = [
    "totalCostUsd",
    "total_cost_usd",
    "totalCost",
    "total_cost",
    "costUsd",
    "cost_usd",
    "cost",
  ];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || seen.has(node)) {
      continue;
    }
    seen.add(node);

    for (const key of keys) {
      const found = readNumericCandidate(node, key);
      if (found !== undefined) {
        return found;
      }
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        stack.push(value as Record<string, unknown>);
      }
    }
  }

  return undefined;
}

export type SparkWorkerModels = Pick<
  ModelConfig,
  | "sparkScene"
  | "sparkDesmos"
  | "sparkQuiz"
  | "sparkFlash"
  | "providerOptions"
>;

function toSparkWorkerModels(modelConfig: ModelConfig): SparkWorkerModels {
  return {
    sparkScene: modelConfig.sparkScene,
    sparkDesmos: modelConfig.sparkDesmos,
    sparkQuiz: modelConfig.sparkQuiz,
    sparkFlash: modelConfig.sparkFlash,
    providerOptions: modelConfig.providerOptions,
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

const quizWorkerTimeoutMs = parseSparkWorkerTimeoutMs(
  process.env.SPARK_WORKER_QUIZ_TIMEOUT_MS,
  Math.min(sparkWorkerTimeoutMs, 25_000),
);

const flashWorkerTimeoutMs = parseSparkWorkerTimeoutMs(
  process.env.SPARK_WORKER_FLASH_TIMEOUT_MS,
  Math.min(sparkWorkerTimeoutMs, 25_000),
);

const openrouter = createOpenRouter({
  apiKey: openRouterApiKey,
});

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
  providerOptions: OpenRouterProviderOptions;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  mode?: "auto" | "json" | "tool";
}): Promise<{
  object: T;
  usage?: UsageSnapshot;
  providerMetadata?: unknown;
}> {
  const timeoutMs = params.timeoutMs ?? sparkWorkerTimeoutMs;
  const timeout = createTimeoutSignal(params.abortSignal, timeoutMs);

  try {
    const result = await generateObject({
      model: openrouter.chat(params.model),
      schema: params.schema,
      prompt: params.prompt,
      providerOptions: params.providerOptions,
      temperature: 0.2,
      abortSignal: timeout.signal,
      mode: params.mode,
    });

    return {
      object: result.object,
      usage: (result as { usage?: UsageSnapshot }).usage,
      providerMetadata: (result as { providerMetadata?: unknown })
        .providerMetadata,
    };
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
  providerOptions: OpenRouterProviderOptions;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  mode?: "auto" | "json" | "tool";
}): Promise<{
  object: T;
  warnings: string[];
  usage?: UsageSnapshot;
  providerMetadata?: unknown;
}> {
  const result = await generateWorkerObjectForModel({
    schema: params.schema,
    prompt: params.prompt,
    model: params.model,
    providerOptions: params.providerOptions,
    abortSignal: params.abortSignal,
    timeoutMs: params.timeoutMs,
    mode: params.mode,
  });

  return {
    object: result.object,
    warnings: [],
    usage: result.usage,
    providerMetadata: result.providerMetadata,
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
  return renderPrompt("sparks/worker-build.md", {
    sparkType: params.sparkType,
    outputRequirements: getSparkWorkerOutputRequirements(
      params.sparkType,
    ).join("\n"),
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

function pushWorkerUsage(
  records: SparkWorkerUsageRecord[],
  params: {
    sparkId: SparkType;
    model: string;
    attempt: "initial" | "repair";
    usage?: UsageSnapshot;
    providerMetadata?: unknown;
  },
) {
  records.push({
    sparkId: params.sparkId,
    model: params.model,
    attempt: params.attempt,
    usage: params.usage,
    providerMetadata: params.providerMetadata,
  });
}

function validateSceneDraft(draft: SceneDraft): {
  artifact: ReturnType<typeof normalizeSparkSceneDraft>;
  validation: ReturnType<typeof validateSceneHtml>;
} {
  const artifact = normalizeSparkSceneDraft(draft);
  const validation =
    artifact.version === 2
      ? validateSceneV2Payload(artifact.payload)
      : validateSceneHtml(artifact.payload.html);

  return { artifact, validation };
}

async function buildSceneSpark(
  input: CreateSparkToolInput,
  workerModels: SparkWorkerModels,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResultWithUsage> {
  const skill = sparkSkillById.scene;
  const sparkTypeLabel = getSparkTypeLabel("scene");
  let firstDraft: SceneDraft | null = null;
  let firstErrors: string[] = [];
  const firstWarnings: string[] = [];
  const workerUsage: SparkWorkerUsageRecord[] = [];

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
      providerOptions: workerModels.providerOptions,
      abortSignal,
      timeoutMs: sceneWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "scene",
      model: workerModels.sparkScene,
      attempt: "initial",
      usage: firstGeneration.usage,
      providerMetadata: firstGeneration.providerMetadata,
    });
    firstDraft = firstGeneration.object;
    firstWarnings.push(...firstGeneration.warnings);

    const { artifact, validation: firstValidation } =
      validateSceneDraft(firstDraft);
    firstErrors = firstValidation.errors;
    firstWarnings.push(...firstValidation.warnings);

    if (firstValidation.ok) {
      return {
        status: "success",
        workerSummary: firstDraft.workerSummary,
        warnings: firstWarnings,
        artifact,
        workerUsage,
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
        workerUsage,
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
      workerUsage,
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
      providerOptions: workerModels.providerOptions,
      abortSignal,
      timeoutMs: sceneWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "scene",
      model: workerModels.sparkScene,
      attempt: "repair",
      usage: repairedGeneration.usage,
      providerMetadata: repairedGeneration.providerMetadata,
    });
    const repairedDraft = repairedGeneration.object;
    firstWarnings.push(...repairedGeneration.warnings);

    const { artifact, validation: repairedValidation } =
      validateSceneDraft(repairedDraft);
    if (repairedValidation.ok) {
      return {
        status: "success",
        workerSummary: repairedDraft.workerSummary,
        warnings: [...firstWarnings, ...repairedValidation.warnings],
        artifact,
        workerUsage,
      };
    }

    return {
      status: "failed",
      workerSummary:
        repairedDraft.workerSummary ||
        "Spark worker could not produce a valid scene in two attempts.",
      warnings: [...firstWarnings, ...repairedValidation.warnings],
      error: repairedValidation.errors.join(" "),
      workerUsage,
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: `${sparkTypeLabel} repair failed due to provider fault.`,
      warnings: firstWarnings,
      error: toProviderFaultMessage(error),
      workerUsage,
    };
  }
}

async function buildDesmosGraphSpark(
  input: CreateSparkToolInput,
  workerModels: SparkWorkerModels,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResultWithUsage> {
  const skill = sparkSkillById.desmos_graph;
  const firstWarnings: string[] = [];
  const workerUsage: SparkWorkerUsageRecord[] = [];

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
        workerUsage,
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
      providerOptions: workerModels.providerOptions,
      abortSignal,
      timeoutMs: desmosWorkerTimeoutMs,
      mode: "json",
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "desmos_graph",
      model: workerModels.sparkDesmos,
      attempt: "initial",
      usage: firstGeneration.usage,
      providerMetadata: firstGeneration.providerMetadata,
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
        workerUsage,
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
        workerUsage,
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
      workerUsage,
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
      providerOptions: workerModels.providerOptions,
      abortSignal,
      timeoutMs: desmosWorkerTimeoutMs,
      mode: "json",
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "desmos_graph",
      model: workerModels.sparkDesmos,
      attempt: "repair",
      usage: repairedGeneration.usage,
      providerMetadata: repairedGeneration.providerMetadata,
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
        workerUsage,
      };
    }

    return {
      status: "failed",
      workerSummary:
        repairedDraft.workerSummary ||
        "Desmos spark payload failed validation in two attempts.",
      warnings: [...firstWarnings, ...repairedValidation.warnings],
      error: repairedValidation.errors.join(" "),
      workerUsage,
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Desmos repair failed due to provider fault.",
      warnings: firstWarnings,
      error: toProviderFaultMessage(error),
      workerUsage,
    };
  }
}

async function buildQuizSpark(
  input: CreateSparkToolInput,
  workerModels: SparkWorkerModels,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResultWithUsage> {
  const skill = sparkSkillById.quiz;
  const warnings: string[] = [];
  const workerUsage: SparkWorkerUsageRecord[] = [];
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
      providerOptions: workerModels.providerOptions,
      abortSignal,
      timeoutMs: quizWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "quiz",
      model: workerModels.sparkQuiz,
      attempt: "initial",
      usage: firstGeneration.usage,
      providerMetadata: firstGeneration.providerMetadata,
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
        workerUsage,
      };
    }
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Quiz generation failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
      workerUsage,
    };
  }

  if (!firstDraft) {
    return {
      status: "failed",
      workerSummary: "Quiz worker failed before repair.",
      warnings,
      error: "Spark worker could not produce an initial quiz draft.",
      workerUsage,
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
      providerOptions: workerModels.providerOptions,
      abortSignal,
      timeoutMs: quizWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "quiz",
      model: workerModels.sparkQuiz,
      attempt: "repair",
      usage: repairedGeneration.usage,
      providerMetadata: repairedGeneration.providerMetadata,
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
        workerUsage,
      };
    }

    return {
      status: "failed",
      workerSummary:
        repairedGeneration.object.workerSummary ||
        "Quiz payload failed validation in two attempts.",
      warnings,
      error: repairedValidation.errors.join(" "),
      workerUsage,
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Quiz repair failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
      workerUsage,
    };
  }
}

async function buildFlashCardSpark(
  input: CreateSparkToolInput,
  workerModels: SparkWorkerModels,
  abortSignal?: AbortSignal,
): Promise<CreateSparkToolResultWithUsage> {
  const skill = sparkSkillById.flash_card;
  const warnings: string[] = [];
  const workerUsage: SparkWorkerUsageRecord[] = [];
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
      providerOptions: workerModels.providerOptions,
      abortSignal,
      timeoutMs: flashWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "flash_card",
      model: workerModels.sparkFlash,
      attempt: "initial",
      usage: firstGeneration.usage,
      providerMetadata: firstGeneration.providerMetadata,
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
        workerUsage,
      };
    }
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Flash-card generation failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
      workerUsage,
    };
  }

  if (!firstDraft) {
    return {
      status: "failed",
      workerSummary: "Flash-card worker failed before repair.",
      warnings,
      error: "Spark worker could not produce an initial flash-card draft.",
      workerUsage,
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
      providerOptions: workerModels.providerOptions,
      abortSignal,
      timeoutMs: flashWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "flash_card",
      model: workerModels.sparkFlash,
      attempt: "repair",
      usage: repairedGeneration.usage,
      providerMetadata: repairedGeneration.providerMetadata,
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
        workerUsage,
      };
    }

    return {
      status: "failed",
      workerSummary:
        repairedGeneration.object.workerSummary ||
        "Flash-card payload failed validation in two attempts.",
      warnings,
      error: repairedValidation.errors.join(" "),
      workerUsage,
    };
  } catch (error) {
    return {
      status: "failed",
      workerSummary: "Flash-card repair failed due to provider fault.",
      warnings,
      error: toProviderFaultMessage(error),
      workerUsage,
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
      let result: CreateSparkToolResultWithUsage;

      const workerModelForSpark =
        input.sparkId === "scene"
          ? workerModels.sparkScene
          : input.sparkId === "desmos_graph"
            ? workerModels.sparkDesmos
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
        const workerUsage = result.workerUsage ?? [];
        for (const record of workerUsage) {
          await ctx
            .runMutation(internalApi.telemetry.insertRawUsageInternal, {
              userId: ctx.userId,
              threadId: ctx.threadId,
              agentName: `spark_worker:${record.sparkId}:${record.attempt}`,
              model: record.model,
              provider: "openrouter",
              usage: {
                totalTokens: record.usage?.totalTokens,
                inputTokens: record.usage?.inputTokens,
                outputTokens: record.usage?.outputTokens,
                reasoningTokens: record.usage?.reasoningTokens,
                cachedInputTokens: record.usage?.cachedInputTokens,
                inputTokenDetails: record.usage?.inputTokenDetails,
                outputTokenDetails: record.usage?.outputTokenDetails,
                raw: record.usage?.raw,
              },
              providerMetadata: record.providerMetadata,
            })
            .catch((error) => {
              console.error("Failed to store spark raw usage", error);
            });

          await ctx
            .runMutation(internalApi.billing.recordTextAiCostInternal, {
              userId: ctx.userId,
              textAiCostUsd: extractEstimatedCostUsd(record.providerMetadata) ?? 0,
            })
            .catch((error) => {
              console.error("Failed to store spark billing usage", error);
            });

        }

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
      }

      const publicResult = { ...result } as CreateSparkToolResultWithUsage;
      delete publicResult.workerUsage;
      return publicResult;
    },
  });
}

export function createSparkToolForProfile(profile: ModelProfile) {
  return createSparkToolWithModels(
    toSparkWorkerModels(getModelConfig(profile)),
  );
}

export function createSparkToolForModels(workerModels: SparkWorkerModels) {
  return createSparkToolWithModels(workerModels);
}

const activeSparkWorkerModels = toSparkWorkerModels(getActiveModelConfig());

export const createSparkTool = createSparkToolWithModels(
  activeSparkWorkerModels,
);
