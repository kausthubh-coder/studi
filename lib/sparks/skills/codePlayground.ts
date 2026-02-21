export const sparkCodePlaygroundSkill = {
  name: "Code Playground",
  description:
    "Create an editable coding sandbox spark with starter code and a short challenge.",
  whenToUse:
    "Use when the learner should practice by editing and running code to verify understanding.",
  instructions: `You are building a Code Playground Spark artifact.

Output requirements:
- Return strict JSON with keys: title, summary, workerSummary, payload.
- payload must have keys: language, instructions, starterCode.
- language must be "python".
- Optional payload keys: testCode, runHint.

Pedagogy requirements:
- Keep the exercise focused on one concept.
- Starter code should be runnable with no external dependencies.
- Write valid Python with explicit newlines and indentation.
- Do not place inline comments after function headers (avoid: def f(x): # ...).
- Add clear instructions in 1-3 short sentences.
- Prefer small examples and immediate feedback moments.

Safety + runtime constraints:
- Python runs in-browser via Pyodide.
- Do not require network requests, files, or OS access.
- Keep starterCode compact (prefer under 120 lines).
- If you include testCode, make it deterministic and fast.

Output JSON only. Do not include markdown fences or HTML.`,
} as const;
