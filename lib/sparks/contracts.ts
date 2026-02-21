export const sparkSceneVersion = 1 as const;

export const sparkTypes = ["scene", "desmos_graph"] as const;

export type SparkType = (typeof sparkTypes)[number];
export type SparkMode = "readonly" | "editable";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SceneSparkPayload = {
  html: string;
};

export type DesmosExpressionState = Record<string, JsonValue>;

export type DesmosGraphViewport = {
  left: number;
  right: number;
  bottom: number;
  top: number;
};

export type DesmosGraphPayload = {
  expressions: DesmosExpressionState[];
  settings?: Record<string, string | number | boolean>;
  viewport?: DesmosGraphViewport;
  hint?: string;
};

export type SparkSceneArtifact = {
  kind: "spark_scene";
  version: typeof sparkSceneVersion;
  sparkType: "scene";
  mode: SparkMode;
  title: string;
  summary?: string;
  payload: SceneSparkPayload;
};

export type SparkDesmosGraphArtifact = {
  kind: "spark_desmos_graph";
  version: typeof sparkSceneVersion;
  sparkType: "desmos_graph";
  mode: SparkMode;
  title: string;
  summary?: string;
  payload: DesmosGraphPayload;
};

export type SparkArtifact = SparkSceneArtifact | SparkDesmosGraphArtifact;

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
      artifact: SparkArtifact;
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

export type DesmosSparkDraft = {
  payload: DesmosGraphPayload;
  title?: string;
  summary?: string;
  workerSummary?: string;
};

export type SparkValidationResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

const maxTitleLength = 80;
const maxSummaryLength = 220;
const maxCodeLength = 16_000;
const maxHintLength = 180;
const maxExpressions = 40;

const sparkTypeLabels: Record<SparkType, string> = {
  scene: "Scene",
  desmos_graph: "Desmos Graph",
};

function clampText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function clampCode(value: string): string {
  return value.slice(0, maxCodeLength);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeJsonValue(value: unknown): JsonValue | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => normalizeJsonValue(item))
      .filter((item): item is JsonValue => item !== undefined);
    return normalizedItems;
  }

  if (isPlainObject(value)) {
    const normalizedObject: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      const normalizedChild = normalizeJsonValue(child);
      if (normalizedChild !== undefined) {
        normalizedObject[key] = normalizedChild;
      }
    }
    return normalizedObject;
  }

  return undefined;
}

function normalizeSparkType(sparkType: string | undefined): SparkType {
  if (sparkType === "scene") {
    return sparkType;
  }
  if (sparkType === "desmos_graph") {
    return sparkType;
  }
  return "scene";
}

function normalizeDesmosExpressions(input: unknown): DesmosExpressionState[] {
  if (!Array.isArray(input)) {
    return [{ id: "expr_1", latex: "y=x" }];
  }

  const normalized = input
    .slice(0, maxExpressions)
    .map((item) => {
      if (!isPlainObject(item)) {
        return null;
      }

      const entry: DesmosExpressionState = {};
      for (const [key, value] of Object.entries(item)) {
        const normalizedValue = normalizeJsonValue(value);
        if (normalizedValue !== undefined) {
          entry[key] = normalizedValue;
        }
      }

      if (Object.keys(entry).length === 0) {
        return null;
      }

      return entry;
    })
    .filter((item): item is DesmosExpressionState => item !== null);

  if (normalized.length === 0) {
    return [{ id: "expr_1", latex: "y=x" }];
  }

  return normalized;
}

function normalizeDesmosSettings(
  input: unknown,
): Record<string, string | number | boolean> | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }

  const settings: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" || typeof value === "boolean") {
      settings[key] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      settings[key] = value;
    }
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function normalizeDesmosViewport(
  input: unknown,
): DesmosGraphViewport | undefined {
  if (!isPlainObject(input)) {
    return undefined;
  }

  const left = input.left;
  const right = input.right;
  const bottom = input.bottom;
  const top = input.top;

  if (
    typeof left !== "number" ||
    typeof right !== "number" ||
    typeof bottom !== "number" ||
    typeof top !== "number" ||
    !Number.isFinite(left) ||
    !Number.isFinite(right) ||
    !Number.isFinite(bottom) ||
    !Number.isFinite(top) ||
    left >= right ||
    bottom >= top
  ) {
    return undefined;
  }

  return {
    left,
    right,
    bottom,
    top,
  };
}

