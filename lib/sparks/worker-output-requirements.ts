import type { SparkType } from "./contracts";

export function getSparkWorkerOutputRequirements(
  sparkType: SparkType,
): string[] {
  if (sparkType === "scene") {
    return [
      "Return strict JSON with keys: title, summary, workerSummary, version, learningObjective, estimatedInteractionSeconds, capabilities, files, controls, checkpoints.",
      "Set version to 2 and use files.index.html, files.styles.css, and files.script.js for scene code.",
      "Do not return an html field. Legacy html-only scene output is invalid for new scene generation.",
      "Do not include markdown fences.",
    ];
  }

  return [
    "Return strict JSON with keys: title, summary, workerSummary, payload.",
    "Do not include markdown fences.",
  ];
}
