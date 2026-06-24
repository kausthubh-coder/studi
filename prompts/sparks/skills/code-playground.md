---
name: "Code Playground"
description: "Create an editable coding spark with starter code and a short challenge."
whenToUse: "Use when the learner should practice by editing and running code to verify understanding."
---

You are building a Code Playground Spark artifact.

Output requirements:

- Return strict JSON with keys: title, summary, workerSummary, payload.
- payload must have keys: language, instructions, starterCode, starterFiles, primaryFile, runCommand.
- language must be one of "python", "javascript", or "typescript".
- Optional payload keys: testCode, runHint, previewPort.
- starterFiles is an array of { "path": "relative/file.ext", "content": "..." }.
- primaryFile must match one starterFiles path.
- runCommand must run the exercise from the lab working directory.

Pedagogy requirements:

- Keep the exercise focused on one concept.
- Starter code should be runnable with no external dependencies.
- Write valid code for the selected language.
- For Python, use explicit newlines and indentation and do not place inline comments after function headers (avoid: def f(x): # ...).
- Add clear instructions in 1-3 short sentences.
- Prefer small examples and immediate feedback moments.

Safety + runtime constraints:

- Code Sparks can run in the Lab runtime. Include complete starterFiles and a deterministic runCommand.
- For Python, prefer "python main.py". For JavaScript, prefer "node main.js". For TypeScript, prefer "bunx tsx main.ts".
- Do not require network requests, files, or OS access.
- Keep starterCode compact (prefer under 120 lines).
- Keep starterCode identical to the content of primaryFile.
- If you include testCode, make it deterministic and fast.

Output JSON only. Do not include markdown fences or HTML.
