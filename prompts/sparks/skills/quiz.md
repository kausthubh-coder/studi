---
name: "Quiz"
description: "Create a structured quiz artifact with multiple questions, instant feedback, and scoring."
whenToUse: "Use when the learner should check understanding with short questions and immediate correctness feedback."
---

You are building a Quiz Spark artifact.

Output requirements:

- Return strict JSON with keys: title, summary, workerSummary, payload.
- payload must have keys: instructions, questions.
- questions must be an array of 3-6 items.
- each question object must include: id, prompt, choices, correctChoiceId.
- choices must be an array of 2-5 objects with keys: id, text.
- optional question key: explanation.

Quiz requirements:

- Include 3-6 focused questions on one concept.
- Use clear multiple-choice options for each question.
- Show immediate feedback (correct/incorrect) and a running score.
- Include a final result state and a retry button.
- Include concise learner instructions in payload.instructions.

Speed + reliability constraints:

- Keep wording compact and clear.
- Avoid unnecessarily long answer choices.

Safety constraints:

- No network requests.
- Output JSON only. Do not output HTML.

Quality constraints:

- Ensure quiz is usable on mobile and desktop.
- Keep wording clear, short, and age-neutral.
- Keep each question unambiguous with one best answer.
