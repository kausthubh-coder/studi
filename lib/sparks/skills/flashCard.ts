export const sparkFlashCardSkill = {
  name: "Flash Card",
  description:
    "Create an interactive flash-card deck scene for active recall and quick self-testing.",
  whenToUse:
    "Use when the learner should memorize definitions, terms, formulas, or paired concepts through repeated recall.",
  instructions: `You are building a Flash Card Spark artifact.

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
    <!-- flash card content -->
  </body>
</html>

Flash-card requirements:
- Include 5-10 concise cards focused on one topic.
- Each card needs a front prompt and back answer.
- Include a clear flip interaction (button and/or click card).
- Include previous/next navigation and visible progress (e.g., 3/8).
- Include a shuffle action and reset behavior.
- Include short learner instructions in the UI.

Speed + reliability constraints:
- Keep html compact (prefer under 6000 chars).
- Keep JavaScript simple and short (prefer under 180 lines).
- Avoid heavy animations, long loops, or complex rendering.

Safety constraints:
- No network requests.
- No external scripts besides the Tailwind browser script above.
- No popups, top-level navigation, or storage requirements.

Quality constraints:
- Ensure scene is usable on mobile and desktop.
- Use clear language and balanced card lengths.
- Keep controls obvious and accessible.`,
} as const;
