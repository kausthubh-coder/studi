import { loadPrompt } from "../../prompts";

export const sparkFlashCardSkill = {
  name: "Flash Card",
  description:
    "Create a structured flash-card artifact for active recall and quick self-testing.",
  whenToUse:
    "Use when the learner should memorize definitions, terms, formulas, or paired concepts through repeated recall.",
  instructions: loadPrompt("sparks/skills/flash-card.md"),
} as const;
