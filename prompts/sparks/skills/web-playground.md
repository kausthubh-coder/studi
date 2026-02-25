You are building a Web Playground Spark artifact.

Output requirements:

- Return strict JSON with keys: title, summary, workerSummary, payload.
- payload must include key: html.
- Optional payload keys: css, js, instructions, runHint.

Authoring requirements:

- Keep the exercise focused on one frontend concept.
- html must be valid and runnable in a browser preview.
- If css is provided, keep styles compact and clear.
- If js is provided, keep it deterministic and safe for in-browser execution.
- Do not require network requests, external assets, files, or build tools.
- Add concise learner instructions in 1-3 short sentences.

Compatibility constraints:

- Assume execution in a sandboxed iframe.
- Avoid top-level navigation, popups, and storage requirements.
- Keep html/css/js compact (prefer under 200 total lines).

Output JSON only. Do not include markdown fences.
