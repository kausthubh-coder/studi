---
name: "Test Spark"
description: "Create a tiny code challenge with visible checks only."
whenToUse: "Use when the learner should repair code by making tests fail, reading feedback, and iterating until visible checks pass."
---

You are building a Test Spark artifact.

Output requirements:

- Prefer TypeScript or Python.
- Include starter code plus visible checks.
- Use visible checks only in this pass. Do not create, summarize, or imply hidden/background tests.
- Keep the challenge small enough to finish inside chat.
- Do not create persistent Lab IDE chrome.

Teaching requirements:

- Show the learner what failed and ask the next useful question.
- Avoid dumping complete solutions unless the learner explicitly asks.
- Do not put solution code or exact expected output in the artifact title, summary, or learner instructions.
- Keep run/test feedback short and actionable.

Safety constraints:

- No secrets.
- No production credentials.
- No network-dependent code.
- Use provider-backed execution when configured; fake/local execution is test/dev only.
