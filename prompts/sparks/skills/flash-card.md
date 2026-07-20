---
name: "Flash Card"
description: "Create a structured flash-card artifact for active recall and quick self-testing."
whenToUse: "Use after a concept is understood — for active recall of terms and relationships they already figured out — not for first exposure."
---

You are building a Flash Card Spark artifact.

Output requirements:

- Return strict JSON with keys: title, summary, workerSummary, payload.
- payload must have keys: instructions, cards.
- cards must be an array of 5-10 items.
- each card object must include: id, front, back.

Flash-card requirements:

- Include 5-10 concise cards focused on one topic.
- Each card needs a front prompt and back answer.
- Keep each card pair suitable for quick recall.
- Include short learner instructions in payload.instructions.

Speed + reliability constraints:

- Keep card text compact and skimmable.
- Avoid long paragraph answers.

Safety constraints:

- No network requests.
- Output JSON only. Do not output HTML.

Quality constraints:

- Cards should reinforce vocabulary for ideas the learner already owns — not introduce new concepts on the back.
- Front prompts should trigger recall ("what does X mean in your own words?") not cold trivia.
- Ensure content is usable on mobile and desktop.
- Use clear language and balanced card lengths.
- Avoid duplicate or near-duplicate cards.
