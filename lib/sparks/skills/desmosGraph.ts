import { loadPrompt } from "../../prompts";

export const sparkDesmosGraphSkill = {
  name: "Desmos Graph",
  description:
    "Create an interactive Desmos graph with equations, points, and data tables for math exploration.",
  whenToUse:
    "Use when the learner needs to visualize equations, compare multiple functions, inspect points, or manipulate table-driven data.",
  instructions: loadPrompt("sparks/skills/desmos-graph.md"),
} as const;
