 Architecture Deep Dive: Studi                                                                                                                                                                                                                       
                                                                                                                                                                                                                                                      
  The Big Picture                                                                                                                                                                                                                                     
                                                                                                                                                                                                                                                      
  User types message
    → sendMessage (mutation) — saves instantly, dedupes via requestId                                                                                                                                                                                 
      → ctx.scheduler.runAfter(0, generateAssistantReply)                                                                                                                                                                                             
        → studiAgent.continueThread → thread.streamText
          → agent decides to call create_spark tool
            → worker LLM (separate model) generates HTML
            → validates → auto-repairs once if invalid
            → artifact embedded in tool result
          → agent writes follow-up text
        → deltas persisted to Convex DB (line-chunked, 120ms throttle)
    → useUIMessages subscribes via WebSocket (not HTTP SSE)
      → MessageRenderer detects tool parts with toolName === "create_spark"
      → SparkSceneRenderer → sandboxed iframe (srcDoc, allow-scripts only)

  What's Working Well

  1. Mutation + scheduled action separation — sendMessage is a fast mutation that returns instantly. The LLM work runs asynchronously. This is the recommended Convex pattern and gives great UX (message appears immediately, agent response streams
  in).
  2. Request deduplication — lastRequestId on the thread record prevents double-sends on retry. Solid idempotency.
  3. Two-model architecture — The orchestrating agent (Claude Sonnet 4.6) decides what to create; a cheaper worker model (z-ai/glm-5) generates the HTML. Good cost/quality separation.
  4. Validate + repair loop — First draft → validate HTML → if errors, send errors back to worker → second attempt. Two-chance pattern catches most generation failures.
  5. Structured tool results — CreateSparkToolResult is a clean discriminated union (status: "success" | "failed") that both the LLM and the frontend can parse. The agent instructions explicitly handle both cases.
  6. Iframe sandboxing — srcDoc (inline, no external loads) + sandbox="allow-scripts" (no navigation, no storage, no same-origin). Combined with server-side validation that blocks external scripts and fetch(). Strong security posture.
  7. Streaming over WebSockets — Convex's saveStreamDeltas + syncStreams pattern is more robust than HTTP SSE: survives network interruptions, supports multiple simultaneous clients, no connection timeout issues.

  ---
  Key Issues & Recommendations

  1. Full HTML artifacts are sent back into the LLM context

  Problem: When create_spark returns, the entire SparkSceneArtifact (including the raw HTML, up to 16KB) is serialized as a tool result and fed back into the conversation context for the next step. This wastes tokens and bloats history.

  Fix: The AI SDK supports toModelOutput on tools — return a compact summary to the model while keeping the full artifact for the client:

  // In createTool, add:
  toModelOutput: (result) => {
    if (result.status === "success") {
      return `Spark scene "${result.artifact.title}" created successfully. ${result.workerSummary}`;
    }
    return `Spark generation failed: ${result.error}`;
  }

  This could save 10,000+ tokens per Spark generation in conversation context.

  2. JSON parsing from the worker is brittle

  Problem: parseSparkSceneDraftFromText uses regex to find ```json ``` blocks, then falls back to {...} extraction. Workers can format JSON in unexpected ways.

  Fix: Use AI SDK's generateObject instead of generateText + manual parsing:

  import { generateObject } from "ai";

  const result = await generateObject({
    model: openrouter.chat(sparkWorkerModel),
    schema: z.object({
      title: z.string(),
      summary: z.string(),
      workerSummary: z.string(),
      html: z.string(),
    }),
    prompt: promptLines.join("\n"),
    temperature: 0.2,
  });
  // result.object is typed + validated — no regex needed

  This eliminates the entire parseSparkSceneDraftFromText function and its failure modes.

  3. No rate limiting

  Problem: Any authenticated user can send unlimited messages and trigger unlimited Spark generations. Each Spark = 2 LLM calls (worker + possible repair). No cost controls.

  Fix: Convex has a first-party @convex-dev/rate-limiter component that integrates with @convex-dev/agent:

  import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";

  const rateLimiter = new RateLimiter(components.rateLimiter, {
    sendMessage: { kind: "fixed window", period: MINUTE, rate: 10, capacity: 15 },
    sparkGeneration: { kind: "token bucket", period: MINUTE, rate: 3, capacity: 5 },
  });

  Add a usageHandler to the agent for token tracking too.

  4. No context tuning

  Problem: Agent uses default context options — every historical message (including past tool results with HTML) gets sent to the model.

  Fix: Configure contextOptions on the agent:

  export const studiAgent = new Agent(components.agent, {
    // ...existing config...
    contextOptions: {
      excludeToolMessages: true,   // Don't send old tool call/result pairs
      recentMessages: 20,          // Last 20 messages, not all
    },
  });

  This keeps context focused on the recent conversation and avoids sending old Spark HTML back into every new request.

  5. Tool Zod schema lacks parameter descriptions

  Problem: The createSparkInputSchema fields have no .describe() calls. The model gets the field names but no guidance on what to put in them.

  Fix:
  const createSparkInputSchema = z.object({
    sparkId: z.literal("scene").describe("Always 'scene' for interactive HTML visualizations"),
    context: z.string().min(1).describe("Brief description of the learning concept to visualize, e.g. 'Show how binary search narrows the search range'"),
    title: z.string().optional().describe("Display title for the scene; auto-generated if omitted"),
    summary: z.string().optional().describe("One-line description shown below the title"),
  });

  Better descriptions = better tool call quality from the model.

  6. Spark artifacts aren't first-class entities

  Problem: Spark artifacts are embedded inside tool result message parts. There's no way to query, version, or manage them independently. You can't list "all Sparks a user has generated" or let them revisit/edit one.

  Fix (future): Add an artifacts table:
  artifacts: defineTable({
    userId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    sparkType: v.string(),
    status: v.union(v.literal("success"), v.literal("failed")),
    title: v.string(),
    html: v.string(),
    generationMs: v.number(),
    createdAt: v.number(),
  }).index("by_userId_and_threadId", ["userId", "threadId"])

  The create_spark tool handler would write to this table via ctx.runMutation(), and the frontend would query it to render.

  7. No timeout on worker LLM calls

  Problem: generateText in the Spark worker has no timeout. If the worker model hangs, the entire generateAssistantReply action stalls (Convex has a 10-minute action timeout, but that's a long time to wait).

  Fix: Add abortSignal with a timeout:
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000); // 30s max

  const result = await generateText({
    model: openrouter.chat(sparkWorkerModel),
    prompt: promptLines.join("\n"),
    temperature: 0.2,
    abortSignal: controller.signal,
  });
  clearTimeout(timeoutId);

  8. editable mode is declared but never used

  The SparkMode type has "readonly" | "editable" but normalizeSparkSceneDraft always sets mode: "readonly". This is fine for now but is a natural extension point — letting users tweak generated HTML and re-validate.

  ---
  Architectural Patterns Worth Adopting

  ┌──────────────────────────────────────────┬────────────────────┬──────────────────────────────────────────────────┐
  │                 Pattern                  │       Source       │                 Value for Studi                  │
  ├──────────────────────────────────────────┼────────────────────┼──────────────────────────────────────────────────┤
  │ generateObject for structured LLM output │ AI SDK             │ Eliminates brittle JSON parsing in Spark worker  │
  ├──────────────────────────────────────────┼────────────────────┼──────────────────────────────────────────────────┤
  │ toModelOutput on tools                   │ AI SDK             │ Prevents 16KB HTML from re-entering context      │
  ├──────────────────────────────────────────┼────────────────────┼──────────────────────────────────────────────────┤
  │ contextOptions.excludeToolMessages       │ Convex Agent       │ Reduces token waste from old Spark artifacts     │
  ├──────────────────────────────────────────┼────────────────────┼──────────────────────────────────────────────────┤
  │ @convex-dev/rate-limiter                 │ Convex ecosystem   │ Cost control and abuse prevention                │
  ├──────────────────────────────────────────┼────────────────────┼──────────────────────────────────────────────────┤
  │ usageHandler on Agent                    │ Convex Agent       │ Token tracking per user/session                  │
  ├──────────────────────────────────────────┼────────────────────┼──────────────────────────────────────────────────┤
  │ prepareStep for dynamic model selection  │ AI SDK             │ Use cheaper model for follow-up text after Spark │
  ├──────────────────────────────────────────┼────────────────────┼──────────────────────────────────────────────────┤
  │ Durable Workflows                        │ Convex             │ Retry semantics for multi-step Spark generation  │
  ├──────────────────────────────────────────┼────────────────────┼──────────────────────────────────────────────────┤
  │ useSmoothText hook                       │ Convex Agent/React │ Smoother streaming text rendering                │
  └──────────────────────────────────────────┴────────────────────┴──────────────────────────────────────────────────┘

  ---
  Adding New Spark Types

  The current architecture is well-set-up for this. The path:

  1. Add new id to sparkTypes in lib/sparks/contracts.ts (e.g. "chart", "quiz")
  2. Create skill file in lib/sparks/skills/ with name, description, whenToUse, instructions
  3. Register in lib/sparks/catalog.ts — automatically injected into agent system prompt
  4. Handle in convex/sparks/tools.ts (buildChartSpark, etc.) — or generalize buildSceneSpark since all types produce HTML
  5. Add renderer to sparkSceneRegistry in SparkSceneRenderer.tsx

  The catalog-driven design means the agent learns about new Spark types automatically through sparkCatalogPromptBlock() without changing agent instructions.

  ---
  Summary

  The core architecture is solid — the mutation+action split, streaming over WebSockets, two-model Spark generation, and iframe sandboxing are all strong patterns. The highest-impact improvements are:

  1. toModelOutput to stop sending HTML back into context (token savings)
  2. generateObject to replace brittle JSON parsing (reliability)
  3. contextOptions tuning to keep context lean (cost + quality)
  4. Rate limiting before going to production (cost + safety)
  5. Zod .describe() on tool params (tool call quality)

  Want me to implement any of these?
