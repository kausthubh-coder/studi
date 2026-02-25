import { loadPrompt } from "../../prompts";

export const sparkSceneSkill = {
  name: "Spark Scene",
  description:
    "Create a single self-contained HTML file for a micro-interactive learning visualization.",
  whenToUse:
    "Use when the learner would understand better with an interactive visual demo instead of text alone.",
  instructions: loadPrompt("sparks/skills/scene.md"),
} as const;
