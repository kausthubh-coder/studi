import {
  isCodePlaygroundLanguage,
  isSparkType as isManifestSparkType,
  sparkManifestById,
} from "./manifest";
export {
  codePlaygroundLanguages,
  sparkManifest,
  sparkManifestById,
  sparkTypes,
  type CodePlaygroundLanguage,
  type SparkDefaultPlacement,
  type SparkManifestEntry,
  type SparkRendererKey,
  type SparkType,
} from "./manifest";
import type { CodePlaygroundLanguage, SparkType } from "./manifest";

export const sparkSceneVersion = 1 as const;

export type SparkMode = "readonly" | "editable";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SceneSparkPayload = {
  html: string;
};

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

export type CodePlaygroundPayload = {
  language: CodePlaygroundLanguage;
  instructions: string;
  starterCode: string;
  testCode?: string;
  runHint?: string;
};

export type WebPlaygroundPayload = {
  html: string;
  css?: string;
  js?: string;
  instructions?: string;
  runHint?: string;
};

export type SparkSceneArtifact = {
  kind: "spark_scene";
  version: typeof sparkSceneVersion;
  sparkType: "scene";
  mode: SparkMode;
  artifactId?: string;
  title: string;
  summary?: string;
  payload: SceneSparkPayload;
};

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

export type SparkCodePlaygroundArtifact = {
  kind: "spark_code_playground";
  version: typeof sparkSceneVersion;
  sparkType: "code_playground";
  mode: SparkMode;
  artifactId?: string;
  title: string;
  summary?: string;
  payload: CodePlaygroundPayload;
};

export type SparkWebPlaygroundArtifact = {
  kind: "spark_web_playground";
  version: typeof sparkSceneVersion;
  sparkType: "web_playground";
  mode: SparkMode;
  artifactId?: string;
  title: string;
  summary?: string;
  payload: WebPlaygroundPayload;
};

export type SparkArtifact =
  | SparkSceneArtifact
  | SparkQuizArtifact
  | SparkFlashCardArtifact
  | SparkDesmosGraphArtifact
  | SparkCodePlaygroundArtifact
  | SparkWebPlaygroundArtifact;

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

export type CodePlaygroundSparkDraft = {
  payload: CodePlaygroundPayload;
  artifactId?: string;
  title?: string;
  summary?: string;
  workerSummary?: string;
};

