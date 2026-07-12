# Storybook

Studi uses Storybook 10 with the Next.js Vite framework. The preview loads the
same global CSS, KaTeX styles, syntax-highlighting theme, App Router behavior,
and font variables as the application.

## Run and verify

```bash
bun run storybook
bun run test:storybook
bun run build-storybook
bunx storybook doctor
```

Storybook runs at `http://127.0.0.1:6006`. The catalog currently contains 19
colocated component story files and 139 business-state stories. A unit invariant
fails whenever a meaningful visual component is added without a sibling story;
`components/ConvexClientProvider.tsx` is the only documented exclusion because
it is provider infrastructure rather than a visual component.

## Coverage

The stories exercise the product at three levels:

- Chat system: the full `StudiChat` shell, welcome and conversation layouts,
  composer, threads, messages, reasoning/tool activity, Spark creation,
  attachment presentation, billing locks, send/delete failures, desktop/mobile
  split panels, the background grid, and the complete icon gallery.
- Spark system: inline and expanded renderers, the shared panel, Scene v1/v2
  sandbox states, Desmos ready/loading/failure states, quiz and flash-card
  learning flows, and 16 Code Spark states covering hydration, challenge versus
  workspace disclosure, editing, runs/tests, limits, failures, archived
  languages, and mobile layout.
- Public/account surfaces: signed-in and signed-out landing states, FAQ and
  early-access interactions, all waitlist outcomes, and usage/billing/account
  states across onboarding, Intro, Pro, loading, unavailable, warnings, and
  mobile navigation.

Every interactive story uses a `play` test for its observable behavior. The MCP
`run-story-tests` tool is the canonical browser test path while iterating and for
the final full-catalog verification. The local Vitest Storybook project and
static build remain useful independent CI gates.

## Safe service fixtures

The preview registers Storybook module mocks for Clerk, Convex, Convex Agent,
and Monaco. Story parameters under `parameters.studi` select auth, query,
mutation, action, and message states without mounting a real provider. Defaults
throw on an unhandled Convex function name so a new integration cannot silently
fall through to a real backend.

Code Spark stories use a controlled textarea instead of Monaco's CDN/worker
loader. Interactive run fixtures use the `local_fake` or `unavailable`
providers; display-only persisted states may retain labels such as
`vercel_sandbox` so historical UI renders honestly while every runtime action
remains mocked. Desmos stories use a literal public placeholder key plus an
in-memory calculator. Scene fixtures are self-contained `srcDoc` documents.
Story tests do not contact Clerk, Convex, Desmos, Tally, Vercel Sandbox,
OpenRouter, or a billing service.

The accessibility addon runs with `test: "todo"`. Semantic issues found while
building the catalog are fixed and interaction-tested. Existing visual
color-contrast findings remain visible in the addon rather than changing the
product palette as part of Storybook setup.

## Storybook MCP

The `@storybook/addon-mcp` endpoint is available whenever Storybook is running:

```text
http://127.0.0.1:6006/mcp
```

Register it once with Codex:

```bash
codex mcp add studi-storybook --url http://127.0.0.1:6006/mcp
codex mcp get studi-storybook
```

Start Storybook before using the MCP tools. For UI work, query the component
documentation before assuming props, fetch the current story-writing
instructions, preview changed stories, and finish with the MCP
`run-story-tests` tool. The registration can be removed with
`codex mcp remove studi-storybook`.
