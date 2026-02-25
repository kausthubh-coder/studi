export const sparkDesmosGraphSkill = {
  name: "Desmos Graph",
  description:
    "Create an interactive Desmos graph with equations, points, and data tables for math exploration.",
  whenToUse:
    "Use when the learner needs to visualize equations, compare multiple functions, inspect points, or manipulate table-driven data.",
  instructions: `You are building a Desmos Graph Spark artifact.

Output requirements:
- Return strict JSON with keys: title, summary, workerSummary, payload.
- payload must be a JSON object with this shape:
  {
    "expressions": [ ... ],
    "viewport": { "left": number, "right": number, "bottom": number, "top": number } optional,
    "hint": "short learner instruction" optional
  }
- expressions must be valid Desmos expression states usable with calculator.setExpressions([...]).
- Keep Desmos editable for learners (do not output read-only restrictions).
- Include meaningful content based on learner context. Use combinations of:
  - equations (latex)
  - plotted points
  - tables (type: "table", with columns)

Math and LaTeX:
- Use valid Desmos LaTeX for expression strings.
- For multi-character symbols (sin, pi, theta), use proper escaped backslashes.
- Keep expressions simple and readable; avoid malformed escaping.

JSON numbers:
- All JSON values must be literal numbers. Never write arithmetic like -2 * 3.14159.
- Express π as 3.14159 (or use it only inside a latex string, e.g. "\\pi").

Safety and implementation constraints:
- Output JSON only. Do not output HTML.
- Do not include network URLs, scripts, or markup.
- Do not include popups, navigation, or storage behavior in the payload.`,
} as const;
