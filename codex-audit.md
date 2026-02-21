
• Findings (ordered by severity)

  1. High: Spark safety policy is not actually enforced end-to-end

  - Spec says “no network requests” in lib/sparks/skills/scene.ts:18, but validator only warns on fetch() and blocks only external <script src>.
  - convex/sparks/tools.ts:123 and convex/sparks/tools.ts:127 miss other network vectors (img/src, iframe/src, link/href, beacon/websocket, etc.).
  - Successful Spark responses still pass with warnings (convex/sparks/tools.ts:223), and warnings are not surfaced meaningfully in UI (components/studi-chat/MessageRenderer.tsx:245).
  - The renderer executes Spark JS in an iframe (components/sparks/scenes/HtmlCssJsSandboxScene.tsx:94), so unsafe network behavior can still run client-side.

  2. High: Spark generation has no hard cost/latency guardrails

  - One Spark call can do up to 2 LLM worker calls (convex/sparks/tools.ts:214, convex/sparks/tools.ts:232 via generateText at convex/sparks/tools.ts:200).
  - Agent prompt asks to call once, but this is instruction-only, not enforced (convex/agent.ts:38), and tool execution budget is broad (convex/agent.ts:28).
  - This creates cost unpredictability under prompt drift.

  3. Medium-High: Sparks are transient artifacts, not first-class data

  - No Spark table/state in schema (convex/schema.ts:4).
  - Rendering relies on parsing tool output from message parts at read time (components/studi-chat/MessageRenderer.tsx:401, components/studi-chat/MessageRenderer.tsx:586).
  - This hurts auditability, analytics, moderation, migration/versioning, and reuse.

  4. Medium: Spark output parsing is brittle

  - Worker output parsing depends on text extraction heuristics (convex/sparks/tools.ts:51, convex/sparks/tools.ts:59).
  - Client-side result extraction supports multiple ad-hoc envelopes (components/studi-chat/MessageRenderer.tsx:401) and has permissive fallback (components/studi-chat/MessageRenderer.tsx:424).
  - This is fragile against provider/output-shape changes.

  5. Medium: Attachment path lacks hard limits

  - Upload URL issuance is open to any authenticated user (convex/chat.ts:151), and save accepts client-provided mime/size without server limits (convex/chat.ts:164).
  - Message send accepts arbitrary attachment arrays (convex/chat.ts:200), resolved one-by-one (convex/chat.ts:417).
  - This is a scalability and abuse risk (storage, latency, model context bloat).

  6. Low-Medium: Shared Spark contract spans client/server without boundary isolation

  - Server tool imports from UI-shared module (convex/sparks/tools.ts:7), and UI imports same contract (components/sparks/SparkSceneRenderer.tsx:8).
  - Works now, but creates coupling risk as Spark complexity grows.

  7. Low: Messaging API surface has drift

  - chatActions.sendMessage exists (convex/chatActions.ts:41), but UI uses api.chat.sendMessage directly (components/StudiChat.tsx:52, components/StudiChat.tsx:198).
  - Unused/duplicate paths increase maintenance risk.

  ———

  Validation run

  - bun run lint: passed.
  - bun run build: failed in this environment due Google Fonts fetch in app/layout.tsx:2 (network-restricted build context).

  ———

  Recommended priority

  1. Enforce Spark safety at validation time (reject all external resource URLs + network APIs, not warnings).
  2. Add hard Spark budgets (max Spark calls per assistant turn/thread + per-user rate/cost limits).
  3. Persist Spark artifacts as first-class Convex records (thread/message linkage, status, warnings, version).
  4. Replace heuristic parsing with strict schema output and contract tests for Spark pipeline.
