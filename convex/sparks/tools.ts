"use node";

import { createTool } from "@convex-dev/agent";
import { generateObject } from "ai";
import type { FunctionReference } from "convex/server";
import { z } from "zod";
import {
  getActiveModelConfig,
  getConfiguredModelEndpointAttempts,
  getModelConfig,
  type ModelConfig,
  type ModelProfile,
  type TextModelEndpoint,
  type TextModelProvider,
  type TextModelRoute,
} from "../../lib/model-config";
import { renderPrompt } from "../../lib/prompts";
import { sparkSkillById } from "../../lib/sparks/catalog";
import { getSparkWorkerOutputRequirements } from "../../lib/sparks/worker-output-requirements";
import {
  codeSparkPythonCheckPath,
  codeSparkPythonCheckSource,
  codeSparkPythonRunCommand,
  codeSparkPythonStarterPath,
  codeSparkPythonStarterSource,
  codeSparkPythonTestCommand,
  getSparkTypeLabel,
  inferCodeSparkModeFromContext,
  normalizeCodeSparkDraft,
  projectCodeSparkArtifactForPublic,
  normalizeSparkFlashCardDraft,
  normalizeCreateSparkInput,
  normalizeSparkQuizDraft,
  type FlashCardSparkDraft,
  type CodeSparkDraft,
  normalizeSparkDesmosGraphDraft,
  normalizeSparkSceneDraft,
  validateCodeSparkPayload,
  type CreateSparkToolInput,
  type CreateSparkToolResult,
  type QuizSparkDraft,
  type SparkType,
} from "../../lib/sparks/contracts";
import { getCodeSparkProviderConfig } from "../../lib/code-sparks/config";
import {
  classifyModelFailure,
  getPublicSparkFailureMessage,
  getSafeModelFailureMetadata,
  isCrossProviderFallbackKind,
  type ModelFailureKind,
  type SafeModelFailureMetadata,
} from "../../lib/model-provider-guardrails";
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
import { createTextLanguageModel } from "../textModelProvider";

const internalApi = internal as unknown as {
  billing: {
    recordTextAiCostInternal: FunctionReference<"mutation", "internal">;
  };
  telemetry: {
    insertRawUsageInternal: FunctionReference<"mutation", "internal">;
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
  codeSparks: {
    persistGeneratedSessionInternal: FunctionReference<"mutation", "internal">;
  };
};

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
  provider: TextModelProvider;
  model: string;
  attempt: "initial" | "repair";
  usedFallback: boolean;
  usage?: UsageSnapshot;
  providerMetadata?: unknown;
};

type CreateSparkToolResultWithUsage = CreateSparkToolResult & {
  workerUsage?: SparkWorkerUsageRecord[];
  failureMetadata?: SafeModelFailureMetadata;
};

