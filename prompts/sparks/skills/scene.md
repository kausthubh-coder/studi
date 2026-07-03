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
