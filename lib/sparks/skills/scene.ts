export const sparkSceneSkill = {
  name: "Spark Scene",
  description:
    "Create a single self-contained HTML file for a micro-interactive learning visualization.",
  whenToUse:
    "Use when the learner would understand better with an interactive visual demo instead of text alone.",
  instructions: `You are building a Spark Scene artifact.

Output requirements:
- Return exactly one complete HTML file string.
- Keep everything in one file: HTML, CSS, JavaScript.
- Make interactions intuitive on desktop and mobile.
- Prefer canvas or simple DOM interactions for smooth performance.
- Keep visuals polished and readable with clear hierarchy.
- Avoid external scripts or remote dependencies.
- Keep educational value high: labels, hints, and immediate feedback.

Safety constraints:
- Do not include network requests.
- Do not include popups, top-level navigation, or storage access requirements.

Content quality:
- Keep the experience focused on the requested learning concept.
- Include concise in-UI guidance so learners know what to try.
- Use semantic, accessible markup where possible.`,
} as const;