function readNumericCandidate(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function extractEstimatedCostUsd(
  providerMetadata: unknown,
): number | undefined {
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
  "sparkScene" | "sparkDesmos" | "sparkQuiz" | "sparkFlash"
>;

function toSparkWorkerModels(modelConfig: ModelConfig): SparkWorkerModels {
  return {
    sparkScene: modelConfig.sparkScene,
    sparkDesmos: modelConfig.sparkDesmos,
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

const quizWorkerTimeoutMs = parseSparkWorkerTimeoutMs(
  process.env.SPARK_WORKER_QUIZ_TIMEOUT_MS,
  Math.min(sparkWorkerTimeoutMs, 25_000),
);

const flashWorkerTimeoutMs = parseSparkWorkerTimeoutMs(
  process.env.SPARK_WORKER_FLASH_TIMEOUT_MS,
  Math.min(sparkWorkerTimeoutMs, 25_000),
);

type WorkerErrorKind = ModelFailureKind;

class SparkWorkerError extends Error {
  kind: WorkerErrorKind;
  model: string;
  safeMetadata: SafeModelFailureMetadata;

  constructor(
    kind: WorkerErrorKind,
    model: string,
    safeMetadata: SafeModelFailureMetadata = { kind },
  ) {
    super(getPublicSparkFailureMessage(kind));
    this.name = "SparkWorkerError";
    this.kind = kind;
    this.model = model;
    this.safeMetadata = safeMetadata;
  }
}

function toSparkFailureFields(error: unknown): {
  error: string;
  failureMetadata: SafeModelFailureMetadata;
} {
  const failureMetadata =
    error instanceof SparkWorkerError
      ? error.safeMetadata
      : getSafeModelFailureMetadata(error);
  return {
    error: getPublicSparkFailureMessage(failureMetadata.kind),
    failureMetadata,
  };
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

async function generateWorkerObjectForEndpoint<T>(params: {
  schema: z.ZodType<T>;
  prompt: string;
  endpoint: TextModelEndpoint;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  mode?: "auto" | "json" | "tool";
}): Promise<{
  object: T;
  usage?: UsageSnapshot;
  providerMetadata?: unknown;
  endpoint: TextModelEndpoint;
}> {
  const timeoutMs = params.timeoutMs ?? sparkWorkerTimeoutMs;
  const timeout = createTimeoutSignal(params.abortSignal, timeoutMs);

  try {
    const result = await generateObject({
      model: createTextLanguageModel(params.endpoint),
      schema: params.schema,
      prompt: params.prompt,
      providerOptions: params.endpoint.providerOptions,
      temperature: 0.2,
      abortSignal: timeout.signal,
      mode: params.mode,
    });

    return {
      object: result.object,
      usage: (result as { usage?: UsageSnapshot }).usage,
      providerMetadata: (result as { providerMetadata?: unknown })
        .providerMetadata,
      endpoint: params.endpoint,
    };
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new SparkWorkerError("timeout", params.endpoint.model);
    }
    if (timeout.wasCancelled() || isAbortError(error)) {
      throw new SparkWorkerError("cancelled", params.endpoint.model);
    }

    const safeMetadata = getSafeModelFailureMetadata(error);
    if (
      safeMetadata.kind === "provider" ||
      safeMetadata.kind === "invalid_output"
    ) {
      throw new SparkWorkerError(
        safeMetadata.kind,
        params.endpoint.model,
        safeMetadata,
      );
    }

    throw new SparkWorkerError("other", params.endpoint.model, safeMetadata);
  } finally {
    timeout.cleanup();
  }
}

async function generateWorkerObject<T>(params: {
  schema: z.ZodType<T>;
  prompt: string;
  route: TextModelRoute;
  abortSignal?: AbortSignal;
  timeoutMs?: number;
  mode?: "auto" | "json" | "tool";
}): Promise<{
  object: T;
  warnings: string[];
  usage?: UsageSnapshot;
  providerMetadata?: unknown;
  endpoint: TextModelEndpoint;
  usedFallback: boolean;
}> {
  const endpoints = getConfiguredModelEndpointAttempts(params.route);
  if (endpoints.length === 0) {
    throw new SparkWorkerError("provider", params.route.primary.model, {
      kind: "provider",
      code: "provider_not_configured",
    });
  }

  let lastError: unknown;
  for (let index = 0; index < endpoints.length; index += 1) {
    try {
      const result = await generateWorkerObjectForEndpoint({
        schema: params.schema,
        prompt: params.prompt,
        endpoint: endpoints[index],
        abortSignal: params.abortSignal,
        timeoutMs: params.timeoutMs,
        mode: params.mode,
      });

      return {
        object: result.object,
        warnings:
          index === 0
            ? []
            : ["Spark worker used OpenRouter fallback after provider fault."],
        usage: result.usage,
        providerMetadata: result.providerMetadata,
        endpoint: result.endpoint,
        usedFallback: index > 0,
      };
    } catch (error) {
      lastError = error;
      const shouldTryFallback =
        error instanceof SparkWorkerError &&
        isCrossProviderFallbackKind(error.kind) &&
        index < endpoints.length - 1;
      if (shouldTryFallback) {
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error("Spark worker generation failed.");
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
    outputRequirements: getSparkWorkerOutputRequirements(params.sparkType).join(
      "\n",
    ),
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
    endpoint: TextModelEndpoint;
    attempt: "initial" | "repair";
    usage?: UsageSnapshot;
    providerMetadata?: unknown;
    usedFallback: boolean;
  },
) {
  records.push({
    sparkId: params.sparkId,
    provider: params.endpoint.provider,
    model: params.endpoint.model,
    attempt: params.attempt,
    usedFallback: params.usedFallback,
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
      route: workerModels.sparkScene,
      abortSignal,
      timeoutMs: sceneWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "scene",
      endpoint: firstGeneration.endpoint,
      attempt: "initial",
      usage: firstGeneration.usage,
      providerMetadata: firstGeneration.providerMetadata,
      usedFallback: firstGeneration.usedFallback,
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
    if (error instanceof SparkWorkerError) {
      return {
        status: "failed",
        workerSummary: `${sparkTypeLabel} generation failed due to provider fault.`,
        warnings: firstWarnings,
        ...toSparkFailureFields(error),
        workerUsage,
      };
    }

    firstErrors = [toSparkFailureFields(error).error];
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
      route: workerModels.sparkScene,
      abortSignal,
      timeoutMs: sceneWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "scene",
      endpoint: repairedGeneration.endpoint,
      attempt: "repair",
      usage: repairedGeneration.usage,
      providerMetadata: repairedGeneration.providerMetadata,
      usedFallback: repairedGeneration.usedFallback,
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
      ...toSparkFailureFields(error),
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
      route: workerModels.sparkDesmos,
      abortSignal,
      timeoutMs: desmosWorkerTimeoutMs,
      mode: "json",
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "desmos_graph",
      endpoint: firstGeneration.endpoint,
      attempt: "initial",
      usage: firstGeneration.usage,
      providerMetadata: firstGeneration.providerMetadata,
      usedFallback: firstGeneration.usedFallback,
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
    if (error instanceof SparkWorkerError) {
      return {
        status: "failed",
        workerSummary: "Desmos generation failed due to provider fault.",
        warnings: firstWarnings,
        ...toSparkFailureFields(error),
        workerUsage,
      };
    }

    firstErrors = [toSparkFailureFields(error).error];
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
      route: workerModels.sparkDesmos,
      abortSignal,
      timeoutMs: desmosWorkerTimeoutMs,
      mode: "json",
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "desmos_graph",
      endpoint: repairedGeneration.endpoint,
      attempt: "repair",
      usage: repairedGeneration.usage,
      providerMetadata: repairedGeneration.providerMetadata,
      usedFallback: repairedGeneration.usedFallback,
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
      ...toSparkFailureFields(error),
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
      route: workerModels.sparkQuiz,
      abortSignal,
      timeoutMs: quizWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "quiz",
      endpoint: firstGeneration.endpoint,
      attempt: "initial",
      usage: firstGeneration.usage,
      providerMetadata: firstGeneration.providerMetadata,
      usedFallback: firstGeneration.usedFallback,
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
      ...toSparkFailureFields(error),
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
      route: workerModels.sparkQuiz,
      abortSignal,
      timeoutMs: quizWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "quiz",
      endpoint: repairedGeneration.endpoint,
      attempt: "repair",
      usage: repairedGeneration.usage,
      providerMetadata: repairedGeneration.providerMetadata,
      usedFallback: repairedGeneration.usedFallback,
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
      ...toSparkFailureFields(error),
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
      route: workerModels.sparkFlash,
      abortSignal,
      timeoutMs: flashWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "flash_card",
      endpoint: firstGeneration.endpoint,
      attempt: "initial",
      usage: firstGeneration.usage,
      providerMetadata: firstGeneration.providerMetadata,
      usedFallback: firstGeneration.usedFallback,
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
      ...toSparkFailureFields(error),
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
      route: workerModels.sparkFlash,
      abortSignal,
      timeoutMs: flashWorkerTimeoutMs,
    });
    pushWorkerUsage(workerUsage, {
      sparkId: "flash_card",
      endpoint: repairedGeneration.endpoint,
      attempt: "repair",
      usage: repairedGeneration.usage,
      providerMetadata: repairedGeneration.providerMetadata,
      usedFallback: repairedGeneration.usedFallback,
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
      ...toSparkFailureFields(error),
      workerUsage,
    };
  }
}

function inferCodeSparkLanguage(context: string): "typescript" | "python" {
  return /\bpython|py|pandas|numpy|list|dict\b/i.test(context)
    ? "python"
    : "typescript";
}

function buildCodeSpark(
  input: CreateSparkToolInput,
  sparkType: "code" | "test",
): CreateSparkToolResultWithUsage {
  const language = inferCodeSparkLanguage(input.context);
  const mode = inferCodeSparkModeFromContext(input.context, sparkType);
  const providerConfig = getCodeSparkProviderConfig();
  const title =
    input.title ??
    (sparkType === "test"
      ? language === "python"
        ? "Python Test Spark"
        : "TypeScript Test Spark"
      : language === "python"
        ? "Python Code Spark"
        : "TypeScript Code Spark");
  const summary =
    input.summary ??
    "Edit the starter file, run it, then use the visible check feedback to make the smallest fix.";

  const draft: CodeSparkDraft =
    language === "python"
      ? {
          title,
          summary,
          workerSummary:
            "Created a provider-backed Python Code Spark starter artifact.",
          artifactId: createArtifactId(),
          payload: {
            mode,
            language,
            instructions:
              "Predict the output, run the file, then change answer() so the visible check passes.",
            provider: providerConfig.provider,
            providerStatus:
              providerConfig.provider === "vercel_sandbox"
                ? "configured"
                : providerConfig.provider === "local_fake"
                  ? "test_only"
                  : "unavailable",
            activePath: "main.py",
            files: [
              {
                path: codeSparkPythonStarterPath,
                language,
                contents: codeSparkPythonStarterSource,
                editable: true,
                role: "starter",
              },
              {
                path: codeSparkPythonCheckPath,
                language,
                contents: codeSparkPythonCheckSource,
                editable: false,
                role: "test",
              },
            ],
            tests: [
              {
                id: "visible-answer",
                label: "answer() returns a concrete value",
                command: codeSparkPythonTestCommand,
                hidden: false,
              },
            ],
            runCommand: codeSparkPythonRunCommand,
            testCommand: codeSparkPythonTestCommand,
          },
        }
      : {
          title,
          summary,
          workerSummary:
            "Created a provider-backed TypeScript Code Spark starter artifact.",
          artifactId: createArtifactId(),
          payload: {
            mode,
            language,
            instructions:
              "Predict what add() returns, run the visible check, then repair the function.",
            provider: providerConfig.provider,
            providerStatus:
              providerConfig.provider === "vercel_sandbox"
                ? "configured"
                : providerConfig.provider === "local_fake"
                  ? "test_only"
                  : "unavailable",
            activePath: "src/add.ts",
            files: [
              {
                path: "src/add.ts",
                language,
                contents:
                  "export function add(a: number, b: number): number {\n  // What should this return?\n  return 0;\n}\n\nconsole.log(add(2, 3));\n",
                editable: true,
                role: "starter",
              },
              {
                path: "tests/add.check.ts",
                language,
                contents:
                  "import { add } from '../src/add.ts';\n\nif (add(2, 3) !== 5) {\n  throw new Error('Expected add(2, 3) to equal 5');\n}\n\nconsole.log('visible check passed');\n",
                editable: false,
                role: "test",
              },
            ],
            tests: [
              {
                id: "visible-add",
                label: "adds visible values",
                command: "node tests/add.check.ts",
                hidden: false,
              },
            ],
            runCommand: "node src/add.ts",
            testCommand: "node tests/add.check.ts",
          },
        };

  const artifact = normalizeCodeSparkDraft(draft, sparkType);
  const validation = validateCodeSparkPayload(artifact.payload);
  if (!validation.ok) {
    return {
      status: "failed",
      workerSummary: "Code Spark template failed validation.",
      warnings: validation.warnings,
      error: validation.errors.join(" "),
    };
  }

  return {
    status: "success",
    workerSummary:
      draft.workerSummary ?? "Created Code Spark starter artifact.",
    warnings: [
      ...validation.warnings,
      ...(providerConfig.reason ? [providerConfig.reason] : []),
    ],
    artifact,
  };
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
              : input.sparkId === "flash_card"
                ? workerModels.sparkFlash
                : "code_spark_template";

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
        } else if (input.sparkId === "code" || input.sparkId === "test") {
          result = buildCodeSpark(input, input.sparkId);
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
          ...toSparkFailureFields(error),
        };
      }

      if (
        result.status === "success" &&
        result.artifact.kind === "spark_code"
      ) {
        const artifactId = result.artifact.artifactId;
        if (!ctx.userId || !artifactId) {
          result = {
            status: "failed",
            workerSummary:
              "Code Spark could not establish its server runtime session.",
            warnings: result.warnings,
            error:
              "Code Spark challenge persistence is temporarily unavailable. Please try again.",
            failureMetadata: {
              kind: "other",
              code: "code_spark_persistence_unavailable",
            },
          };
        } else {
          try {
            await ctx.runMutation(
              internalApi.codeSparks.persistGeneratedSessionInternal,
              {
                userId: ctx.userId,
                threadId: ctx.threadId,
                sparkId: artifactId,
                title: result.artifact.title,
                mode: result.artifact.payload.mode,
                language: result.artifact.payload.language,
                provider: result.artifact.payload.provider,
                providerStatus: result.artifact.payload.providerStatus,
                activePath: result.artifact.payload.activePath,
                runCommand: result.artifact.payload.runCommand,
                testCommand: result.artifact.payload.testCommand,
                files: result.artifact.payload.files,
                tests: result.artifact.payload.tests,
              },
            );
            result = {
              ...result,
              artifact: projectCodeSparkArtifactForPublic(result.artifact),
            };
          } catch {
            result = {
              status: "failed",
              workerSummary:
                "Code Spark could not establish its server runtime session.",
              warnings: result.warnings,
              error:
                "Code Spark challenge persistence is temporarily unavailable. Please try again.",
              failureMetadata: {
                kind: "other",
                code: "code_spark_persistence_failed",
              },
            };
          }
        }
      }

      const durationMs = Date.now() - startedAt;
      const status = result.status === "success" ? "success" : "failed";

      if (ctx.userId) {
        const workerUsage = result.workerUsage ?? [];
        const actualUsage = workerUsage[workerUsage.length - 1];
        const failureMetadata =
          result.status === "failed"
            ? (result.failureMetadata ?? {
                kind: classifyModelFailure(result.error),
              })
            : undefined;
        for (const record of workerUsage) {
          await ctx
            .runMutation(internalApi.telemetry.insertRawUsageInternal, {
              userId: ctx.userId,
              threadId: ctx.threadId,
              agentName: `spark_worker:${record.sparkId}:${record.attempt}`,
              model: record.model,
              provider: record.provider,
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
              textAiCostUsd:
                extractEstimatedCostUsd(record.providerMetadata) ?? 0,
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
            errorCategory: failureMetadata?.kind,
            retriable:
              failureMetadata === undefined
                ? undefined
                : failureMetadata.kind === "provider" ||
                  failureMetadata.kind === "timeout" ||
                  failureMetadata.kind === "invalid_output",
            model:
              actualUsage?.model ??
              (workerModelForSpark === "code_spark_template"
                ? workerModelForSpark
                : undefined),
            metadata: {
              sparkId: input.sparkId,
              warnings: result.warnings,
              workerSummary: result.workerSummary,
              failure: failureMetadata,
              artifactKind:
                result.status === "success" ? result.artifact.kind : undefined,
              primaryProvider:
                workerModelForSpark === "code_spark_template"
                  ? undefined
                  : workerModelForSpark.primary.provider,
              fallbackProvider:
                workerModelForSpark === "code_spark_template"
                  ? undefined
                  : workerModelForSpark.fallback.provider,
              actualProvider: actualUsage?.provider,
              actualModel: actualUsage?.model,
              fallbackUsed: actualUsage?.usedFallback ?? false,
            },
          })
          .catch((error) => {
            console.error("Failed to store spark telemetry", error);
          });
      }

      const publicResult = { ...result } as CreateSparkToolResultWithUsage;
      delete publicResult.workerUsage;
      delete publicResult.failureMetadata;
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
