import type { ModelRouteKey } from "../model-config";

export const codePlaygroundLanguages = [
  "python",
  "javascript",
  "typescript",
] as const;

export type CodePlaygroundLanguage =
  (typeof codePlaygroundLanguages)[number];

export type SparkArtifactKind =
  | "spark_scene"
  | "spark_quiz"
  | "spark_flash_card"
  | "spark_desmos_graph"
  | "spark_code_playground"
  | "spark_web_playground";

export type SparkWorkerShape = "html" | "payload";

export type SparkRendererKey =
  | "html_css_js_sandbox"
  | "quiz"
  | "flash_card"
  | "desmos_graph"
  | "code_playground"
  | "web_playground";

export type SparkDefaultPlacement = "inline" | "side_panel";

export type SparkWorkerModelKey = Extract<
  ModelRouteKey,
  | "sparkSceneWorker"
  | "sparkDesmosWorker"
  | "sparkCodeWorker"
  | "sparkWebWorker"
  | "sparkQuizWorker"
  | "sparkFlashWorker"
>;

export type SparkManifestEntry = {
  id: string;
  label: string;
  description: string;
  whenToUse: string;
  promptPath: string;
  artifactKind: SparkArtifactKind;
  workerShape: SparkWorkerShape;
  rendererKey: SparkRendererKey;
  defaultPlacement: SparkDefaultPlacement;
  workerModelKey: SparkWorkerModelKey;
};

export const sparkManifest = [
  {
    id: "scene",
    label: "Scene",
    description:
      "Create a single self-contained HTML file for a micro-interactive learning visualization.",
    whenToUse:
      "Use when the learner would understand better with an interactive visual demo instead of text alone.",
    promptPath: "sparks/skills/scene.md",
    artifactKind: "spark_scene",
    workerShape: "html",
    rendererKey: "html_css_js_sandbox",
    defaultPlacement: "side_panel",
    workerModelKey: "sparkSceneWorker",
  },
  {
    id: "quiz",
    label: "Quiz",
    description:
      "Create a structured quiz artifact with multiple questions, instant feedback, and scoring.",
    whenToUse:
      "Use when the learner should check understanding with short questions and immediate correctness feedback.",
    promptPath: "sparks/skills/quiz.md",
    artifactKind: "spark_quiz",
    workerShape: "payload",
    rendererKey: "quiz",
    defaultPlacement: "inline",
    workerModelKey: "sparkQuizWorker",
  },
  {
    id: "flash_card",
    label: "Flash Card",
    description:
      "Create a structured flash-card artifact for active recall and quick self-testing.",
    whenToUse:
      "Use when the learner should memorize definitions, terms, formulas, or paired concepts through repeated recall.",
    promptPath: "sparks/skills/flash-card.md",
    artifactKind: "spark_flash_card",
    workerShape: "payload",
    rendererKey: "flash_card",
    defaultPlacement: "inline",
    workerModelKey: "sparkFlashWorker",
  },
  {
    id: "desmos_graph",
    label: "Desmos Graph",
    description:
      "Create an interactive Desmos graph with equations, points, and data tables for math exploration.",
    whenToUse:
      "Use when the learner needs to visualize equations, compare multiple functions, inspect points, or manipulate table-driven data.",
    promptPath: "sparks/skills/desmos-graph.md",
    artifactKind: "spark_desmos_graph",
    workerShape: "payload",
    rendererKey: "desmos_graph",
    defaultPlacement: "side_panel",
    workerModelKey: "sparkDesmosWorker",
  },
  {
    id: "code_playground",
    label: "Code Playground",
    description:
      "Create an editable coding spark with starter code and a short challenge.",
    whenToUse:
      "Use when the learner should practice by editing and running code to verify understanding.",
    promptPath: "sparks/skills/code-playground.md",
    artifactKind: "spark_code_playground",
    workerShape: "payload",
    rendererKey: "code_playground",
    defaultPlacement: "side_panel",
    workerModelKey: "sparkCodeWorker",
  },
  {
    id: "web_playground",
    label: "Web Playground",
    description:
      "Create an editable HTML/CSS/JS playground spark with live preview for frontend practice.",
    whenToUse:
      "Use when the learner should practice web fundamentals by editing HTML, CSS, and JavaScript and seeing immediate visual output.",
    promptPath: "sparks/skills/web-playground.md",
    artifactKind: "spark_web_playground",
    workerShape: "payload",
    rendererKey: "web_playground",
    defaultPlacement: "side_panel",
    workerModelKey: "sparkWebWorker",
  },
] as const satisfies readonly SparkManifestEntry[];

export type SparkManifest = typeof sparkManifest;
export type SparkType = SparkManifest[number]["id"];

export const sparkTypes = sparkManifest.map((spark) => spark.id) as [
  SparkType,
  ...SparkType[],
];

export const sparkManifestById: Readonly<Record<SparkType, SparkManifestEntry>> =
  Object.freeze(
    Object.fromEntries(
      sparkManifest.map((spark) => [spark.id, spark] as const),
    ) as Record<SparkType, SparkManifestEntry>,
  );

export function isSparkType(value: unknown): value is SparkType {
  return typeof value === "string" && value in sparkManifestById;
}

export function isCodePlaygroundLanguage(
  value: unknown,
): value is CodePlaygroundLanguage {
  return (
    typeof value === "string" &&
    codePlaygroundLanguages.includes(value as CodePlaygroundLanguage)
  );
}
