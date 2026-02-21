export const sparkSceneVersion = 1 as const;

export const sparkTypes = ["scene"] as const;

export type SparkType = (typeof sparkTypes)[number];
export type SparkMode = "readonly" | "editable";

export type SceneSparkPayload = {
  html: string;
};

export type SparkSceneArtifact = {
  kind: "spark_scene";
  version: typeof sparkSceneVersion;
  sparkType: SparkType;
  mode: SparkMode;
  title: string;
  summary?: string;
  payload: SceneSparkPayload;
};

export type CreateSparkToolInput = {
  sparkId: SparkType;
  context: string;
  title?: string;
  summary?: string;
};

export type CreateSparkToolResult =
  | {
      status: "success";
      workerSummary: string;
      warnings: string[];
      artifact: SparkSceneArtifact;
    }
  | {
      status: "failed";
      workerSummary: string;
      warnings: string[];
      error: string;
    };

export type SparkDraft = {
  html: string;
  title?: string;
  summary?: string;
  workerSummary?: string;
};

export type SparkSceneValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  artifact: SparkSceneArtifact;
};

const maxTitleLength = 80;
const maxSummaryLength = 220;
const maxCodeLength = 16_000;

const sparkTypeLabels: Record<SparkType, string> = {
  scene: "Scene",
};

function clampText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function clampCode(value: string): string {
  return value.slice(0, maxCodeLength);
}

export function getSparkTypeLabel(sparkType: SparkType): string {
  return sparkTypeLabels[sparkType];
}

function normalizeSparkType(sparkType: string | undefined): SparkType {
  if (sparkType === "scene") {
    return sparkType;
  }
  return "scene";
}

export function normalizeSparkSceneDraft(
  sparkType: SparkType,
  draft: SparkDraft,
): SparkSceneArtifact {
  const html = clampCode(typeof draft.html === "string" ? draft.html : "");

  const title = clampText(
    typeof draft.title === "string" && draft.title.trim().length > 0
      ? draft.title
      : getSparkTypeLabel(sparkType),
    maxTitleLength,
  );

  const summary =
    typeof draft.summary === "string" && draft.summary.trim().length > 0
      ? clampText(draft.summary, maxSummaryLength)
      : undefined;

  return {
    kind: "spark_scene",
    version: sparkSceneVersion,
    sparkType,
    mode: "readonly",
    title,
    summary,
    payload: {
      html,
    },
  };
}

export function normalizeCreateSparkInput(
  input: CreateSparkToolInput,
): CreateSparkToolInput {
  return {
    sparkId: normalizeSparkType(input.sparkId),
    context: clampText(input.context, 400),
    title:
      typeof input.title === "string" && input.title.trim().length > 0
        ? clampText(input.title, maxTitleLength)
        : undefined,
    summary:
      typeof input.summary === "string" && input.summary.trim().length > 0
        ? clampText(input.summary, maxSummaryLength)
        : undefined,
  };
}

export function isSparkType(value: unknown): value is SparkType {
  return typeof value === "string" && sparkTypes.includes(value as SparkType);
}

export function isSparkSceneArtifact(
  value: unknown,
): value is SparkSceneArtifact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SparkSceneArtifact>;
  if (
    candidate.kind !== "spark_scene" ||
    candidate.version !== sparkSceneVersion ||
    !isSparkType(candidate.sparkType) ||
    typeof candidate.title !== "string" ||
    (candidate.mode !== "readonly" && candidate.mode !== "editable")
  ) {
    return false;
  }

  if (!candidate.payload || typeof candidate.payload !== "object") {
    return false;
  }

  const payload = candidate.payload as Partial<SceneSparkPayload>;
  return typeof payload.html === "string";
}

export function isCreateSparkToolResult(
  value: unknown,
): value is CreateSparkToolResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CreateSparkToolResult>;
  if (candidate.status === "success") {
    return (
      typeof candidate.workerSummary === "string" &&
      Array.isArray(candidate.warnings) &&
      isSparkSceneArtifact(candidate.artifact)
    );
  }

  if (candidate.status === "failed") {
    return (
      typeof candidate.workerSummary === "string" &&
      Array.isArray(candidate.warnings) &&
      typeof candidate.error === "string"
    );
  }

  return false;
}
