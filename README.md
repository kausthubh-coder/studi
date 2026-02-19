# Studi

Studi is an **agentic tutor** built with Next.js + Convex.

The goal is to help learners master hard topics through active practice, personalized feedback, and artifact-based proof of skill (projects, labs, threads, code, and whiteboard work).

## Why Studi

Traditional learning paths are often passive and slow. Studi bets that AI tutors plus interactive environments can deliver:

- Intuition-first teaching
- Active learning loops (do, get feedback, improve)
- Personalized pacing and support
- Real, shareable outputs that demonstrate skill

## Product Direction (v1)

Core experience:

- Topic-based chat threads
- Two behaviors: `Learn` and `Review`
- Agent controls via a plus menu
- Milestone planning, checkpoints, and targeted remediation

Tools orchestrated inside chat:

- Quizzes
- Code snippets and code tests
- Interactive components (HTML/CSS/JS)
- Graphing (Desmos-style)
- Shared whiteboard interactions
- Linked labs for larger projects

## Primary Use Cases

- Learn a topic from scratch (for example: dynamic programming, calculus, React basics)
- Review for exams/interviews via diagnostics and focus-area drills
- Build small labs/projects tied to concepts

## Repo Structure

- `app/`, `components/`, `convex/`: active Studi app code
- `examples/shru/`: older Studi version (reference)
- `examples/agent-tldraw/`: tldraw agent whiteboard example
- `examples/chat-tldraw/`: tldraw chat + whiteboard example

## Tech Stack

- [Next.js](https://nextjs.org/) + React
- [Convex](https://convex.dev/) for backend/database/functions
- [Clerk](https://clerk.com/) for authentication
- TypeScript + ESLint

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Start local development (frontend + Convex):

```bash
npm run dev
```

3. Open the app:

```text
http://localhost:3000
```

## Current Scope Notes

In scope right now:

- Learn and Review thread flows
- Milestones, diagnostics, and targeted practice
- Quiz/code-test/whiteboard/lab orchestration

Out of scope for now:

- Employer hiring dashboards
- Full credential/portfolio system
- Complex multi-user collaboration

## Vision

Studi is building toward a future where learning is interactive, adaptive, and measurable by demonstrated ability, not just credentials.
