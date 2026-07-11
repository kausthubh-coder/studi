# Product

## Register

product

## Users

Learners (students and self-taught adults) in a one-on-one tutoring session with the Studi agent. They are mid-task — reasoning through a concept in chat — when a Spark (interactive widget) appears inline. Context: desktop and mobile browsers, often long sessions, mixed ambient light.

## Product Purpose

Studi is an agentic learning OS: a single tutor agent that teaches by asking the right questions rather than giving answers, and that renders non-text understanding as Sparks (interactive scenes, graphs, code playgrounds, quizzes, flashcards). Success is measured in time-to-aha-moment: the learner should feel they invented the concept, not memorized it. Core surfaces: auth, chat, sparks, billing, waitlist.

## Brand Personality

Warm, confident, playful-serious. A crafted paper notebook, not a SaaS dashboard: warm paper backgrounds, thick ink borders, hard offset shadows in vivid accent colors (coral, teal, amber, lavender, rose), DM Serif display + Plus Jakarta Sans UI + Source Serif body. Bold but never noisy — every accent means something.

## Anti-references

- Generic SaaS chat skins (gray bubbles, blue links, cool neutrals).
- IDE cosplay: the Code Spark is a learning exercise, not VS Code. No dense toolbars, no panel soup.
- Timid design: washed-out tints, 10px type, chip/pill clutter standing in for hierarchy.
- Dark-mode-by-default developer aesthetic; dark surfaces are reserved for the code editor and terminal, where they mean "machine".

## Design Principles

1. Time-to-aha: the next action a learner should take must be visually unmistakable.
2. The tool disappears into the task: chrome serves the exercise, never competes with it.
3. One vocabulary: every button, badge, and state reuses the app's ink-border/offset-shadow system.
4. Honest states: running, saved, failed, cooling-down are always visible, never color-only.
5. Machine surfaces are dark, human surfaces are paper: editor and console are the only dark regions.

## Accessibility & Inclusion

- WCAG AA contrast for all text (≥4.5:1 body, ≥3:1 large).
- Never color alone: every status pairs a dot/label with words.
- Live regions (`role="status"`, `aria-live`) for run states; `role="alert"` for failures.
- 44px minimum touch targets; layouts stack cleanly at narrow container widths.
- Reduced-motion alternatives for all animation.
