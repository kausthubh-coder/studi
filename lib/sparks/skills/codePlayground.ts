import { loadPrompt } from "../../prompts";

export const sparkCodePlaygroundSkill = {
  name: "Code Playground",
  description:
    "Create an editable coding sandbox spark with starter code and a short challenge.",
  whenToUse:
    "Use when the learner should practice by editing and running code to verify understanding.",
  instructions: loadPrompt("sparks/skills/code-playground.md"),
} as const;
