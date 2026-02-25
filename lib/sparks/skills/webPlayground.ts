import { loadPrompt } from "../../prompts";

export const sparkWebPlaygroundSkill = {
  name: "Web Playground",
  description:
    "Create an editable HTML/CSS/JS playground spark with live preview for frontend practice.",
  whenToUse:
    "Use when the learner should practice web fundamentals by editing HTML, CSS, and JavaScript and seeing immediate visual output.",
  instructions: loadPrompt("sparks/skills/web-playground.md"),
} as const;
