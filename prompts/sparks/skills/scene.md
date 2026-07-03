---
name: "Spark Scene"
description: "Create a safe file-based micro-interactive learning visualization."
whenToUse: "Use when the learner would understand better with an interactive visual demo instead of text alone."
---

You are building a Spark Scene artifact.

Return strict JSON with keys:

- title
- summary
- workerSummary
- version: 2
- learningObjective
- estimatedInteractionSeconds
- capabilities
- files
- controls
- checkpoints

Do not use markdown code fences.

Use this file map:

{
  "files": {
    "index.html": "<main>small semantic scene shell</main>",
    "styles.css": "scoped CSS for the scene",
    "script.js": "plain JavaScript using window.StudiScene"
  }
}

The renderer injects the document shell, CSP, and window.StudiScene runtime. Do not include remote scripts or a full app framework.

The renderer also injects a Studi scene theme. Build on it instead of inventing a separate app skin:

- Use a top-level `<main class="studi-scene">`.
- Use the injected CSS tokens: `--studi-scene-bg`, `--studi-scene-surface`, `--studi-scene-surface-soft`, `--studi-scene-ink`, `--studi-scene-muted`, `--studi-scene-border`, `--studi-scene-accent`, `--studi-scene-teal`, `--studi-scene-amber`, and `--studi-scene-lavender`.
- Body text, instructions, labels, values, and checkpoint prompts must be readable on the warm background. Prefer `--studi-scene-ink` for primary text and `--studi-scene-muted` for secondary text.
- Never use pale text, low-opacity white, or gray text on the warm scene background.
- Do not make the whole scene a dark UI. If a concept truly needs a dark plot/canvas, keep only the plot dark and put all instructions, controls, questions, and labels on the warm Studi surface with high contrast.
- Use calm 1px borders and soft surfaces. Avoid thick black cartoon borders, chunky offset shadows, and oversized pill containers.
- Prefer light graph/grid backgrounds with dark readable labels unless the concept needs a dark field.

Use window.StudiScene when useful:

- window.StudiScene.ready()
- window.StudiScene.resize(height)
- window.StudiScene.interaction(id, value)
- window.StudiScene.checkpoint(id, value, correct)
- window.StudiScene.error(message)

Speed + reliability constraints:

- Keep files compact (prefer under 7000 total chars).
- Keep JavaScript simple and short (prefer under 160 lines).
- Use simple DOM interactions (inputs, buttons, pointer drag) unless explicitly asked for more.
- Avoid heavy animations, large loops, and complex rendering code.

Safety constraints:

- No network requests.
- No external scripts.
- No popups, top-level navigation, or storage requirements.

Quality constraints:

- Focus tightly on the requested concept.
- Make the learner manipulate, predict, compare, or reveal something.
- Include exactly one learning objective.
- Include controls/checkpoints metadata that matches the scene controls.
- Include short in-UI instructions.
- Make it usable on mobile and desktop.
