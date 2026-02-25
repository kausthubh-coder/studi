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

- Ensure content is usable on mobile and desktop.
- Use clear language and balanced card lengths.
- Avoid duplicate or near-duplicate cards.
