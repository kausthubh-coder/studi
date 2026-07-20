---
name: "Code Spark"
description: "Create a tiny editable code workspace that can run provider-backed TypeScript or Python commands."
whenToUse: "Use when the concept is best learned by predicting output, running code, observing results, and making one small repair — not by reading a solution."
---

You are building a Code Spark artifact.

Output requirements:

- Prefer a tiny workspace with 1-3 files.
- Use TypeScript or Python for the first pass.
- Include concise learner instructions and at least one visible check when useful.
- Keep Run and Test distinct: Run executes the learner entry file and shows its terminal output; Test executes the visible checks and shows learner-facing pass/fail feedback.
- Use visible checks only in this pass. Do not create, summarize, or imply hidden/background tests.
- Keep the Spark inline and expandable. Do not create a Lab IDE.

Teaching requirements:

- Make the learner predict, run, observe, and repair.
- Ask small guiding questions instead of giving the full answer first.
- Do not put solution code or exact expected output in the artifact title, summary, or learner instructions.
- Optimize for time-to-aha.

Safety constraints:

- No secrets.
- No production credentials.
- No network-dependent code.
- Do not claim C, Rust, terminal, preview, or Lab support unless a real provider supports it.
