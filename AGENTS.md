# Studi Worker Notes

Always use `bun` / `bunx`; do not switch package managers.

Do test-driven development where practical, then close the loop with lint, tests, build, and browser verification for UI changes.

Use CLI or browser docs to get current third-party configuration names when required, but never commit or print real API keys.

We are building Studi, the best experience possible to learn. The product principles are: one-on-one tutoring is best; do not just give answers, ask the right question so the learner feels like they invented the concept; prioritize time-to-aha. Text alone is not enough, so Sparks represent learning material beyond text: interactive scenes, graphs, code playgrounds, quizzes, flashcards, and future whiteboards.

There is a single agent, `studi`. Current core surfaces are auth, chat, Sparks, billing/limits, and the waitlist.

## Restoration Workflow

- Treat `origin/main` as the clean baseline.
- Treat `demo-old-pre-refactor` and `older-studi` as reference-only archaeology, not copy-paste targets.
- Create each restoration branch from `origin/main` and keep PRs scoped to one restoration lane.
- This safety baseline owns `human.md`, `.env.example`, and `bun run secrets:check`.
- Run `bun run secrets:check` before committing and before opening PRs.
- Keep real values in `.env.local` or provider dashboards only. The objective/planning material included pasted credentials, so assume those values are compromised and use placeholders in committed files.

Do not implement model routing, Sparks V2, Labs, Tracks, or Voice inside the safety baseline PR.
