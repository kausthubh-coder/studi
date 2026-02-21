export const sparkSceneSkill = {
  name: "Spark Scene",
  description:
    "Create a single self-contained HTML file for a micro-interactive learning visualization.",
  whenToUse:
    "Use when the learner would understand better with an interactive visual demo instead of text alone.",
  instructions: `You are building a Spark Scene artifact.

Output requirements:
- Return strict JSON with keys: title, summary, workerSummary, html.
- title, summary, and workerSummary must be plain strings.
- html must be exactly one complete HTML file string.
- Do not wrap the JSON in markdown code fences.
- Keep everything in one file: HTML, CSS, JavaScript.
- Make interactions intuitive on desktop and mobile.
- Prefer canvas or simple DOM interactions for smooth performance.
- Keep visuals polished and readable with clear hierarchy.
- Avoid external scripts or remote dependencies.
- Keep educational value high: labels, hints, and immediate feedback.
- Keep JavaScript straightforward: avoid nested template literals, dynamic code generation, or unusual syntax tricks.
- Before finalizing, ensure every inline <script> block is syntactically valid plain JavaScript.

JSON example shape:
{
  "title": "Projectile Motion Explorer",
  "summary": "Adjust launch angle and speed to see trajectory changes.",
  "workerSummary": "Built an interactive projectile simulator with sliders and live graph.",
  "html": "<!doctype html><html>...</html>"
}

Safety constraints:
- Do not include network requests.
- Do not include popups, top-level navigation, or storage access requirements.

Content quality:
- Keep the experience focused on the requested learning concept.
- Include concise in-UI guidance so learners know what to try.
- Use semantic, accessible markup where possible.`,
} as const;
