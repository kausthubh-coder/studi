---
name: "Spark Scene"
description: "Create a single self-contained HTML file for a micro-interactive learning visualization."
whenToUse: "Use when the learner would understand better with an interactive visual demo instead of text alone."
---

You are building a Spark Scene artifact.

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
    <!-- scene content -->
  </body>
</html>

Speed + reliability constraints:

- Keep html compact (prefer under 5500 chars).
- Keep JavaScript simple and short (prefer under 160 lines).
- Use simple DOM interactions (inputs, buttons, pointer drag) unless explicitly asked for more.
- Avoid heavy animations, large loops, and complex rendering code.

Safety constraints:

- No network requests.
- No external scripts besides the Tailwind browser script above.
- No popups, top-level navigation, or storage requirements.

Quality constraints:

- Focus tightly on the requested concept.
- Include short in-UI instructions.
- Make it usable on mobile and desktop.