export type WebPlaygroundSparkDraft = {
  payload: WebPlaygroundPayload;
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
const maxCodePlaygroundLength = 22_000;
const maxInstructionsLength = 1_200;
const maxRunHintLength = 240;
const maxHintLength = 180;
const maxExpressions = 40;
const maxQuizQuestions = 8;
const minQuizQuestions = 3;
const maxChoicesPerQuestion = 6;
const minChoicesPerQuestion = 2;
const maxCards = 16;
const minCards = 4;
const maxQuestionLength = 280;
const maxChoiceLength = 180;
const maxCardFaceLength = 280;

function clampText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function clampCode(value: string): string {
  return value.slice(0, maxCodeLength);
}

function clampPlaygroundCode(value: string): string {
  return value.slice(0, maxCodePlaygroundLength);
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
  if (isManifestSparkType(sparkType)) {
    return sparkType;
  }
  return "scene";
}

function normalizeCodePlaygroundLanguage(
  value: unknown,
): CodePlaygroundLanguage {
  if (isCodePlaygroundLanguage(value)) {
    return value;
  }
  return "python";
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
  return sparkManifestById[sparkType].label;
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
    artifactId:
      typeof draft.artifactId === "string" && draft.artifactId.trim().length > 0
        ? clampText(draft.artifactId, 120)
        : undefined,
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

function normalizeWebPlaygroundPayload(input: unknown): WebPlaygroundPayload {
  const candidate = isPlainObject(input) ? input : {};

  const htmlRaw =
    typeof candidate.html === "string"
      ? clampPlaygroundCode(candidate.html)
      : "";
  const html =
    htmlRaw.trim().length > 0
      ? htmlRaw
      : '<!doctype html>\n<html>\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Web Playground</title>\n  </head>\n  <body>\n    <h1>Hello, Studi!</h1>\n    <p>Edit this HTML, CSS, and JavaScript to learn frontend basics.</p>\n  </body>\n</html>';

  const css =
    typeof candidate.css === "string" && candidate.css.trim().length > 0
      ? clampPlaygroundCode(candidate.css)
      : undefined;

  const js =
    typeof candidate.js === "string" && candidate.js.trim().length > 0
      ? clampPlaygroundCode(candidate.js)
      : undefined;

  const instructions =
    typeof candidate.instructions === "string" &&
    candidate.instructions.trim().length > 0
      ? clampText(candidate.instructions, maxInstructionsLength)
      : "Edit the files and click Run to preview your webpage.";

  const runHint =
    typeof candidate.runHint === "string" && candidate.runHint.trim().length > 0
      ? clampText(candidate.runHint, maxRunHintLength)
      : undefined;

  return {
    html,
    css,
    js,
    instructions,
    runHint,
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

export function normalizeSparkCodePlaygroundDraft(
  draft: CodePlaygroundSparkDraft,
): SparkCodePlaygroundArtifact {
  const title = clampText(
    typeof draft.title === "string" && draft.title.trim().length > 0
      ? draft.title
      : getSparkTypeLabel("code_playground"),
    maxTitleLength,
  );

  const summary =
    typeof draft.summary === "string" && draft.summary.trim().length > 0
      ? clampText(draft.summary, maxSummaryLength)
      : undefined;

  const payload = draft.payload;

  const normalizedPayload: CodePlaygroundPayload = {
    language: normalizeCodePlaygroundLanguage(payload.language),
    instructions:
      typeof payload.instructions === "string" &&
      payload.instructions.trim().length > 0
        ? clampText(payload.instructions, maxInstructionsLength)
        : "Run the code and modify it to test your understanding.",
    starterCode: clampPlaygroundCode(
      typeof payload.starterCode === "string" ? payload.starterCode : "",
    ),
    testCode:
      typeof payload.testCode === "string" && payload.testCode.trim().length > 0
        ? clampPlaygroundCode(payload.testCode)
        : undefined,
    runHint:
      typeof payload.runHint === "string" && payload.runHint.trim().length > 0
        ? clampText(payload.runHint, maxRunHintLength)
        : undefined,
  };

  return {
    kind: "spark_code_playground",
    version: sparkSceneVersion,
    sparkType: "code_playground",
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

export function normalizeSparkWebPlaygroundDraft(
  draft: WebPlaygroundSparkDraft,
): SparkWebPlaygroundArtifact {
  const title = clampText(
    typeof draft.title === "string" && draft.title.trim().length > 0
      ? draft.title
      : getSparkTypeLabel("web_playground"),
    maxTitleLength,
  );

  const summary =
    typeof draft.summary === "string" && draft.summary.trim().length > 0
      ? clampText(draft.summary, maxSummaryLength)
      : undefined;

  return {
    kind: "spark_web_playground",
    version: sparkSceneVersion,
    sparkType: "web_playground",
    mode: "editable",
    artifactId:
      typeof draft.artifactId === "string" && draft.artifactId.trim().length > 0
        ? clampText(draft.artifactId, 120)
        : undefined,
    title,
    summary,
    payload: normalizeWebPlaygroundPayload(draft.payload),
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
  return isManifestSparkType(value);
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

  if (
    candidate.artifactId !== undefined &&
    typeof candidate.artifactId !== "string"
  ) {
    return false;
  }

  if (!candidate.payload || typeof candidate.payload !== "object") {
    return false;
  }

  const payload = candidate.payload as Partial<SceneSparkPayload>;
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

function isCodePlaygroundPayload(
  value: unknown,
): value is CodePlaygroundPayload {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    isCodePlaygroundLanguage(value.language) &&
    typeof value.instructions === "string" &&
    typeof value.starterCode === "string" &&
    (value.testCode === undefined || typeof value.testCode === "string") &&
    (value.runHint === undefined || typeof value.runHint === "string")
  );
}

function isWebPlaygroundPayload(value: unknown): value is WebPlaygroundPayload {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    typeof value.html === "string" &&
    (value.css === undefined || typeof value.css === "string") &&
    (value.js === undefined || typeof value.js === "string") &&
    (value.instructions === undefined ||
      typeof value.instructions === "string") &&
    (value.runHint === undefined || typeof value.runHint === "string")
  );
}

export function isSparkCodePlaygroundArtifact(
  value: unknown,
): value is SparkCodePlaygroundArtifact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SparkCodePlaygroundArtifact>;
  if (
    candidate.kind !== "spark_code_playground" ||
    candidate.version !== sparkSceneVersion ||
    candidate.sparkType !== "code_playground" ||
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

  return isCodePlaygroundPayload(candidate.payload);
}

export function isSparkWebPlaygroundArtifact(
  value: unknown,
): value is SparkWebPlaygroundArtifact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SparkWebPlaygroundArtifact>;
  if (
    candidate.kind !== "spark_web_playground" ||
    candidate.version !== sparkSceneVersion ||
    candidate.sparkType !== "web_playground" ||
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

  return isWebPlaygroundPayload(candidate.payload);
}

export function isSparkArtifact(value: unknown): value is SparkArtifact {
  return (
    isSparkSceneArtifact(value) ||
    isSparkQuizArtifact(value) ||
    isSparkFlashCardArtifact(value) ||
    isSparkDesmosGraphArtifact(value) ||
    isSparkCodePlaygroundArtifact(value) ||
    isSparkWebPlaygroundArtifact(value)
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
