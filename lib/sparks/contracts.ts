export const sparkSceneVersion = 1 as const;
export const sparkSceneV2Version = 2 as const;

export const sparkTypes = [
  "scene",
  "quiz",
  "flash_card",
  "desmos_graph",
  "code",
  "test",
] as const;

export type SparkType = (typeof sparkTypes)[number];
export type SparkMode = "readonly" | "editable";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SceneSparkV1Payload = {
  html: string;
};

export type SceneSparkFileName = "index.html" | "styles.css" | "script.js";

export type SceneSparkFiles = Partial<Record<SceneSparkFileName, string>> &
  Record<string, string> & {
    "index.html": string;
  };

export type SceneSparkCapabilities = {
  usesCanvas: boolean;
  usesSvg: boolean;
  needsNetwork: boolean;
  recordsAnswers: boolean;
};

export type SceneSparkControl = {
  id: string;
  type: "slider" | "toggle" | "button" | "choice";
  label: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: string | number | boolean;
  choices?: string[];
};

export type SceneSparkCheckpoint = {
  id: string;
  prompt: string;
  answerType: "choice" | "text" | "number" | "boolean";
  choices?: string[];
};

export type SceneSparkV2Payload = {
  version: typeof sparkSceneV2Version;
  learningObjective: string;
  estimatedInteractionSeconds?: number;
  capabilities: SceneSparkCapabilities;
  files: SceneSparkFiles;
  controls: SceneSparkControl[];
  checkpoints: SceneSparkCheckpoint[];
};

export type SceneSparkPayload = SceneSparkV1Payload | SceneSparkV2Payload;

export type QuizChoice = {
  id: string;
  text: string;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  choices: QuizChoice[];
  correctChoiceId: string;
  explanation?: string;
};

export type QuizSparkPayload = {
  instructions?: string;
  questions: QuizQuestion[];
};

export type FlashCardItem = {
  id: string;
  front: string;
  back: string;
};

