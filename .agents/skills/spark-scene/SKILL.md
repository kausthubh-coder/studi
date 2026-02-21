---
name: spark-scene
description: Build a Spark Scene as one self-contained HTML file for inline educational micro-interactions.
---

# Spark Scene Skill

## When to use

Use this skill when the learner would benefit from an interactive visual artifact that text alone cannot explain well.

## Output contract

- Return one complete HTML file string.
- Include CSS and JavaScript inline.
- Keep it read-only from the host UI perspective.
- Do not depend on external scripts or assets.

## Quality checklist

1. Interaction clearly matches the learning objective.
2. UI is understandable on desktop and mobile sizes.
3. Labels and hints explain what to do.
4. HTML runs standalone in an iframe.
5. Avoid network requests and external dependencies.

## Validation checklist

1. HTML is non-empty and includes an `<html>` root.
2. Inline script syntax parses.
3. No `<script src=...>` tags.
4. File stays reasonably small for chat rendering.