function isDesmosGraphPayload(value: unknown): value is DesmosGraphPayload {
  if (!isPlainObject(value)) {
    return false;
  }

  if (!Array.isArray(value.expressions) || value.expressions.length === 0) {
    return false;
  }

  for (const expression of value.expressions) {
    if (!isPlainObject(expression)) {
      return false;
    }
  }

  if (
    value.settings !== undefined &&
    (!isPlainObject(value.settings) ||
      Object.values(value.settings).some(
        (entry) =>
          !(
            typeof entry === "string" ||
            typeof entry === "boolean" ||
            (typeof entry === "number" && Number.isFinite(entry))
          ),
      ))
  ) {
    return false;
  }

  if (value.viewport !== undefined) {
    const viewport = value.viewport;
    if (
      !isPlainObject(viewport) ||
      typeof viewport.left !== "number" ||
      typeof viewport.right !== "number" ||
      typeof viewport.bottom !== "number" ||
      typeof viewport.top !== "number" ||
      !Number.isFinite(viewport.left) ||
      !Number.isFinite(viewport.right) ||
      !Number.isFinite(viewport.bottom) ||
      !Number.isFinite(viewport.top)
    ) {
      return false;
    }
  }

  if (value.hint !== undefined && typeof value.hint !== "string") {
    return false;
  }

  return true;
}

export function getSparkTypeLabel(sparkType: SparkType): string {
  return sparkTypeLabels[sparkType];
}

export function normalizeSparkSceneDraft(
  draft: SparkDraft,
): SparkSceneArtifact {
  const html = clampCode(typeof draft.html === "string" ? draft.html : "");

  const title = clampText(
    typeof draft.title === "string" && draft.title.trim().length > 0
      ? draft.title
      : getSparkTypeLabel("scene"),
    maxTitleLength,
  );

  const summary =
    typeof draft.summary === "string" && draft.summary.trim().length > 0
      ? clampText(draft.summary, maxSummaryLength)
      : undefined;

  return {
    kind: "spark_scene",
    version: sparkSceneVersion,
    sparkType: "scene",
    mode: "readonly",
    title,
    summary,
    payload: {
      html,
    },
  };
}

export function normalizeSparkDesmosGraphDraft(
  draft: DesmosSparkDraft,
): SparkDesmosGraphArtifact {
  const title = clampText(
    typeof draft.title === "string" && draft.title.trim().length > 0
      ? draft.title
      : getSparkTypeLabel("desmos_graph"),
    maxTitleLength,
  );

  const summary =
    typeof draft.summary === "string" && draft.summary.trim().length > 0
      ? clampText(draft.summary, maxSummaryLength)
      : undefined;

  const payload = draft.payload;

  const normalizedPayload: DesmosGraphPayload = {
    expressions: normalizeDesmosExpressions(payload.expressions),
    settings: normalizeDesmosSettings(payload.settings),
    viewport: normalizeDesmosViewport(payload.viewport),
    hint:
      typeof payload.hint === "string" && payload.hint.trim().length > 0
        ? clampText(payload.hint, maxHintLength)
        : undefined,
  };

  return {
    kind: "spark_desmos_graph",
    version: sparkSceneVersion,
    sparkType: "desmos_graph",
    mode: "editable",
    title,
    summary,
    payload: normalizedPayload,
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
    candidate.sparkType !== "scene" ||
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

export function isSparkDesmosGraphArtifact(
  value: unknown,
): value is SparkDesmosGraphArtifact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SparkDesmosGraphArtifact>;
  if (
    candidate.kind !== "spark_desmos_graph" ||
    candidate.version !== sparkSceneVersion ||
    candidate.sparkType !== "desmos_graph" ||
    typeof candidate.title !== "string" ||
    (candidate.mode !== "readonly" && candidate.mode !== "editable")
  ) {
    return false;
  }

  return isDesmosGraphPayload(candidate.payload);
}

export function isSparkArtifact(value: unknown): value is SparkArtifact {
  return isSparkSceneArtifact(value) || isSparkDesmosGraphArtifact(value);
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
      isSparkArtifact(candidate.artifact)
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
