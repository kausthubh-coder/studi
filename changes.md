# Studi Frontend Overhaul — Changes Log

## What Was Done

### Design System (`app/globals.css`) — Complete rewrite ×2
- New warm color palette: `--bg: #faf6f0`, `--accent: #c2714a` (terracotta), `--accent2: #5a8a56` (sage green)
- New CSS class system replacing inline JS style props:
  - **`.composer-card`** — Perplexity-style input card with `focus-within` glow + box-shadow
  - **`.composer-bottom-row`** — Bottom row with file upload (left) + send button (right)
  - **`.composer-icon-btn`** / **`.composer-send-btn`** — Circular action buttons
  - **`.chip`** — Small horizontal pill suggestion buttons
  - **`.thinking-card`** / **`.thinking-toggle`** / **`.thinking-body`** — New collapsible agent activity panel
  - **`.reasoning-block`** — Italic, left-bordered block displaying raw reasoning text
  - **`.thinking-step`** / **`.thinking-step-dot`** — Timeline step with `data-status` colors
  - **`.spark-scene`** / **`.spark-scene-bar`** / **`.spark-scene-expand`** — Warm-themed spark containers (replaces dark blue)
  - **`.spark-overlay`** / **`.spark-overlay-inner`** — Full-screen portal modal for expanded spark (z-index: 9000, above paper grain)
  - **`.spark-building-card`** — Orbiting conic-gradient border animation while spark generates
  - **`.spark-building-shimmer`** / **`.bounce-dots`** — Shimmer lines + bouncing dots
  - **`.spark-fail`** / **`.spark-fail-badge`** — Error card for failed sparks
  - **`.sidebar-thread-btn`** / **`.sidebar-new-btn`** — CSS-only hover states with `data-active` attribute
  - Animations: `orbit`, `bounce-dot`, `shimmer`, `pulse-glow`, `activity-pulse`, `reasoning-flow`
  - Welcome enter animations: `.welcome-enter`, `.welcome-enter-delay`, `.welcome-enter-delay-2`

### Lazy Thread Creation (`convex/chatActions.ts`)
- Added `sendFirstMessage` action: atomically creates a thread + sends the first message
- `StudiChat.tsx` now starts on welcome view (`selectedThreadId = null`)
- `handleNewThread` just sets `selectedThreadId(null)` — no backend call
- On first send, calls `sendFirstMessageAction` → gets `threadId` → navigates to thread

### `components/studi-chat/Composer.tsx` — Rewritten
- Now always renders a **`.composer-card`** (same pattern for both variants)
- Textarea on top (3 rows for welcome, 1 row for chat)
- Bottom row: file upload icon button (left) + send button (right)
- Chat variant wrapped in `border-t bg-bg` footer bar with disclaimer text

### `components/studi-chat/WelcomeView.tsx` — Rewritten
- **Removed** the 4 big suggestion cards
- Greeting: `"Hey, {firstName}"` in Fraunces italic + accent color
- Composer embedded directly (welcome variant = big textarea)
- Small `.chip` pill buttons below (emoji + label) — horizontal, centered
- Staggered entrance animations: `.welcome-enter`, `.welcome-enter-delay`, `.welcome-enter-delay-2`

### `components/studi-chat/MessageRenderer.tsx` — Rewritten
- **`SparkBuildingCard`**: Now uses `.spark-building-card` (orbiting border), `.bounce-dots` (3 animated dots), `.spark-building-shimmer` (shimmer lines)
- **`SparkFailureCard`**: Now uses `.spark-fail` + `.spark-fail-badge` (warm red)
- **`AssistantActivityPanel`** → renamed to use **`.thinking-card`** pattern:
  - `.thinking-toggle` with `.thinking-toggle-dot` (pulsing when streaming), `.thinking-toggle-label`, `.thinking-toggle-chevron`
  - **`.reasoning-block`** — Displays full raw reasoning text inline (italic, left border)
  - `.thinking-body[data-state]` — Smooth collapse animation
  - `.thinking-step[data-status]` — Timeline dots colored by status (active/complete/error)
- `deriveAssistantActivity` now returns `reasoningText` field for display

### `components/sparks/scenes/HtmlCssJsSandboxScene.tsx` — Rewritten
- Uses `.spark-scene` + `.spark-scene-bar` + `.spark-scene-expand` (warm theme)
- Expand button opens **portal modal** via `createPortal` → `.spark-overlay` (z-9000) → `.spark-overlay-inner`
- Modal closes on Escape key or clicking outside
- Scroll locked while modal is open
- iframe background: `#faf6f0` (warm cream, not dark)

### `components/sparks/scenes/DesmosGraphScene.tsx` — Rewritten
- Replaced dark blue gradient styling with **warm `.spark-scene` wrapper**
- Error states use `.spark-fail` card (warm red)
- Matches the same visual language as HTML spark scenes

### `components/sparks/SparkSceneRenderer.tsx` — Updated
- Same spark header (badge + title + summary)
- Dispatches to updated warm-themed scene components

---

## Status

| Task | Status |
|---|---|
| `globals.css` complete design system | ✅ Done |
| Lazy thread creation backend | ✅ Done |
| `Composer.tsx` composer-card pattern | ✅ Done |
| `WelcomeView.tsx` Perplexity-style | ✅ Done |
| `MessageRenderer.tsx` thinking-card + reasoning | ✅ Done |
| `HtmlCssJsSandboxScene.tsx` warm theme + portal | ✅ Done |
| `DesmosGraphScene.tsx` warm theme | ✅ Done |
| `SparkSceneRenderer.tsx` updated | ✅ Done |
| Lint + TypeScript clean | ✅ No errors |

---

## What Still Needs To Be Done / Tested

### High Priority — Test in Browser
1. **Welcome page** — Open the app, check the big composer card renders, chip pills show, greeting appears, staggered animations work
2. **Spark expand modal** — Create an HTML spark, click Expand, verify portal opens (large width + height), Escape closes it, clicking backdrop closes it
3. **Spark building animation** — Send a prompt that triggers a spark, watch for the orbiting-border card with bounce dots + shimmer lines
4. **Reasoning/thinking card** — Send a message with a model that produces reasoning (extended thinking), verify the `.reasoning-block` shows the raw thought text inside the collapsible panel
5. **First message flow** — Click "New thread", do NOT auto-navigate anywhere, type in the welcome composer, send — verify a thread is created and you're taken to it
6. **Chat composer** — In a thread, verify the bottom composer card looks correct (not the old textarea-in-a-row style)

### Medium Priority — Polish
7. **Sidebar "New thread" button** — Verify `data-active` highlights it when on welcome view, and becomes inactive when in a thread
8. **Desmos scene** — If you have a `NEXT_PUBLIC_DESMOS_API_KEY`, verify the warm-themed Desmos card loads correctly (no more dark blue header)
9. **Mobile / narrow viewport** — Check chip pills wrap nicely, composer card doesn't overflow
10. **Scroll behavior** — Verify auto-scroll to bottom when new messages arrive in a thread

### Low Priority / Future Work
11. **Thread sidebar sticky** — Already `h-screen overflow-hidden`, should be fine; verify on long thread lists
12. **Attachment previews in composer** — Paste or upload an image on the welcome page, verify preview appears inside the card above the textarea
13. **Shimmer/skeleton when thread loading** — Currently just shows empty; could add a loading skeleton
14. **Dark mode** — Currently forced light. If dark mode is ever needed, CSS variables would need a `prefers-color-scheme: dark` block
