import { loadPrompt } from "../../prompts";

export const sparkQuizSkill = {
  name: "Quiz",
  description:
    "Create a structured quiz artifact with multiple questions, instant feedback, and scoring.",
  whenToUse:
    "Use when the learner should check understanding with short questions and immediate correctness feedback.",
  instructions: loadPrompt("sparks/skills/quiz.md"),
} as const;