export type FlashCardSparkPayload = {
  instructions?: string;
  cards: FlashCardItem[];
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

export type CodeSparkLanguage = "typescript" | "python";

export type StoredCodeSparkLanguage =
  | CodeSparkLanguage
  | "c"
  | "rust"
  | "mixed";

export type CodeSparkProvider =
  | "vercel_sandbox"
  | "daytona"
  | "e2b"
  | "local_fake"
  | "unavailable";

export type CodeSparkMode = "workspace" | "challenge";

export const codeSparkPythonStarterPath = "main.py";
export const codeSparkPythonCheckPath = "tests/answer.check.py";
export const codeSparkPythonRunCommand = "python3 main.py";
export const codeSparkPythonTestCommand = "python3 tests/answer.check.py";
export const codeSparkPythonStarterSource =
  'def answer():\n    # Try to make the visible check pass.\n    return None\n\nif __name__ == "__main__":\n    print(answer())\n';
export const codeSparkPythonCheckSource =
  'from pathlib import Path\nimport sys\n\nsys.path.insert(0, str(Path(__file__).resolve().parents[1]))\nfrom main import answer\n\nvalue = answer()\nif value is None:\n    raise AssertionError("Expected answer() to return a concrete value")\n\nprint("visible check passed")\n';

export function inferCodeSparkModeFromContext(
  context: string,
  sparkType: "code" | "test",
): CodeSparkMode {
  if (sparkType === "test") return "challenge";
  return /\b(challenge|exercise|repair|fix|bug|visible check|test|pass)\b/i.test(
    context,
  )
    ? "challenge"
    : "workspace";
}

export type CodeSparkFileRole =
  | "starter"
  | "solution"
  | "test"
  | "hidden_test"
  | "config"
  | "readme";

export type CodeSparkFile<
  TLanguage extends StoredCodeSparkLanguage = StoredCodeSparkLanguage,
> = {
  path: string;
  language: TLanguage;
  contents: string;
  editable: boolean;
  role: CodeSparkFileRole;
};

export type CodeSparkTest = {
  id: string;
  label: string;
  command: string;
  hidden: boolean;
};

export type CodeSparkRunSummary = {
  kind: "run" | "test" | "preview" | "inspect";
  status:
    | "queued"
    | "running"
    | "passed"
    | "failed"
    | "timed_out"
    | "unavailable";
  provider: CodeSparkProvider;
  command?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  createdAt?: number;
  reason?: string;
};

export type CodeSparkPayload<
  TLanguage extends StoredCodeSparkLanguage = StoredCodeSparkLanguage,
> = {
  mode: CodeSparkMode;
  language: TLanguage;
  instructions: string;
  provider: CodeSparkProvider;
  providerStatus: "configured" | "unconfigured" | "unavailable" | "test_only";
  activePath: string;
  files: CodeSparkFile<TLanguage>[];
  tests: CodeSparkTest[];
  hiddenTestCount: number;
  runCommand: string;
  testCommand: string;
  lastRun?: CodeSparkRunSummary;
  lab: {
    enabled: boolean;
    reason: string;
  };
};

export type SparkSceneV1Artifact = {
  kind: "spark_scene";
  version: typeof sparkSceneVersion;
  sparkType: "scene";
  mode: SparkMode;
  artifactId?: string;
  title: string;
  summary?: string;
  payload: SceneSparkV1Payload;
};

export type SparkSceneV2Artifact = {
  kind: "spark_scene";
  version: typeof sparkSceneV2Version;
  sparkType: "scene";
  mode: SparkMode;
  artifactId?: string;
  title: string;
  summary?: string;
  payload: SceneSparkV2Payload;
};

export type SparkSceneArtifact = SparkSceneV1Artifact | SparkSceneV2Artifact;

export type SparkQuizArtifact = {
  kind: "spark_quiz";
  version: typeof sparkSceneVersion;
  sparkType: "quiz";
  mode: SparkMode;
  artifactId?: string;
  title: string;
  summary?: string;
  payload: QuizSparkPayload;
};

export type SparkFlashCardArtifact = {
  kind: "spark_flash_card";
  version: typeof sparkSceneVersion;
  sparkType: "flash_card";
  mode: SparkMode;
  artifactId?: string;
  title: string;
  summary?: string;
  payload: FlashCardSparkPayload;
};

export type SparkDesmosGraphArtifact = {
  kind: "spark_desmos_graph";
  version: typeof sparkSceneVersion;
  sparkType: "desmos_graph";
  mode: SparkMode;
  artifactId?: string;
  title: string;
  summary?: string;
  payload: DesmosGraphPayload;
};

export type SparkCodeArtifact<
  TLanguage extends StoredCodeSparkLanguage = StoredCodeSparkLanguage,
> = {
  kind: "spark_code";
  version: typeof sparkSceneVersion;
  sparkType: "code" | "test";
  mode: "editable";
  artifactId?: string;
  title: string;
  summary?: string;
  payload: CodeSparkPayload<TLanguage>;
};

export function isPrivateCodeSparkPath(
  path: string,
  mode: CodeSparkMode = "challenge",
): boolean {
  const rawSegments = path.trim().replace(/\\/g, "/").toLowerCase().split("/");
  const segments: string[] = [];
  let containsTraversal = false;

  for (const segment of rawSegments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      containsTraversal = true;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  if (containsTraversal) {
    return true;
  }

  if (
    segments.some((segment) =>
      /(?:^|[._-])(?:hidden|private|solutions?)(?:[._-]|$)/.test(segment),
    )
  ) {
    return true;
  }

  if (mode === "workspace") {
    return false;
  }

  const directories = segments.slice(0, -1);
  const filename = segments[segments.length - 1] ?? "";
  return (
    directories.some((segment) =>
      /^(?:__)?(?:tests?|checks?)(?:__)?$/.test(segment),
    ) || /(?:^|\.)(?:tests?|checks?|spec)(?:\.|$)/.test(filename)
  );
}

export function isLearnerVisibleCodeSparkFile(
  file: Pick<CodeSparkFile, "path" | "editable" | "role">,
): boolean {
  return (
    file.editable &&
    (file.role === "starter" ||
      file.role === "config" ||
      file.role === "readme") &&
    !isPrivateCodeSparkPath(file.path)
  );
}

export function deriveCodeSparkLearnerRunCommand(
  language: string,
  path: string,
): string | undefined {
  const normalizedPath = path.trim();
  if (
    !normalizedPath ||
    isPrivateCodeSparkPath(normalizedPath) ||
    !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.[A-Za-z0-9]+$/.test(
      normalizedPath,
    )
  ) {
    return undefined;
  }

  if (
    language === "typescript" &&
    /\.(?:js|mjs|cjs|ts)$/.test(normalizedPath)
  ) {
    return `node ${normalizedPath}`;
  }
  if (language === "python" && normalizedPath.endsWith(".py")) {
    return `python3 ${normalizedPath}`;
  }
  return undefined;
}

export function projectCodeSparkArtifactForPublic<
  TLanguage extends StoredCodeSparkLanguage,
>(artifact: SparkCodeArtifact<TLanguage>): SparkCodeArtifact<TLanguage> {
  if (artifact.payload.mode === "workspace") {
    return artifact;
  }

  /**
   * Challenge projection is a UI-concealment boundary, not a cryptographic hidden-test boundary.
   * Visible checks execute beside learner code in the
   * same ephemeral sandbox; their implementation is merely withheld from the
   * renderer. Empty compatibility fields keep the artifact structurally valid.
   */
  const publicFiles = artifact.payload.files.filter(
    isLearnerVisibleCodeSparkFile,
  );
  if (publicFiles.length === 0) {
    throw new Error(
      "Challenge Code Spark requires an editable learner-visible file.",
    );
  }
  const activePath = publicFiles.some(
    (file) => file.path === artifact.payload.activePath,
  )
    ? artifact.payload.activePath
    : publicFiles[0]!.path;
  const publicPayload: CodeSparkPayload<TLanguage> = {
    ...artifact.payload,
    activePath,
    files: publicFiles,
    runCommand: "",
    testCommand: "",
  };
  delete publicPayload.lastRun;
  publicPayload.tests = artifact.payload.tests
    .filter((test) => !test.hidden)
    .map((test) => ({ ...test, command: "" }));

  return {
    ...artifact,
    payload: publicPayload,
  };
}

export type SparkArtifact =
  | SparkSceneArtifact
  | SparkQuizArtifact
  | SparkFlashCardArtifact
  | SparkDesmosGraphArtifact
  | SparkCodeArtifact;

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
  version?: typeof sparkSceneVersion | typeof sparkSceneV2Version;
  html?: string;
  files?: Partial<Record<string, string>>;
  learningObjective?: string;
  estimatedInteractionSeconds?: number;
  capabilities?: Partial<SceneSparkCapabilities>;
  controls?: unknown[];
  checkpoints?: unknown[];
  artifactId?: string;
  title?: string;
  summary?: string;
  workerSummary?: string;
};

export type QuizSparkDraft = {
  payload: QuizSparkPayload;
  artifactId?: string;
  title?: string;
  summary?: string;
  workerSummary?: string;
};

export type FlashCardSparkDraft = {
  payload: FlashCardSparkPayload;
  artifactId?: string;
  title?: string;
  summary?: string;
  workerSummary?: string;
};

export type DesmosSparkDraft = {
  payload: DesmosGraphPayload;
  artifactId?: string;
  title?: string;
  summary?: string;
  workerSummary?: string;
};

export type CodeSparkDraft = {
  payload: Partial<CodeSparkPayload<CodeSparkLanguage>> & {
    mode?: CodeSparkMode;
    language?: CodeSparkLanguage;
    instructions?: string;
    files?: CodeSparkFile<CodeSparkLanguage>[];
    tests?: CodeSparkTest[];
  };
  artifactId?: string;
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
const maxSceneObjectiveLength = 240;
const maxSceneControls = 8;
const maxSceneCheckpoints = 4;
const maxSceneControlChoices = 8;
const maxInstructionsLength = 1_200;
const maxHintLength = 180;
const maxExpressions = 40;
const maxCodeSparkFiles = 8;
const maxCodeSparkFileBytes = 20_000;
const maxCodeSparkTests = 12;
const maxCodeSparkInstructionsLength = 1_400;
const maxQuizQuestions = 8;
const minQuizQuestions = 3;
const maxChoicesPerQuestion = 6;
const minChoicesPerQuestion = 2;
const maxCards = 16;
const minCards = 4;
const maxQuestionLength = 280;
const maxChoiceLength = 180;
const maxCardFaceLength = 280;

const sparkTypeLabels: Record<SparkType, string> = {
  scene: "Scene",
  quiz: "Quiz",
  flash_card: "Flash Card",
  desmos_graph: "Desmos Graph",
  code: "Code Spark",
  test: "Test Spark",
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
  if (sparkType === "quiz") {
    return sparkType;
  }
  if (sparkType === "flash_card") {
    return sparkType;
  }
  if (sparkType === "desmos_graph") {
    return sparkType;
  }
  if (sparkType === "code") {
    return sparkType;
  }
  if (sparkType === "test") {
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

function normalizeSceneFiles(
  input: unknown,
  fallbackHtml: string | undefined,
): SceneSparkFiles {
  const candidate = isPlainObject(input) ? input : {};
  const indexHtml =
    typeof candidate["index.html"] === "string" &&
    candidate["index.html"].trim().length > 0
      ? candidate["index.html"]
      : fallbackHtml;

  const files: SceneSparkFiles = {
    "index.html": typeof indexHtml === "string" ? indexHtml.trim() : "",
  };

  for (const [fileName, contents] of Object.entries(candidate)) {
    if (typeof contents === "string") {
      files[fileName] = contents;
    }
  }

  return files;
}

function normalizeSceneCapabilities(input: unknown): SceneSparkCapabilities {
  const candidate = isPlainObject(input) ? input : {};
  return {
    usesCanvas: candidate.usesCanvas === true,
    usesSvg: candidate.usesSvg === true,
    needsNetwork: candidate.needsNetwork === true,
    recordsAnswers: candidate.recordsAnswers === true,
  };
}

function normalizeSceneControls(input: unknown): SceneSparkControl[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const allowedTypes = new Set<SceneSparkControl["type"]>([
    "slider",
    "toggle",
    "button",
    "choice",
  ]);

  return input
    .slice(0, maxSceneControls)
    .map((rawControl, index) => {
      if (!isPlainObject(rawControl)) {
        return null;
      }

      const type = allowedTypes.has(
        rawControl.type as SceneSparkControl["type"],
      )
        ? (rawControl.type as SceneSparkControl["type"])
        : "button";
      const id =
        typeof rawControl.id === "string" && rawControl.id.trim().length > 0
          ? clampText(rawControl.id, 48)
          : `control_${index + 1}`;
      const label =
        typeof rawControl.label === "string" &&
        rawControl.label.trim().length > 0
          ? clampText(rawControl.label, 80)
          : `Control ${index + 1}`;

      const control: SceneSparkControl = { id, type, label };

      for (const key of ["min", "max", "step"] as const) {
        const value = rawControl[key];
        if (typeof value === "number" && Number.isFinite(value)) {
          control[key] = value;
        }
      }

      const defaultValue = rawControl.defaultValue;
      if (
        typeof defaultValue === "string" ||
        typeof defaultValue === "boolean" ||
        (typeof defaultValue === "number" && Number.isFinite(defaultValue))
      ) {
        control.defaultValue =
          typeof defaultValue === "string"
            ? clampText(defaultValue, 80)
            : defaultValue;
      }

      if (Array.isArray(rawControl.choices)) {
        const choices = rawControl.choices
          .slice(0, maxSceneControlChoices)
          .filter((choice): choice is string => typeof choice === "string")
          .map((choice) => clampText(choice, 80))
          .filter(Boolean);
        if (choices.length > 0) {
          control.choices = choices;
        }
      }

      return control;
    })
    .filter((control): control is SceneSparkControl => control !== null);
}

function normalizeSceneCheckpoints(input: unknown): SceneSparkCheckpoint[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const allowedAnswerTypes = new Set<SceneSparkCheckpoint["answerType"]>([
    "choice",
    "text",
    "number",
    "boolean",
  ]);

  return input
    .slice(0, maxSceneCheckpoints)
    .map((rawCheckpoint, index) => {
      if (!isPlainObject(rawCheckpoint)) {
        return null;
      }

      const prompt =
        typeof rawCheckpoint.prompt === "string" &&
        rawCheckpoint.prompt.trim().length > 0
          ? clampText(rawCheckpoint.prompt, maxQuestionLength)
          : "";
      if (!prompt) {
        return null;
      }

      const id =
        typeof rawCheckpoint.id === "string" &&
        rawCheckpoint.id.trim().length > 0
          ? clampText(rawCheckpoint.id, 48)
          : `checkpoint_${index + 1}`;
      const answerType = allowedAnswerTypes.has(
        rawCheckpoint.answerType as SceneSparkCheckpoint["answerType"],
      )
        ? (rawCheckpoint.answerType as SceneSparkCheckpoint["answerType"])
        : "text";

      const checkpoint: SceneSparkCheckpoint = { id, prompt, answerType };
      if (Array.isArray(rawCheckpoint.choices)) {
        const choices = rawCheckpoint.choices
          .slice(0, maxSceneControlChoices)
          .filter((choice): choice is string => typeof choice === "string")
          .map((choice) => clampText(choice, 80))
          .filter(Boolean);
        if (choices.length > 0) {
          checkpoint.choices = choices;
        }
      }

      return checkpoint;
    })
    .filter(
      (checkpoint): checkpoint is SceneSparkCheckpoint => checkpoint !== null,
    );
}

export function normalizeSparkSceneDraft(
  draft: SparkDraft,
): SparkSceneArtifact {
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

  const artifactId =
    typeof draft.artifactId === "string" && draft.artifactId.trim().length > 0
      ? clampText(draft.artifactId, 120)
      : undefined;

  if (draft.version === sparkSceneV2Version || isPlainObject(draft.files)) {
    const learningObjective =
      typeof draft.learningObjective === "string" &&
      draft.learningObjective.trim().length > 0
        ? clampText(draft.learningObjective, maxSceneObjectiveLength)
        : (summary ?? "Help the learner explore the concept interactively.");

    return {
      kind: "spark_scene",
      version: sparkSceneV2Version,
      sparkType: "scene",
      mode: "editable",
      artifactId,
      title,
      summary,
      payload: {
        version: sparkSceneV2Version,
        learningObjective,
        estimatedInteractionSeconds:
          typeof draft.estimatedInteractionSeconds === "number" &&
          Number.isFinite(draft.estimatedInteractionSeconds)
            ? Math.min(180, Math.max(10, draft.estimatedInteractionSeconds))
            : undefined,
        capabilities: normalizeSceneCapabilities(draft.capabilities),
        files: normalizeSceneFiles(draft.files, draft.html),
        controls: normalizeSceneControls(draft.controls),
        checkpoints: normalizeSceneCheckpoints(draft.checkpoints),
      },
    };
  }

  const html = clampCode(typeof draft.html === "string" ? draft.html : "");

  return {
    kind: "spark_scene",
    version: sparkSceneVersion,
    sparkType: "scene",
    mode: "readonly",
    artifactId,
    title,
    summary,
    payload: {
      html,
    },
  };
}

function normalizeQuizPayload(input: unknown): QuizSparkPayload {
  const candidate = isPlainObject(input) ? input : {};

  const rawQuestions = Array.isArray(candidate.questions)
    ? candidate.questions
    : [];

  const questions = rawQuestions
    .slice(0, maxQuizQuestions)
    .map((rawQuestion, questionIndex) => {
      if (!isPlainObject(rawQuestion)) {
        return null;
      }

      const rawChoices = Array.isArray(rawQuestion.choices)
        ? rawQuestion.choices
        : [];

      const choices = rawChoices
        .slice(0, maxChoicesPerQuestion)
        .map((rawChoice, choiceIndex) => {
          if (!isPlainObject(rawChoice)) {
            return null;
          }

          const text =
            typeof rawChoice.text === "string" &&
            rawChoice.text.trim().length > 0
              ? clampText(rawChoice.text, maxChoiceLength)
              : "";

          if (!text) {
            return null;
          }

          const fallbackId = `q${questionIndex + 1}_c${choiceIndex + 1}`;
          const id =
            typeof rawChoice.id === "string" && rawChoice.id.trim().length > 0
              ? clampText(rawChoice.id, 40)
              : fallbackId;

          return {
            id,
            text,
          } satisfies QuizChoice;
        })
        .filter((choice): choice is QuizChoice => choice !== null);

      if (choices.length < minChoicesPerQuestion) {
        return null;
      }

      const prompt =
        typeof rawQuestion.prompt === "string" &&
        rawQuestion.prompt.trim().length > 0
          ? clampText(rawQuestion.prompt, maxQuestionLength)
          : "";
      if (!prompt) {
        return null;
      }

      const fallbackQuestionId = `q${questionIndex + 1}`;
      const id =
        typeof rawQuestion.id === "string" && rawQuestion.id.trim().length > 0
          ? clampText(rawQuestion.id, 40)
          : fallbackQuestionId;

      const providedCorrectChoiceId =
        typeof rawQuestion.correctChoiceId === "string"
          ? rawQuestion.correctChoiceId
          : undefined;
      const correctChoiceId =
        providedCorrectChoiceId &&
        choices.some((choice) => choice.id === providedCorrectChoiceId)
          ? providedCorrectChoiceId
          : choices[0].id;

      const explanation =
        typeof rawQuestion.explanation === "string" &&
        rawQuestion.explanation.trim().length > 0
          ? clampText(rawQuestion.explanation, maxSummaryLength)
          : undefined;

      const question: QuizQuestion = {
        id,
        prompt,
        choices,
        correctChoiceId,
      };

      if (explanation) {
        question.explanation = explanation;
      }

      return question;
    })
    .filter((question): question is QuizQuestion => question !== null);

  const fallbackQuestions: QuizQuestion[] =
    questions.length >= minQuizQuestions
      ? []
      : [
          {
            id: "q1",
            prompt: "What is the main idea from this lesson?",
            choices: [
              { id: "q1_c1", text: "Option A" },
              { id: "q1_c2", text: "Option B" },
            ],
            correctChoiceId: "q1_c1",
          },
          {
            id: "q2",
            prompt: "Which statement is most accurate?",
            choices: [
              { id: "q2_c1", text: "Choice 1" },
              { id: "q2_c2", text: "Choice 2" },
            ],
            correctChoiceId: "q2_c1",
          },
          {
            id: "q3",
            prompt: "What should you try next?",
            choices: [
              { id: "q3_c1", text: "Apply the concept" },
              { id: "q3_c2", text: "Ignore the concept" },
            ],
            correctChoiceId: "q3_c1",
          },
        ];

  return {
    instructions:
      typeof candidate.instructions === "string" &&
      candidate.instructions.trim().length > 0
        ? clampText(candidate.instructions, maxInstructionsLength)
        : "Answer each question and check your understanding.",
    questions:
      questions.length >= minQuizQuestions ? questions : fallbackQuestions,
  };
}

function normalizeFlashCardPayload(input: unknown): FlashCardSparkPayload {
  const candidate = isPlainObject(input) ? input : {};

  const rawCards = Array.isArray(candidate.cards) ? candidate.cards : [];
  const cards = rawCards
    .slice(0, maxCards)
    .map((rawCard, index) => {
      if (!isPlainObject(rawCard)) {
        return null;
      }

      const front =
        typeof rawCard.front === "string" && rawCard.front.trim().length > 0
          ? clampText(rawCard.front, maxCardFaceLength)
          : "";
      const back =
        typeof rawCard.back === "string" && rawCard.back.trim().length > 0
          ? clampText(rawCard.back, maxCardFaceLength)
          : "";

      if (!front || !back) {
        return null;
      }

      return {
        id:
          typeof rawCard.id === "string" && rawCard.id.trim().length > 0
            ? clampText(rawCard.id, 40)
            : `card_${index + 1}`,
        front,
        back,
      } satisfies FlashCardItem;
    })
    .filter((card): card is FlashCardItem => card !== null);

  const fallbackCards: FlashCardItem[] =
    cards.length >= minCards
      ? []
      : [
          { id: "card_1", front: "Term 1", back: "Definition 1" },
          { id: "card_2", front: "Term 2", back: "Definition 2" },
          { id: "card_3", front: "Term 3", back: "Definition 3" },
          { id: "card_4", front: "Term 4", back: "Definition 4" },
        ];

  return {
    instructions:
      typeof candidate.instructions === "string" &&
      candidate.instructions.trim().length > 0
        ? clampText(candidate.instructions, maxInstructionsLength)
        : "Flip each card, then move forward to practice active recall.",
    cards: cards.length >= minCards ? cards : fallbackCards,
  };
}

export function normalizeSparkQuizDraft(
  draft: QuizSparkDraft,
): SparkQuizArtifact {
  const title = clampText(
    typeof draft.title === "string" && draft.title.trim().length > 0
      ? draft.title
      : getSparkTypeLabel("quiz"),
    maxTitleLength,
  );

  const summary =
    typeof draft.summary === "string" && draft.summary.trim().length > 0
      ? clampText(draft.summary, maxSummaryLength)
      : undefined;

  return {
    kind: "spark_quiz",
    version: sparkSceneVersion,
    sparkType: "quiz",
    mode: "readonly",
    artifactId:
      typeof draft.artifactId === "string" && draft.artifactId.trim().length > 0
        ? clampText(draft.artifactId, 120)
        : undefined,
    title,
    summary,
    payload: normalizeQuizPayload(draft.payload),
  };
}

export function normalizeSparkFlashCardDraft(
  draft: FlashCardSparkDraft,
): SparkFlashCardArtifact {
  const title = clampText(
    typeof draft.title === "string" && draft.title.trim().length > 0
      ? draft.title
      : getSparkTypeLabel("flash_card"),
    maxTitleLength,
  );

  const summary =
    typeof draft.summary === "string" && draft.summary.trim().length > 0
      ? clampText(draft.summary, maxSummaryLength)
      : undefined;

  return {
    kind: "spark_flash_card",
    version: sparkSceneVersion,
    sparkType: "flash_card",
    mode: "readonly",
    artifactId:
      typeof draft.artifactId === "string" && draft.artifactId.trim().length > 0
        ? clampText(draft.artifactId, 120)
        : undefined,
    title,
    summary,
    payload: normalizeFlashCardPayload(draft.payload),
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
    artifactId:
      typeof draft.artifactId === "string" && draft.artifactId.trim().length > 0
        ? clampText(draft.artifactId, 120)
        : undefined,
    title,
    summary,
    payload: normalizedPayload,
  };
}

function normalizeCodeSparkLanguage(value: unknown): CodeSparkLanguage {
  if (value === "typescript" || value === "python") {
    return value;
  }
  return "typescript";
}

function normalizeCodeSparkProvider(value: unknown): CodeSparkProvider {
  if (
    value === "vercel_sandbox" ||
    value === "daytona" ||
    value === "e2b" ||
    value === "local_fake" ||
    value === "unavailable"
  ) {
    return value;
  }
  return "unavailable";
}

function normalizeCodeSparkFileRole(value: unknown): CodeSparkFileRole {
  if (
    value === "starter" ||
    value === "solution" ||
    value === "test" ||
    value === "hidden_test" ||
    value === "config" ||
    value === "readme"
  ) {
    return value;
  }
  return "starter";
}

function normalizeCodeSparkPath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== ".")
    .join("/")
    .slice(0, 160);
}

function isSafeCodeSparkPath(path: string): boolean {
  const normalized = normalizeCodeSparkPath(path);
  return (
    normalized.length > 0 &&
    normalized === path.replace(/\\/g, "/").replace(/^\/+/, "") &&
    !normalized.split("/").includes("..") &&
    !/^[a-zA-Z]:/.test(path) &&
    !path.startsWith("/")
  );
}

function normalizeCodeSparkFiles(
  input: unknown,
  language: CodeSparkLanguage,
): CodeSparkFile<CodeSparkLanguage>[] {
  const rawFiles = Array.isArray(input) ? input : [];
  const normalized = rawFiles
    .slice(0, maxCodeSparkFiles)
    .map((rawFile, index) => {
      if (!isPlainObject(rawFile)) {
        return null;
      }
      if (rawFile.role === "hidden_test") {
        return null;
      }
      const fallbackPath =
        language === "python"
          ? `main_${index + 1}.py`
          : `src/file_${index + 1}.ts`;
      const rawPath =
        typeof rawFile.path === "string" && rawFile.path.trim()
          ? rawFile.path
          : fallbackPath;
      const path = normalizeCodeSparkPath(rawPath);
      const contents =
        typeof rawFile.contents === "string"
          ? rawFile.contents.slice(0, maxCodeSparkFileBytes)
          : "";

      if (!path || !contents) {
        return null;
      }

      return {
        path,
        language: normalizeCodeSparkLanguage(rawFile.language ?? language),
        contents,
        editable: rawFile.editable !== false,
        role: normalizeCodeSparkFileRole(rawFile.role),
      } satisfies CodeSparkFile<CodeSparkLanguage>;
    })
    .filter((file): file is CodeSparkFile<CodeSparkLanguage> => file !== null);

  if (normalized.length > 0) {
    return normalized;
  }

  if (language === "python") {
    return [
      {
        path: codeSparkPythonStarterPath,
        language: "python",
        contents: codeSparkPythonStarterSource,
        editable: true,
        role: "starter",
      },
      {
        path: codeSparkPythonCheckPath,
        language: "python",
        contents: codeSparkPythonCheckSource,
        editable: false,
        role: "test",
      },
    ];
  }

  return [
    {
      path: "src/main.ts",
      language: "typescript",
      contents: "export function answer() {\n  return undefined;\n}\n",
      editable: true,
      role: "starter",
    },
  ];
}

function normalizeCodeSparkTests(input: unknown): CodeSparkTest[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .slice(0, maxCodeSparkTests)
    .map((rawTest, index) => {
      if (!isPlainObject(rawTest)) {
        return null;
      }
      if (rawTest.hidden === true) {
        return null;
      }
      const label =
        typeof rawTest.label === "string" && rawTest.label.trim()
          ? clampText(rawTest.label, 120)
          : `Check ${index + 1}`;
      const command =
        typeof rawTest.command === "string" && rawTest.command.trim()
          ? clampText(rawTest.command, 180)
          : "node tests/main.check.ts";

      const test: CodeSparkTest = {
        id:
          typeof rawTest.id === "string" && rawTest.id.trim()
            ? clampText(rawTest.id, 64)
            : `check_${index + 1}`,
        label,
        command,
        hidden: false,
      };
      return test;
    })
    .filter((test): test is CodeSparkTest => test !== null);
}

export function normalizeCodeSparkDraft(
  draft: CodeSparkDraft,
  sparkType: "code" | "test" = "code",
): SparkCodeArtifact<CodeSparkLanguage> {
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
  const payload = isPlainObject(draft.payload) ? draft.payload : {};
  const language = normalizeCodeSparkLanguage(payload.language);
  const files = normalizeCodeSparkFiles(payload.files, language);
  const normalizedTests = normalizeCodeSparkTests(payload.tests);
  const tests =
    normalizedTests.length > 0
      ? normalizedTests
      : language === "python" &&
          files.some((file) => file.path === codeSparkPythonCheckPath)
        ? [
            {
              id: "visible-answer",
              label: "answer() returns a concrete value",
              command: codeSparkPythonTestCommand,
              hidden: false,
            },
          ]
        : normalizedTests;
  const firstEditable = files.find((file) => file.editable) ?? files[0];
  const provider = normalizeCodeSparkProvider(payload.provider);
  return {
    kind: "spark_code",
    version: sparkSceneVersion,
    sparkType,
    mode: "editable",
    artifactId:
      typeof draft.artifactId === "string" && draft.artifactId.trim().length > 0
        ? clampText(draft.artifactId, 120)
        : undefined,
    title,
    summary,
    payload: {
      mode: payload.mode === "workspace" ? "workspace" : "challenge",
      language,
      instructions:
        typeof payload.instructions === "string" && payload.instructions.trim()
          ? clampText(payload.instructions, maxCodeSparkInstructionsLength)
          : "Predict what the code should do, run it, then make the smallest useful fix.",
      provider,
      providerStatus:
        payload.providerStatus === "configured" ||
        payload.providerStatus === "test_only" ||
        payload.providerStatus === "unavailable"
          ? payload.providerStatus
          : "unconfigured",
      activePath:
        typeof payload.activePath === "string" && payload.activePath.trim()
          ? normalizeCodeSparkPath(payload.activePath)
          : firstEditable.path,
      files,
      tests,
      hiddenTestCount: 0,
      runCommand:
        typeof payload.runCommand === "string" && payload.runCommand.trim()
          ? clampText(payload.runCommand, 180)
          : language === "python"
            ? codeSparkPythonRunCommand
            : "node src/main.ts",
      testCommand:
        typeof payload.testCommand === "string" && payload.testCommand.trim()
          ? clampText(payload.testCommand, 180)
          : language === "python"
            ? codeSparkPythonTestCommand
            : "node tests/main.check.ts",
      lastRun: isPlainObject(payload.lastRun)
        ? (payload.lastRun as CodeSparkRunSummary)
        : undefined,
      lab: {
        enabled: false,
        reason: "Open in Lab is disabled until a real Lab handoff exists.",
      },
    },
  };
}

export function validateCodeSparkPayload(
  payload: CodeSparkPayload | unknown,
): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const candidate = isPlainObject(payload) ? payload : {};

  if (candidate.language !== "typescript" && candidate.language !== "python") {
    errors.push("Code Spark currently supports JS/TypeScript and Python only.");
  }

  if (!Array.isArray(candidate.files) || candidate.files.length === 0) {
    errors.push("Code Spark requires at least one file.");
  } else if (candidate.files.length > maxCodeSparkFiles) {
    errors.push(`Code Spark supports at most ${maxCodeSparkFiles} files.`);
  }

  const paths = new Set<string>();
  for (const [index, rawFile] of (Array.isArray(candidate.files)
    ? candidate.files
    : []
  ).entries()) {
    if (!isPlainObject(rawFile)) {
      errors.push(`File ${index + 1} must be an object.`);
      continue;
    }
    const path = typeof rawFile.path === "string" ? rawFile.path : "";
    if (!isSafeCodeSparkPath(path)) {
      errors.push(`File ${index + 1} has an unsafe path.`);
    }
    if (paths.has(path)) {
      errors.push(`Duplicate file path: ${path}.`);
    }
    paths.add(path);
    if (
      typeof rawFile.contents !== "string" ||
      rawFile.contents.length > maxCodeSparkFileBytes
    ) {
      errors.push(
        `File ${path || index + 1} is missing contents or is too large.`,
      );
    }
    if (rawFile.role === "hidden_test") {
      errors.push("Code Spark v1 only supports visible check files.");
    }
    if (rawFile.language !== "typescript" && rawFile.language !== "python") {
      errors.push(
        `File ${path || index + 1} uses an unsupported executable language.`,
      );
    }
  }

  if (!paths.has(String(candidate.activePath ?? ""))) {
    warnings.push("Active file was not found in the file list.");
  }

  if (!Array.isArray(candidate.tests) || candidate.tests.length === 0) {
    warnings.push("Code Spark has no visible checks yet.");
  } else if (candidate.tests.length > maxCodeSparkTests) {
    errors.push(`Code Spark supports at most ${maxCodeSparkTests} checks.`);
  }
  for (const [index, rawTest] of (Array.isArray(candidate.tests)
    ? candidate.tests
    : []
  ).entries()) {
    if (isPlainObject(rawTest) && rawTest.hidden === true) {
      errors.push(
        `Check ${index + 1} is hidden; Code Spark v1 only supports visible checks.`,
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function normalizeCreateSparkInput(
  input: CreateSparkToolInput,
): CreateSparkToolInput {
  const sparkId = normalizeSparkType(input.sparkId);
  const acceptsModelHeaderCopy = sparkId !== "code" && sparkId !== "test";
  return {
    sparkId,
    context: clampText(input.context, 400),
    title:
      acceptsModelHeaderCopy &&
      typeof input.title === "string" &&
      input.title.trim().length > 0
        ? clampText(input.title, maxTitleLength)
        : undefined,
    summary:
      acceptsModelHeaderCopy &&
      typeof input.summary === "string" &&
      input.summary.trim().length > 0
        ? clampText(input.summary, maxSummaryLength)
        : undefined,
  };
}

export function isSparkType(value: unknown): value is SparkType {
  return typeof value === "string" && sparkTypes.includes(value as SparkType);
}

function isSceneSparkV2Payload(value: unknown): value is SceneSparkV2Payload {
  if (!isPlainObject(value) || value.version !== sparkSceneV2Version) {
    return false;
  }

  if (
    typeof value.learningObjective !== "string" ||
    !isPlainObject(value.capabilities) ||
    !isPlainObject(value.files) ||
    typeof value.files["index.html"] !== "string" ||
    !Array.isArray(value.controls) ||
    !Array.isArray(value.checkpoints)
  ) {
    return false;
  }

  const capabilities = value.capabilities;
  if (
    typeof capabilities.usesCanvas !== "boolean" ||
    typeof capabilities.usesSvg !== "boolean" ||
    typeof capabilities.needsNetwork !== "boolean" ||
    typeof capabilities.recordsAnswers !== "boolean"
  ) {
    return false;
  }

  return true;
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
    (candidate.version !== sparkSceneVersion &&
      candidate.version !== sparkSceneV2Version) ||
    candidate.sparkType !== "scene" ||
    typeof candidate.title !== "string" ||
    (candidate.mode !== "readonly" && candidate.mode !== "editable")
  ) {
    return false;
  }

  if (
    candidate.artifactId !== undefined &&
    typeof candidate.artifactId !== "string"
  ) {
    return false;
  }

  if (!candidate.payload || typeof candidate.payload !== "object") {
    return false;
  }

  if (candidate.version === sparkSceneV2Version) {
    return isSceneSparkV2Payload(candidate.payload);
  }

  const payload = candidate.payload as Partial<SceneSparkV1Payload>;
  return typeof payload.html === "string";
}

function isQuizPayload(value: unknown): value is QuizSparkPayload {
  if (!isPlainObject(value) || !Array.isArray(value.questions)) {
    return false;
  }

  if (
    value.instructions !== undefined &&
    typeof value.instructions !== "string"
  ) {
    return false;
  }

  return value.questions.every((question) => {
    if (!isPlainObject(question)) {
      return false;
    }

    if (
      typeof question.id !== "string" ||
      typeof question.prompt !== "string" ||
      typeof question.correctChoiceId !== "string" ||
      !Array.isArray(question.choices)
    ) {
      return false;
    }

    if (
      question.explanation !== undefined &&
      typeof question.explanation !== "string"
    ) {
      return false;
    }

    return question.choices.every(
      (choice) =>
        isPlainObject(choice) &&
        typeof choice.id === "string" &&
        typeof choice.text === "string",
    );
  });
}

export function isSparkQuizArtifact(
  value: unknown,
): value is SparkQuizArtifact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SparkQuizArtifact>;
  if (
    candidate.kind !== "spark_quiz" ||
    candidate.version !== sparkSceneVersion ||
    candidate.sparkType !== "quiz" ||
    typeof candidate.title !== "string" ||
    (candidate.mode !== "readonly" && candidate.mode !== "editable")
  ) {
    return false;
  }

  if (
    candidate.artifactId !== undefined &&
    typeof candidate.artifactId !== "string"
  ) {
    return false;
  }

  return isQuizPayload(candidate.payload);
}

function isFlashCardPayload(value: unknown): value is FlashCardSparkPayload {
  if (!isPlainObject(value) || !Array.isArray(value.cards)) {
    return false;
  }

  if (
    value.instructions !== undefined &&
    typeof value.instructions !== "string"
  ) {
    return false;
  }

  return value.cards.every(
    (card) =>
      isPlainObject(card) &&
      typeof card.id === "string" &&
      typeof card.front === "string" &&
      typeof card.back === "string",
  );
}

export function isSparkFlashCardArtifact(
  value: unknown,
): value is SparkFlashCardArtifact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SparkFlashCardArtifact>;
  if (
    candidate.kind !== "spark_flash_card" ||
    candidate.version !== sparkSceneVersion ||
    candidate.sparkType !== "flash_card" ||
    typeof candidate.title !== "string" ||
    (candidate.mode !== "readonly" && candidate.mode !== "editable")
  ) {
    return false;
  }

  if (
    candidate.artifactId !== undefined &&
    typeof candidate.artifactId !== "string"
  ) {
    return false;
  }

  return isFlashCardPayload(candidate.payload);
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

  if (
    candidate.artifactId !== undefined &&
    typeof candidate.artifactId !== "string"
  ) {
    return false;
  }

  return isDesmosGraphPayload(candidate.payload);
}

function isCodeSparkPayload(value: unknown): value is CodeSparkPayload {
  if (!isPlainObject(value)) {
    return false;
  }
  if (
    (value.mode !== "workspace" && value.mode !== "challenge") ||
    typeof value.instructions !== "string" ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.tests) ||
    typeof value.activePath !== "string" ||
    typeof value.runCommand !== "string" ||
    typeof value.testCommand !== "string" ||
    typeof value.hiddenTestCount !== "number" ||
    !isPlainObject(value.lab) ||
    (value.language !== "typescript" &&
      value.language !== "python" &&
      value.language !== "c" &&
      value.language !== "rust" &&
      value.language !== "mixed")
  ) {
    return false;
  }

  return value.files.every((file) => {
    return (
      isPlainObject(file) &&
      typeof file.path === "string" &&
      typeof file.contents === "string" &&
      typeof file.editable === "boolean" &&
      (file.language === "typescript" ||
        file.language === "python" ||
        file.language === "c" ||
        file.language === "rust" ||
        file.language === "mixed") &&
      typeof file.role === "string"
    );
  });
}

export function isSparkCodeArtifact(
  value: unknown,
): value is SparkCodeArtifact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SparkCodeArtifact>;
  if (
    candidate.kind !== "spark_code" ||
    candidate.version !== sparkSceneVersion ||
    (candidate.sparkType !== "code" && candidate.sparkType !== "test") ||
    candidate.mode !== "editable" ||
    typeof candidate.title !== "string"
  ) {
    return false;
  }

  if (
    candidate.artifactId !== undefined &&
    typeof candidate.artifactId !== "string"
  ) {
    return false;
  }

  return isCodeSparkPayload(candidate.payload);
}

export function isSparkArtifact(value: unknown): value is SparkArtifact {
  return (
    isSparkSceneArtifact(value) ||
    isSparkQuizArtifact(value) ||
    isSparkFlashCardArtifact(value) ||
    isSparkDesmosGraphArtifact(value) ||
    isSparkCodeArtifact(value)
  );
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
