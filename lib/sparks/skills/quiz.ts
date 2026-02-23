export const sparkQuizSkill = {
  name: "Quiz",
  description:
    "Create an interactive quiz scene with multiple questions, instant feedback, and a score.",
  whenToUse:
    "Use when the learner should check understanding with short questions and immediate correctness feedback.",
  instructions: `You are building a Quiz Spark artifact.

Return strict JSON with keys: title, summary, workerSummary, html.
Do not use markdown code fences.

Use this HTML shell (you can customize body content and classes):
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  </head>
  <body>
    <!-- quiz content -->
  </body>
</html>

Quiz requirements:
- Include 3-6 focused questions on one concept.
- Support clear answer selection or short input for each question.
- Show immediate feedback (correct/incorrect) and a running score.
- Include a final result state and a retry button.
- Include concise learner instructions in the UI.

Speed + reliability constraints:
- Keep html compact (prefer under 6000 chars).
- Keep JavaScript simple and short (prefer under 180 lines).
- Avoid heavy animations, long loops, or complex rendering.

Safety constraints:
- No network requests.
- No external scripts besides the Tailwind browser script above.
- No popups, top-level navigation, or storage requirements.

Quality constraints:
- Ensure quiz is usable on mobile and desktop.
- Keep wording clear, short, and age-neutral.
- Make interactions keyboard-friendly when reasonable.`,
} as const;
