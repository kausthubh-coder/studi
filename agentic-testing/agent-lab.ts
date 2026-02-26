import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import {
  getStudiAgentName,
  isModelProfile,
  type ModelProfile,
} from "../lib/model-config";
import {
  isCreateSparkToolResult,
  isSparkArtifact,
  type CreateSparkToolResult,
  type SparkArtifact,
} from "../lib/sparks/contracts";

type Command = "run" | "suite";

type ParsedArgs = {
  command: Command;
  flags: Map<string, string[]>;
};

type PlaygroundMessage = {
  _id: string;
  _creationTime: number;
  order?: number;
  stepOrder?: number;
  message?: {
    role?: string;
    content?: unknown;
  };
  text?: string;
  error?: string;
  model?: string;
  provider?: string;
  status?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

type TimelineEvent = {
  kind:
    | "user"
    | "assistant_text"
    | "reasoning"
    | "tool_call"
    | "tool_result"
    | "error";
  at: number;
  relativeMs: number;
  order?: number;
  stepOrder?: number;
  messageId: string;
  detail: string;
  toolCallId?: string;
  toolName?: string;
  status?: "success" | "error";
};

type ToolRun = {
  toolCallId: string;
  toolName: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  durationEstimated?: boolean;
  status: "pending" | "success" | "error";
  error?: string;
  outputStatus?: string;
  outputSummary?: string;
  errorCategory?: string;
  retriable?: boolean;
  sparkStatus?: string;
};

type SceneFileExport = {
  toolCallId: string;
  sparkType: string;
  filePath: string;
  title: string;
  summary?: string;
};

type SparkArtifactSummary = {
  toolCallId: string;
  kind: string;
  sparkType: string;
  title: string;
  summary?: string;
};

type RunConfig = {
  userId: string;
  prompt: string;
  agentName: string;
  threadId?: string;
  newThread: boolean;
  title: string;
  pollMs: number;
  includeContext: boolean;
  verbose: boolean;
  modelLabel?: string;
  livePrint: boolean;
  debugRaw: boolean;
  saveSceneHtml: boolean;
  sceneOutDir?: string;
  expectTools: string[];
  expectPlanTools: string[];
  failOnToolError: boolean;
  requirePlan: boolean;
  expectPlanPhase?: "discovery" | "draft_review" | "active" | "completed";
  minPlanProgress?: number;
  verifyTelemetry: boolean;
  verifyPosthog: boolean;
  posthogWaitMs: number;
};

type TelemetrySummary = {
  usage: {
    calls: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
  };
  telemetry: {
    events: number;
    failures: number;
    sparkFailures: number;
    labToolFailures: number;
    planToolFailures: number;
    runtimeFailures: number;
    lastFailureAt?: number;
  };
};

type PosthogValidation = {
  attempted: boolean;
  ok: boolean;
  host?: string;
  projectId?: number;
  fromIso?: string;
  toIso?: string;
  eventCounts: Record<string, number>;
  totalMatched: number;
  missingExpectedEvents: string[];
  note?: string;
  query?: string;
};

type PlanSnapshot = {
  exists: boolean;
  phase?: "discovery" | "draft_review" | "active" | "completed";
  progressPercent?: number;
  totalItems?: number;
  completedItems?: number;
  hasDraft?: boolean;
  title?: string;
};

type RunResult = {
  runId: string;
  command: string;
  userId: string;
  threadId: string;
  agentName: string;
  prompt: string;
  promptHash: string;
  modelLabel?: string;
  startedAt: number;
  endedAt: number;
  totalDurationMs: number;
  firstAssistantEventMs?: number;
  actionError?: string;
  actionResultText?: string;
  actionResultTextHash?: string;
  messageCount: number;
  newMessageCount: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  tools: ToolRun[];
  timeline: TimelineEvent[];
  spark: {
    calls: number;
    failures: number;
    totalDurationMs: number;
  };
  lab: {
    calls: number;
    failures: number;
    createLabCalls: number;
    archiveLabCalls: number;
    runCalls: number;
    globCalls: number;
    hadActivation: boolean;
  };
  plan: {
    calls: number;
    failures: number;
    startPlanModeCalls: number;
    getPlanContextCalls: number;
    generatePlanDraftCalls: number;
    acceptPlanDraftCalls: number;
    requestPlanChangesCalls: number;
    setPlanItemStatusCalls: number;
    finalSnapshot: PlanSnapshot;
  };
  assertionFailures: string[];
  sparkArtifacts: SparkArtifactSummary[];
  sceneFiles: SceneFileExport[];
  telemetrySummary?: TelemetrySummary;
  posthog?: PosthogValidation;
  rawMessages?: PlaygroundMessage[];
  context?: unknown;
};

type SuiteCase = {
  name: string;
  prompt: string;
  userId?: string;
  agentName?: string;
  threadId?: string;
  newThread?: boolean;
  title?: string;
  repeat?: number;
  modelLabel?: string;
  reusePreviousThread?: boolean;
  expectTools?: string[];
  expectPlanTools?: string[];
  failOnToolError?: boolean;
  requirePlan?: boolean;
  expectPlanPhase?: "discovery" | "draft_review" | "active" | "completed";
  minPlanProgress?: number;
};

type SuiteConfig = {
  name?: string;
  defaults?: {
    userId?: string;
    agentName?: string;
    newThread?: boolean;
    title?: string;
    pollMs?: number;
    includeContext?: boolean;
    expectTools?: string[];
    expectPlanTools?: string[];
    failOnToolError?: boolean;
    requirePlan?: boolean;
    expectPlanPhase?: "discovery" | "draft_review" | "active" | "completed";
    minPlanProgress?: number;
  };
  cases: SuiteCase[];
};

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] as Command | undefined;
  if (command !== "run" && command !== "suite") {
    printUsageAndExit(
      "Missing command. Use 'run' for one prompt or 'suite' for batch execution.",
    );
  }

  const flags = new Map<string, string[]>();
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    const hasValue = typeof next === "string" && !next.startsWith("--");
    const value = hasValue ? next : "true";
    const existing = flags.get(key) ?? [];
    existing.push(value);
    flags.set(key, existing);
    if (hasValue) {
      i += 1;
    }
  }

  return { command, flags };
}

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(`
Agent Lab CLI

Run one prompt:
  bun agentic-testing/agent-lab.ts run --userId dev-user --prompt "Explain BFS"

Run a suite file:
  bun agentic-testing/agent-lab.ts suite --file agentic-testing/suites/example.json --userId dev-user

Shared flags:
  --agentName studi           Agent name (default: studi)
  --profile fast              Resolve agentName from model profile
  --cheap                     Shortcut for --profile fast
  --pollMs 250                Poll interval in ms (default: 250)
  --context                   Fetch and store prompt context
  --verbose                   Print detailed timeline while running
  --debugRaw                  Include raw message payloads in artifact JSON
  --modelLabel sonnet-4.6     Tag run metadata for comparison
  --saveSceneHtml             Save generated HTML-capable sparks locally (scene + web_playground)
  --sceneOutDir <path>        Custom directory for saved HTML spark files
  --expectTools a,b,c         Assert these tools were called at least once
  --expectPlanTools a,b,c     Assert plan tools were called (plan-only)
  --failOnToolError           Exit with non-zero if any tool call fails
  --requirePlan               Assert a plan exists by end of run
  --expectPlanPhase <phase>   Assert final plan phase (discovery|draft_review|active|completed)
  --minPlanProgress <0-100>   Assert minimum final plan progress percent
  --verifyTelemetry           Fetch Convex telemetry summary for thread
  --verifyPosthog             Query PostHog for expected events after run
  --posthogWaitMs <ms>        Wait before PostHog query (default: 4000)

Run-specific flags:
  --threadId <id>             Use existing thread
  --newThread                 Force create a new thread
  --title "New Thread"        Thread title (when creating)

Env vars required:
  CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL)
  STUDI_PLAYGROUND_API_KEY (or PLAYGROUND_API_KEY)

Env vars for --verifyPosthog:
  POSTHOG_PERSONAL_API_KEY
  POSTHOG_PROJECT_ID
  POSTHOG_HOST (optional, default https://us.i.posthog.com)
`);
  process.exit(1);
}

function getSingleFlag(
  flags: Map<string, string[]>,
  key: string,
): string | undefined {
  const values = flags.get(key);
  if (!values || values.length === 0) {
    return undefined;
  }
  return values[values.length - 1];
}

function getBooleanFlag(flags: Map<string, string[]>, key: string): boolean {
  const value = getSingleFlag(flags, key);
  return value === "true";
}

function getRequiredFlag(flags: Map<string, string[]>, key: string): string {
  const value = getSingleFlag(flags, key);
  if (!value || value === "true") {
    printUsageAndExit(`Missing required --${key}`);
  }
  return value;
}

function parseNumberFlag(
  flags: Map<string, string[]>,
  key: string,
  fallback: number,
): number {
  const raw = getSingleFlag(flags, key);
  if (!raw || raw === "true") {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    printUsageAndExit(`--${key} must be a positive integer`);
  }
  return parsed;
}

function parseCsvFlag(flags: Map<string, string[]>, key: string): string[] {
  const value = getSingleFlag(flags, key);
  if (!value || value === "true") {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseOptionalPercentFlag(
  flags: Map<string, string[]>,
  key: string,
): number | undefined {
  const raw = getSingleFlag(flags, key);
  if (!raw || raw === "true") {
    return undefined;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    printUsageAndExit(`--${key} must be an integer between 0 and 100`);
  }
  return parsed;
}

function parsePlanPhaseFlag(
  flags: Map<string, string[]>,
  key: string,
): "discovery" | "draft_review" | "active" | "completed" | undefined {
  const raw = getSingleFlag(flags, key);
  if (!raw || raw === "true") {
    return undefined;
  }
  if (
    raw === "discovery" ||
    raw === "draft_review" ||
    raw === "active" ||
    raw === "completed"
  ) {
    return raw;
  }
  printUsageAndExit(
    `--${key} must be one of discovery, draft_review, active, completed`,
  );
}

function parseModelProfileFlag(
  flags: Map<string, string[]>,
): ModelProfile | undefined {
  const explicit = getSingleFlag(flags, "profile");
  if (explicit) {
    if (!isModelProfile(explicit)) {
      printUsageAndExit(
        `Invalid --profile value: ${explicit}. Expected balanced|fast|quality.`,
      );
    }
    return explicit;
  }

  if (getBooleanFlag(flags, "cheap")) {
    return "fast";
  }

  return undefined;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function truncate(text: string, max = 120): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}...`;
}

function safeString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function relativeMs(startAt: number, at: number): number {
  return Math.max(0, at - startAt);
}

function sortMessagesChronologically(
  messages: PlaygroundMessage[],
): PlaygroundMessage[] {
  return [...messages].sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    const as = a.stepOrder ?? Number.MAX_SAFE_INTEGER;
    const bs = b.stepOrder ?? Number.MAX_SAFE_INTEGER;
    if (as !== bs) return as - bs;
    return a._creationTime - b._creationTime;
  });
}

function contentToParts(content: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(content)) {
    return content.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    );
  }

  if (typeof content === "string" && content.trim()) {
    return [{ type: "text", text: content }];
  }

  return [];
}

function extractToolResultPayload(part: Record<string, unknown>): unknown {
  if ("result" in part) {
    return part.result;
  }

  const output = part.output;
  if (!output || typeof output !== "object") {
    return undefined;
  }

  const outputRecord = output as Record<string, unknown>;
  if ("value" in outputRecord) {
    return outputRecord.value;
  }
  return output;
}

function extractCreateSparkToolResult(
  value: unknown,
  depth = 0,
): CreateSparkToolResult | null {
  if (depth > 4) {
    return null;
  }

  if (isCreateSparkToolResult(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (/^spark failed:/i.test(normalized)) {
      return {
        status: "failed",
        workerSummary: "Spark generation failed.",
        warnings: [],
        error: normalized.replace(/^spark failed:\s*/i, "") || normalized,
      };
    }

    if (normalized.startsWith("{") || normalized.startsWith("[")) {
      try {
        const parsed = JSON.parse(normalized);
        return extractCreateSparkToolResult(parsed, depth + 1);
      } catch {
        return null;
      }
    }

    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    result?: unknown;
    output?: unknown;
    value?: unknown;
    artifact?: unknown;
  };

  const fromResult = extractCreateSparkToolResult(candidate.result, depth + 1);
  if (fromResult) {
    return fromResult;
  }

  const fromOutput = extractCreateSparkToolResult(candidate.output, depth + 1);
  if (fromOutput) {
    return fromOutput;
  }

  const fromValue = extractCreateSparkToolResult(candidate.value, depth + 1);
  if (fromValue) {
    return fromValue;
  }

  if (isSparkArtifact(candidate.artifact)) {
    return {
      status: "success",
      workerSummary: "Spark artifact created.",
      warnings: [],
      artifact: candidate.artifact,
    };
  }

  return null;
}

function inspectSparkToolResult(part: Record<string, unknown>): {
  failed: boolean;
  sparkStatus?: string;
  error?: string;
  result?: CreateSparkToolResult;
} {
  const payload = extractToolResultPayload(part);
  const structured = extractCreateSparkToolResult(payload);
  if (structured) {
    if (structured.status === "failed") {
      return {
        failed: true,
        sparkStatus: structured.status,
        error: structured.error,
        result: structured,
      };
    }

    return {
      failed: false,
      sparkStatus: structured.status,
      result: structured,
    };
  }

  if (typeof payload === "string") {
    const normalized = payload.trim();
    if (/^spark failed:/i.test(normalized)) {
      return {
        failed: true,
        sparkStatus: "failed",
        error: normalized.replace(/^spark failed:\s*/i, "") || normalized,
      };
    }
    if (/^spark created/i.test(normalized)) {
      return {
        failed: false,
        sparkStatus: "success",
      };
    }
  }

  if (!payload || typeof payload !== "object") {
    return {
      failed: part.isError === true,
      error: part.isError === true ? "Tool result marked as error." : undefined,
    };
  }

  const record = payload as Record<string, unknown>;
  const status =
    typeof record.status === "string"
      ? record.status
      : typeof (record.result as Record<string, unknown> | undefined)
            ?.status === "string"
        ? ((record.result as Record<string, unknown>).status as string)
        : undefined;
  const error =
    typeof record.error === "string"
      ? record.error
      : typeof (record.result as Record<string, unknown> | undefined)?.error ===
          "string"
        ? ((record.result as Record<string, unknown>).error as string)
        : undefined;

  return {
    failed: status === "failed" || part.isError === true,
    sparkStatus: status,
    error,
  };
}

function inspectGenericToolResult(part: Record<string, unknown>): {
  failed: boolean;
  outputStatus?: string;
  summary?: string;
  errorMessage?: string;
  errorCategory?: string;
  retriable?: boolean;
} {
  const payload = extractToolResultPayload(part);
  if (!payload || typeof payload !== "object") {
    return {
      failed: part.isError === true,
    };
  }

  const record = payload as {
    status?: unknown;
    summary?: unknown;
    error?: unknown;
    value?: unknown;
    output?: unknown;
  };

  const nested =
    record.value && typeof record.value === "object"
      ? (record.value as Record<string, unknown>)
      : record.output && typeof record.output === "object"
        ? (record.output as Record<string, unknown>)
        : null;

  const base = (nested ?? (record as Record<string, unknown>)) as Record<
    string,
    unknown
  >;

  const outputStatus =
    typeof base.status === "string" ? base.status : undefined;
  const summary = typeof base.summary === "string" ? base.summary : undefined;

  const errorPayload =
    base.error && typeof base.error === "object"
      ? (base.error as Record<string, unknown>)
      : null;

  const errorMessage =
    typeof errorPayload?.message === "string"
      ? errorPayload.message
      : typeof base.error === "string"
        ? base.error
        : undefined;

  const errorCategory =
    typeof errorPayload?.category === "string"
      ? errorPayload.category
      : undefined;
  const retriable =
    typeof errorPayload?.retriable === "boolean"
      ? errorPayload.retriable
      : undefined;

  return {
    failed: part.isError === true || outputStatus === "failed",
    outputStatus,
    summary,
    errorMessage,
    errorCategory,
    retriable,
  };
}

async function listAllMessages(
  client: ConvexHttpClient,
  apiKey: string,
  threadId: string,
): Promise<PlaygroundMessage[]> {
  const pages: PlaygroundMessage[] = [];
  let cursor: string | null = null;

  while (true) {
    const result = (await client.query(api.playground.listMessages, {
      apiKey,
      threadId,
      paginationOpts: {
        cursor,
        numItems: 200,
      },
    })) as {
      page: PlaygroundMessage[];
      isDone: boolean;
      continueCursor?: string;
    };

    pages.push(...result.page);

    if (result.isDone) {
      break;
    }
    cursor = result.continueCursor ?? null;
    if (!cursor) {
      break;
    }
  }

  return sortMessagesChronologically(pages);
}

async function fetchPromptContext(
  client: ConvexHttpClient,
  apiKey: string,
  params: { userId: string; threadId: string; agentName: string },
): Promise<unknown> {
  try {
    return await client.action(api.playground.fetchPromptContext, {
      apiKey,
      userId: params.userId,
      threadId: params.threadId,
      agentName: params.agentName,
      contextOptions: {
        recentMessages: 50,
        excludeToolMessages: false,
      },
    });
  } catch (error) {
    return {
      error: `Failed to fetch prompt context: ${safeString(error)}`,
    };
  }
}

function printTimelineEvent(event: TimelineEvent): void {
  const base = `[+${event.relativeMs}ms] ${event.kind}`;
  const withTool =
    event.toolName && event.toolCallId
      ? `${base} (${event.toolName} ${event.toolCallId})`
      : event.toolName
        ? `${base} (${event.toolName})`
        : base;
  console.log(`${withTool}: ${event.detail}`);
}

function ensureEvent(
  timeline: TimelineEvent[],
  event: TimelineEvent,
  livePrint: boolean,
): void {
  timeline.push(event);
  if (livePrint) {
    printTimelineEvent(event);
  }
}

function normalizeToolCallId(
  part: Record<string, unknown>,
  fallbackIndex: number,
): string {
  const callId = part.toolCallId;
  if (typeof callId === "string" && callId.trim()) {
    return callId;
  }
  return `unknown-${fallbackIndex}`;
}

function extractDetailFromPart(part: Record<string, unknown>): string {
  const text = part.text;
  if (typeof text === "string" && text.trim()) {
    return truncate(text.trim());
  }

  const args = part.args;
  if (args !== undefined) {
    return truncate(safeString(args));
  }

  const payload = extractToolResultPayload(part);
  if (payload !== undefined) {
    return truncate(safeString(payload));
  }

  return "";
}

function aggregateUsage(messages: PlaygroundMessage[]): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for (const message of messages) {
    promptTokens += message.usage?.promptTokens ?? 0;
    completionTokens += message.usage?.completionTokens ?? 0;
    totalTokens += message.usage?.totalTokens ?? 0;
  }

  return { promptTokens, completionTokens, totalTokens };
}

const POSTHOG_EXPECTED_EVENTS = [
  "agent_usage_recorded",
  "agent_reply_completed",
  "agent_reply_failed",
  "spark_generation_result",
  "lab_tool_result",
  "plan_tool_result",
  "plan_worker_generation",
] as const;

function sqlString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

async function fetchTelemetrySummary(
  client: ConvexHttpClient,
  userId: string,
  threadId: string,
): Promise<TelemetrySummary | undefined> {
  try {
    const telemetryApi = api as unknown as {
      playground?: {
        getThreadObservabilitySummary?: unknown;
      };
    };
    const queryRef = telemetryApi.playground?.getThreadObservabilitySummary;
    if (!queryRef) {
      return undefined;
    }

    const result = (await client.action(
      queryRef as never,
      {
        userId,
        threadId,
      } as never,
    )) as TelemetrySummary;
    return result;
  } catch (error) {
    console.warn(`Telemetry summary fetch failed: ${safeString(error)}`);
    return undefined;
  }
}

async function queryPosthogValidation(params: {
  userId: string;
  threadId: string;
  startedAt: number;
  endedAt: number;
}): Promise<PosthogValidation> {
  const personalApiKey =
    process.env.POSTHOG_PERSONAL_API_KEY ?? process.env.POSTHOG_API_KEY;
  const projectIdRaw = process.env.POSTHOG_PROJECT_ID;
  const projectId = projectIdRaw ? Number.parseInt(projectIdRaw, 10) : NaN;
  const host = (process.env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace(
    /\/+$/,
    "",
  );

  const baseResult: PosthogValidation = {
    attempted: false,
    ok: false,
    host,
    projectId: Number.isFinite(projectId) ? projectId : undefined,
    eventCounts: Object.fromEntries(
      POSTHOG_EXPECTED_EVENTS.map((name) => [name, 0]),
    ) as Record<string, number>,
    totalMatched: 0,
    missingExpectedEvents: [...POSTHOG_EXPECTED_EVENTS],
  };

  if (!personalApiKey) {
    return {
      ...baseResult,
      note: "Missing POSTHOG_PERSONAL_API_KEY (or POSTHOG_API_KEY fallback).",
    };
  }
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return {
      ...baseResult,
      note: "Missing or invalid POSTHOG_PROJECT_ID.",
    };
  }

  const fromIso = new Date(params.startedAt - 60_000).toISOString();
  const toIso = new Date(params.endedAt + 5 * 60_000).toISOString();
  const inClause = POSTHOG_EXPECTED_EVENTS.map((name) => sqlString(name)).join(
    ", ",
  );

  const query = [
    "SELECT event, count() AS count",
    "FROM events",
    `WHERE distinct_id = ${sqlString(params.userId)}`,
    `  AND properties.thread_id = ${sqlString(params.threadId)}`,
    `  AND timestamp >= toDateTime(${sqlString(fromIso)})`,
    `  AND timestamp <= toDateTime(${sqlString(toIso)})`,
    `  AND event IN (${inClause})`,
    "GROUP BY event",
    "ORDER BY event ASC",
  ].join("\n");

  let response: Response;
  try {
    response = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${personalApiKey}`,
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query,
        },
      }),
    });
  } catch (error) {
    return {
      ...baseResult,
      attempted: true,
      fromIso,
      toIso,
      query,
      note: `PostHog query failed: ${safeString(error)}`,
    };
  }

  if (!response.ok) {
    return {
      ...baseResult,
      attempted: true,
      fromIso,
      toIso,
      query,
      note: `PostHog query failed with status ${response.status}.`,
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    results?: Array<Record<string, unknown> | unknown[]>;
    columns?: string[];
  } | null;

  if (!payload || !Array.isArray(payload.results)) {
    return {
      ...baseResult,
      attempted: true,
      fromIso,
      toIso,
      query,
      note: "PostHog query returned unexpected payload.",
    };
  }

  const nextCounts = { ...baseResult.eventCounts };
  const columns = Array.isArray(payload.columns) ? payload.columns : [];
  const eventIndex = columns.findIndex((name) => name === "event");
  const countIndex = columns.findIndex((name) => name === "count");

  for (const row of payload.results) {
    let eventName: string | undefined;
    let countValue: unknown;

    if (Array.isArray(row)) {
      if (eventIndex >= 0) {
        const candidate = row[eventIndex];
        if (typeof candidate === "string") {
          eventName = candidate;
        }
      }
      if (countIndex >= 0) {
        countValue = row[countIndex];
      }
    } else if (row && typeof row === "object") {
      const record = row as Record<string, unknown>;
      if (typeof record.event === "string") {
        eventName = record.event;
      }
      countValue = record.count;
    }

    if (!eventName || !(eventName in nextCounts)) {
      continue;
    }

    const parsed =
      typeof countValue === "number"
        ? countValue
        : Number.parseInt(String(countValue ?? "0"), 10);
    nextCounts[eventName] = Number.isFinite(parsed) ? parsed : 0;
  }

  const totalMatched = Object.values(nextCounts).reduce(
    (sum, value) => sum + value,
    0,
  );
  const missingExpectedEvents = POSTHOG_EXPECTED_EVENTS.filter(
    (name) => (nextCounts[name] ?? 0) <= 0,
  );
  const hasReplyEvent =
    (nextCounts.agent_reply_completed ?? 0) > 0 ||
    (nextCounts.agent_reply_failed ?? 0) > 0;
  const hasUsageEvent = (nextCounts.agent_usage_recorded ?? 0) > 0;
  const ok = totalMatched > 0 && hasReplyEvent && hasUsageEvent;

  return {
    attempted: true,
    ok,
    host,
    projectId,
    fromIso,
    toIso,
    query,
    eventCounts: nextCounts,
    totalMatched,
    missingExpectedEvents,
    note: ok
      ? undefined
      : "Missing baseline PostHog events (agent reply and/or usage).",
  };
}

const PLAN_TOOL_NAMES = new Set([
  "start_plan_mode",
  "get_plan_context",
  "generate_plan_draft",
  "accept_plan_draft",
  "request_plan_changes",
  "set_plan_item_status",
]);

function parsePlanPhase(
  value: unknown,
): "discovery" | "draft_review" | "active" | "completed" | undefined {
  if (
    value === "discovery" ||
    value === "draft_review" ||
    value === "active" ||
    value === "completed"
  ) {
    return value;
  }
  return undefined;
}

function mergePlanSnapshotFromPayload(
  current: PlanSnapshot,
  payload: unknown,
): PlanSnapshot {
  if (!payload || typeof payload !== "object") {
    return current;
  }

  const record = payload as Record<string, unknown>;
  if (record.status === "missing") {
    return {
      ...current,
      exists: false,
    };
  }

  const next: PlanSnapshot = {
    ...current,
    exists: true,
  };

  const phase = parsePlanPhase(record.phase);
  if (phase) {
    next.phase = phase;
  }

  if (typeof record.progressPercent === "number") {
    next.progressPercent = record.progressPercent;
  }
  if (typeof record.totalItems === "number") {
    next.totalItems = record.totalItems;
  }
  if (typeof record.completedItems === "number") {
    next.completedItems = record.completedItems;
  }
  if (typeof record.hasDraft === "boolean") {
    next.hasDraft = record.hasDraft;
  }
  if (typeof record.title === "string") {
    next.title = record.title;
  }

  return next;
}

function computeAssertionFailures(
  toolRuns: ToolRun[],
  expectTools: string[],
  expectPlanTools: string[],
  failOnToolError: boolean,
  planSnapshot: PlanSnapshot,
  requirePlan: boolean,
  expectPlanPhase:
    | "discovery"
    | "draft_review"
    | "active"
    | "completed"
    | undefined,
  minPlanProgress: number | undefined,
): string[] {
  const failures: string[] = [];
  const calledTools = new Set(toolRuns.map((tool) => tool.toolName));

  for (const expected of expectTools) {
    if (!calledTools.has(expected)) {
      failures.push(`Expected tool '${expected}' was not called.`);
    }
  }

  for (const expected of expectPlanTools) {
    if (!calledTools.has(expected)) {
      failures.push(`Expected plan tool '${expected}' was not called.`);
    }
  }

  if (failOnToolError) {
    for (const tool of toolRuns) {
      if (tool.status === "error") {
        failures.push(
          `Tool '${tool.toolName}' failed (${tool.toolCallId}): ${tool.error ?? "unknown error"}`,
        );
      }
    }
  }

  if (requirePlan && !planSnapshot.exists) {
    failures.push("Expected plan to exist by end of run.");
  }

  if (expectPlanPhase && planSnapshot.phase !== expectPlanPhase) {
    failures.push(
      `Expected plan phase '${expectPlanPhase}', got '${planSnapshot.phase ?? "missing"}'.`,
    );
  }

  if (
    typeof minPlanProgress === "number" &&
    (planSnapshot.progressPercent ?? -1) < minPlanProgress
  ) {
    failures.push(
      `Expected plan progress >= ${minPlanProgress}, got ${planSnapshot.progressPercent ?? "missing"}.`,
    );
  }

  return failures;
}

function sanitizeFilenameSegment(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "scene";
}

function toFileUri(filePath: string): string {
  const resolved = path.resolve(filePath).replace(/\\/g, "/");
  return resolved.startsWith("/")
    ? `file://${resolved}`
    : `file:///${resolved}`;
}

function ensureHtmlDocument(rawHtml: string): string {
  const trimmed = rawHtml.trim();
  let html = trimmed.length > 0 ? trimmed : "<div></div>";

  if (!/<html[\s>]/i.test(html)) {
    html = `<!doctype html>\n<html><head></head><body>${html}</body></html>`;
  }

  if (!/<head[\s>]/i.test(html)) {
    html = html.replace(/<html([^>]*)>/i, "<html$1><head></head>");
  }

  if (!/<body[\s>]/i.test(html)) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, "</head><body></body>");
    } else if (/<\/html>/i.test(html)) {
      html = html.replace(/<\/html>/i, "<body></body></html>");
    } else {
      html = `${html}<body></body>`;
    }
  }

  if (!/<!doctype html>/i.test(html)) {
    html = `<!doctype html>\n${html}`;
  }

  return html;
}

function escapeInlineScript(value: string): string {
  return value.replace(/<\/(script)/gi, "<\\/$1");
}

function getExportableSparkHtml(artifact: SparkArtifact): string | null {
  if (artifact.kind === "spark_scene") {
    return artifact.payload.html;
  }

  if (artifact.kind !== "spark_web_playground") {
    return null;
  }

  const base = ensureHtmlDocument(artifact.payload.html);
  const cssTag = artifact.payload.css?.trim()
    ? `<style>\n${artifact.payload.css}\n</style>`
    : "";
  const jsTag = artifact.payload.js?.trim()
    ? `<script>\n${escapeInlineScript(artifact.payload.js)}\n</script>`
    : "";

  const withCss = cssTag
    ? base.replace(/<\/head>/i, `${cssTag}\n</head>`)
    : base;
  const withJs = jsTag
    ? withCss.replace(/<\/body>/i, `${jsTag}\n</body>`)
    : withCss;

  return withJs;
}

async function runSingle(
  client: ConvexHttpClient,
  apiKey: string,
  config: RunConfig,
): Promise<RunResult> {
  const command = process.argv.join(" ");
  const runId = `${new Date().toISOString().replace(/[.:]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();

  const initialMessages =
    config.threadId !== undefined
      ? await listAllMessages(client, apiKey, config.threadId)
      : [];

  let threadId = config.threadId;
  if (!threadId || config.newThread) {
    const created = (await client.mutation(api.playground.createThread, {
      apiKey,
      userId: config.userId,
      agentName: config.agentName,
      title: config.title,
    })) as { threadId: string };
    threadId = created.threadId;
  }

  const seenMessageIds = new Set<string>(initialMessages.map((m) => m._id));
  const timeline: TimelineEvent[] = [];
  const toolsByCallId = new Map<string, ToolRun>();
  const toolRuns: ToolRun[] = [];
  const sparkArtifacts: SparkArtifactSummary[] = [];
  const sceneFiles: SceneFileExport[] = [];
  let planSnapshot: PlanSnapshot = { exists: false };
  const savedSceneToolCalls = new Set<string>();
  const savedSparkArtifactToolCalls = new Set<string>();
  const sceneOutDir =
    config.sceneOutDir && config.sceneOutDir.trim().length > 0
      ? path.resolve(config.sceneOutDir)
      : path.join(process.cwd(), ".tmp", "agent-lab", "scenes", runId);

  let actionError: string | undefined;
  let actionResultText: string | undefined;
  let actionUsage:
    | {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      }
    | undefined;
  let done = false;

  const generationPromise = client
    .action(api.playground.generateText, {
      apiKey,
      userId: config.userId,
      threadId,
      agentName: config.agentName,
      messages: [{ role: "user", content: config.prompt }],
    })
    .then((result) => {
      const candidate = result as {
        text?: string;
        usage?: {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        };
      };
      actionResultText =
        typeof candidate.text === "string" ? candidate.text : undefined;
      if (candidate.usage) {
        actionUsage = {
          promptTokens: candidate.usage.promptTokens ?? 0,
          completionTokens: candidate.usage.completionTokens ?? 0,
          totalTokens: candidate.usage.totalTokens ?? 0,
        };
      }
      done = true;
    })
    .catch((error) => {
      actionError = safeString(error);
      done = true;
    });

  let newMessages: PlaygroundMessage[] = [];

  const pollOnce = async (): Promise<void> => {
    const current = await listAllMessages(client, apiKey, threadId);
    const justAdded = current.filter(
      (message) => !seenMessageIds.has(message._id),
    );
    if (justAdded.length === 0) {
      return;
    }

    for (const message of justAdded) {
      seenMessageIds.add(message._id);
      newMessages.push(message);

      const role = message.message?.role;
      const at = message._creationTime;
      const base = {
        at,
        relativeMs: relativeMs(startedAt, at),
        order: message.order,
        stepOrder: message.stepOrder,
        messageId: message._id,
      };

      if (role === "user") {
        ensureEvent(
          timeline,
          {
            ...base,
            kind: "user",
            detail: truncate(
              message.text ?? safeString(message.message?.content),
            ),
          },
          config.livePrint,
        );
        continue;
      }

      if (role !== "assistant" && role !== "tool") {
        continue;
      }

      const parts = contentToParts(message.message?.content);

      for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
        const part = parts[partIndex];
        const partType = part.type;

        if (partType === "text") {
          const text = typeof part.text === "string" ? part.text.trim() : "";
          if (text) {
            ensureEvent(
              timeline,
              {
                ...base,
                kind: "assistant_text",
                detail: truncate(text),
              },
              config.livePrint,
            );
          }
          continue;
        }

        if (partType === "reasoning") {
          ensureEvent(
            timeline,
            {
              ...base,
              kind: "reasoning",
              detail: truncate(extractDetailFromPart(part) || "Reasoning step"),
            },
            config.livePrint,
          );
          continue;
        }

        if (partType === "tool-call") {
          const toolName =
            typeof part.toolName === "string" ? part.toolName : "unknown_tool";
          const toolCallId = normalizeToolCallId(part, partIndex);
          const run: ToolRun = {
            toolCallId,
            toolName,
            startedAt: at,
            status: "pending",
          };
          if (!toolsByCallId.has(toolCallId)) {
            toolsByCallId.set(toolCallId, run);
            toolRuns.push(run);
          }

          ensureEvent(
            timeline,
            {
              ...base,
              kind: "tool_call",
              detail: truncate(
                extractDetailFromPart(part) || `${toolName} called`,
              ),
              toolName,
              toolCallId,
            },
            config.livePrint,
          );
          continue;
        }

        if (partType === "tool-result") {
          const toolName =
            typeof part.toolName === "string" ? part.toolName : "unknown_tool";
          const toolCallId = normalizeToolCallId(part, partIndex);
          const spark =
            toolName === "create_spark" ? inspectSparkToolResult(part) : null;
          const generic = inspectGenericToolResult(part);
          const existing = toolsByCallId.get(toolCallId);
          const status: "success" | "error" =
            part.isError === true || spark?.failed || generic.failed
              ? "error"
              : "success";
          const detail =
            (generic.errorMessage ??
              generic.summary ??
              extractDetailFromPart(part)) ||
            `${toolName} finished`;

          if (PLAN_TOOL_NAMES.has(toolName)) {
            const payload = extractToolResultPayload(part);
            planSnapshot = mergePlanSnapshotFromPayload(planSnapshot, payload);
            if (
              toolName === "generate_plan_draft" &&
              generic.outputStatus === "draft_ready"
            ) {
              planSnapshot = {
                ...planSnapshot,
                exists: true,
                phase: "draft_review",
                hasDraft: true,
              };
            }
          }

          if (existing) {
            existing.endedAt = at;
            existing.durationMs = Math.max(0, at - existing.startedAt);
            existing.status = status;
            existing.outputStatus = generic.outputStatus;
            existing.outputSummary = generic.summary;
            existing.errorCategory = generic.errorCategory;
            existing.retriable = generic.retriable;
            if (status === "error") {
              existing.error = generic.errorMessage ?? existing.error;
            }
          } else {
            const inferredStartAt =
              [...timeline]
                .reverse()
                .find(
                  (event) =>
                    event.toolCallId === toolCallId ||
                    event.kind === "assistant_text" ||
                    event.kind === "reasoning",
                )?.at ?? startedAt;

            const fallbackRun: ToolRun = {
              toolCallId,
              toolName,
              startedAt: inferredStartAt,
              endedAt: at,
              durationMs: Math.max(0, at - inferredStartAt),
              durationEstimated: true,
              status,
              outputStatus: generic.outputStatus,
              outputSummary: generic.summary,
              errorCategory: generic.errorCategory,
              retriable: generic.retriable,
              error: status === "error" ? generic.errorMessage : undefined,
            };
            toolsByCallId.set(toolCallId, fallbackRun);
            toolRuns.push(fallbackRun);
          }

          if (toolName === "create_spark") {
            const target = toolsByCallId.get(toolCallId);
            if (target && spark) {
              target.sparkStatus = spark.sparkStatus;
              if (spark.failed) {
                target.status = "error";
                target.error = spark.error ?? "Spark failed";
              }
            }

            if (
              spark?.result?.status === "success" &&
              !savedSparkArtifactToolCalls.has(toolCallId)
            ) {
              savedSparkArtifactToolCalls.add(toolCallId);
              sparkArtifacts.push({
                toolCallId,
                kind: spark.result.artifact.kind,
                sparkType: spark.result.artifact.sparkType,
                title: spark.result.artifact.title,
                summary: spark.result.artifact.summary,
              });
            }

            if (
              config.saveSceneHtml &&
              spark?.result?.status === "success" &&
              !savedSceneToolCalls.has(toolCallId)
            ) {
              const exportHtml = getExportableSparkHtml(spark.result.artifact);
              if (exportHtml) {
                savedSceneToolCalls.add(toolCallId);
                const artifact = spark.result.artifact;
                const titleSegment = sanitizeFilenameSegment(
                  artifact.title,
                ).slice(0, 48);
                const filePath = path.join(
                  sceneOutDir,
                  `${sceneFiles.length + 1}-${toolCallId}-${titleSegment}.html`,
                );
                await mkdir(sceneOutDir, { recursive: true });
                await writeFile(filePath, `${exportHtml}\n`, "utf8");
                sceneFiles.push({
                  toolCallId,
                  sparkType: artifact.sparkType,
                  filePath,
                  title: artifact.title,
                  summary: artifact.summary,
                });
              }
            }
          }

          ensureEvent(
            timeline,
            {
              ...base,
              kind: "tool_result",
              detail: truncate(detail),
              toolName,
              toolCallId,
              status,
            },
            config.livePrint,
          );
        }
      }

      if (message.error) {
        ensureEvent(
          timeline,
          {
            ...base,
            kind: "error",
            detail: truncate(message.error),
            status: "error",
          },
          config.livePrint,
        );
      }
    }
  };

  while (!done) {
    await pollOnce();
    await sleep(config.pollMs);
  }
  await generationPromise;
  await pollOnce();

  const settleDeadline = Date.now() + 6_000;
  while (Date.now() < settleDeadline) {
    const current = await listAllMessages(client, apiKey, threadId);
    const hasPendingMessages = current.some(
      (message) => message.status === "pending",
    );
    if (!hasPendingMessages) {
      break;
    }
    await pollOnce();
    await sleep(config.pollMs);
  }

  newMessages = sortMessagesChronologically(newMessages);
  const endedAt = Date.now();

  const hasAssistantTextEvent = timeline.some(
    (event) => event.kind === "assistant_text",
  );
  if (!hasAssistantTextEvent && actionResultText) {
    ensureEvent(
      timeline,
      {
        at: endedAt,
        relativeMs: relativeMs(startedAt, endedAt),
        messageId: "action-result",
        kind: "assistant_text",
        detail: truncate(actionResultText),
      },
      config.livePrint,
    );
  }

  const firstAssistantEvent = timeline.find(
    (event) =>
      event.kind === "assistant_text" ||
      event.kind === "reasoning" ||
      event.kind === "tool_call",
  );

  const sparkTools = toolRuns.filter(
    (tool) => tool.toolName === "create_spark",
  );
  const sparkFailures = sparkTools.filter(
    (tool) => tool.status === "error",
  ).length;
  const sparkTotalDurationMs = sparkTools.reduce(
    (sum, tool) => sum + (tool.durationMs ?? 0),
    0,
  );

  const labTools = toolRuns.filter((tool) =>
    [
      "create_lab",
      "archive_lab",
      "list",
      "read",
      "grep",
      "glob",
      "run",
      "edit",
      "write",
    ].includes(tool.toolName),
  );

  const planTools = toolRuns.filter((tool) =>
    PLAN_TOOL_NAMES.has(tool.toolName),
  );

  const assertionFailures = computeAssertionFailures(
    toolRuns,
    config.expectTools,
    config.expectPlanTools,
    config.failOnToolError,
    planSnapshot,
    config.requirePlan,
    config.expectPlanPhase,
    config.minPlanProgress,
  );

  let telemetrySummary: TelemetrySummary | undefined;
  if (config.verifyTelemetry) {
    telemetrySummary = await fetchTelemetrySummary(
      client,
      config.userId,
      threadId,
    );
    if (!telemetrySummary) {
      assertionFailures.push(
        "Telemetry summary is unavailable (check convex codegen/deploy).",
      );
    } else {
      if (telemetrySummary.usage.calls <= 0) {
        assertionFailures.push(
          "Telemetry usage calls are zero for this thread.",
        );
      }
      if (telemetrySummary.telemetry.events <= 0) {
        assertionFailures.push(
          "Telemetry event count is zero for this thread.",
        );
      }
    }
  }

  let posthog: PosthogValidation | undefined;
  if (config.verifyPosthog) {
    if (config.posthogWaitMs > 0) {
      await sleep(config.posthogWaitMs);
    }
    posthog = await queryPosthogValidation({
      userId: config.userId,
      threadId,
      startedAt,
      endedAt,
    });
    if (!posthog.ok) {
      assertionFailures.push(
        `PostHog validation failed: ${posthog.note ?? "unknown reason"}`,
      );
    }
  }

  const context = config.includeContext
    ? await fetchPromptContext(client, apiKey, {
        userId: config.userId,
        threadId,
        agentName: config.agentName,
      })
    : undefined;

  const messageUsage = aggregateUsage(newMessages);
  const usage =
    messageUsage.totalTokens > 0 ? messageUsage : (actionUsage ?? messageUsage);

  return {
    runId,
    command,
    userId: config.userId,
    threadId,
    agentName: config.agentName,
    prompt: config.prompt,
    promptHash: hashText(config.prompt),
    modelLabel: config.modelLabel,
    startedAt,
    endedAt,
    totalDurationMs: Math.max(0, endedAt - startedAt),
    firstAssistantEventMs: firstAssistantEvent?.relativeMs,
    actionError,
    actionResultText,
    actionResultTextHash: actionResultText
      ? hashText(actionResultText)
      : undefined,
    messageCount: initialMessages.length + newMessages.length,
    newMessageCount: newMessages.length,
    usage,
    tools: toolRuns,
    timeline,
    spark: {
      calls: sparkTools.length,
      failures: sparkFailures,
      totalDurationMs: sparkTotalDurationMs,
    },
    lab: {
      calls: labTools.length,
      failures: labTools.filter((tool) => tool.status === "error").length,
      createLabCalls: labTools.filter((tool) => tool.toolName === "create_lab")
        .length,
      archiveLabCalls: labTools.filter(
        (tool) => tool.toolName === "archive_lab",
      ).length,
      runCalls: labTools.filter((tool) => tool.toolName === "run").length,
      globCalls: labTools.filter((tool) => tool.toolName === "glob").length,
      hadActivation: labTools.some(
        (tool) => tool.toolName === "create_lab" && tool.status === "success",
      ),
    },
    plan: {
      calls: planTools.length,
      failures: planTools.filter((tool) => tool.status === "error").length,
      startPlanModeCalls: planTools.filter(
        (tool) => tool.toolName === "start_plan_mode",
      ).length,
      getPlanContextCalls: planTools.filter(
        (tool) => tool.toolName === "get_plan_context",
      ).length,
      generatePlanDraftCalls: planTools.filter(
        (tool) => tool.toolName === "generate_plan_draft",
      ).length,
      acceptPlanDraftCalls: planTools.filter(
        (tool) => tool.toolName === "accept_plan_draft",
      ).length,
      requestPlanChangesCalls: planTools.filter(
        (tool) => tool.toolName === "request_plan_changes",
      ).length,
      setPlanItemStatusCalls: planTools.filter(
        (tool) => tool.toolName === "set_plan_item_status",
      ).length,
      finalSnapshot: planSnapshot,
    },
    assertionFailures,
    sparkArtifacts,
    sceneFiles,
    telemetrySummary,
    posthog,
    rawMessages: config.debugRaw ? newMessages : undefined,
    context,
  };
}

async function writeRunArtifact(run: RunResult): Promise<string> {
  const baseDir = path.join(process.cwd(), ".tmp", "agent-lab");
  await mkdir(baseDir, { recursive: true });
  const filePath = path.join(baseDir, `${run.runId}.json`);
  await writeFile(filePath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return filePath;
}

function printRunSummary(run: RunResult): void {
  console.log("\nRun complete");
  console.log(`- runId: ${run.runId}`);
  console.log(`- threadId: ${run.threadId}`);
  console.log(`- totalDurationMs: ${run.totalDurationMs}`);
  console.log(`- firstAssistantEventMs: ${run.firstAssistantEventMs ?? "n/a"}`);
  console.log(`- newMessageCount: ${run.newMessageCount}`);
  console.log(
    `- usage: prompt=${run.usage.promptTokens}, completion=${run.usage.completionTokens}, total=${run.usage.totalTokens}`,
  );
  console.log(
    `- spark: calls=${run.spark.calls}, failures=${run.spark.failures}, totalDurationMs=${run.spark.totalDurationMs}`,
  );
  console.log(
    `- lab: calls=${run.lab.calls}, failures=${run.lab.failures}, create_lab=${run.lab.createLabCalls}, run=${run.lab.runCalls}, glob=${run.lab.globCalls}, activated=${run.lab.hadActivation}`,
  );
  console.log(
    `- plan: calls=${run.plan.calls}, failures=${run.plan.failures}, start=${run.plan.startPlanModeCalls}, draft=${run.plan.generatePlanDraftCalls}, accept=${run.plan.acceptPlanDraftCalls}, set_item=${run.plan.setPlanItemStatusCalls}, phase=${run.plan.finalSnapshot.phase ?? "n/a"}, progress=${run.plan.finalSnapshot.progressPercent ?? "n/a"}`,
  );
  if (run.telemetrySummary) {
    console.log(
      `- telemetry: usageCalls=${run.telemetrySummary.usage.calls}, usageTotalTokens=${run.telemetrySummary.usage.totalTokens}, events=${run.telemetrySummary.telemetry.events}, failures=${run.telemetrySummary.telemetry.failures}, sparkFailures=${run.telemetrySummary.telemetry.sparkFailures}, labFailures=${run.telemetrySummary.telemetry.labToolFailures}, planFailures=${run.telemetrySummary.telemetry.planToolFailures}, runtimeFailures=${run.telemetrySummary.telemetry.runtimeFailures}`,
    );
  }
  if (run.posthog) {
    console.log(
      `- posthog: attempted=${run.posthog.attempted}, ok=${run.posthog.ok}, totalMatched=${run.posthog.totalMatched}, missing=${run.posthog.missingExpectedEvents.join(",") || "none"}`,
    );
    if (run.posthog.note) {
      console.log(`  note: ${run.posthog.note}`);
    }
  }

  if (run.tools.length > 0) {
    console.log("- toolRuns:");
    for (const tool of run.tools) {
      const tail = tool.error ? ` error=${truncate(tool.error, 80)}` : "";
      const durationLabel = `${tool.durationMs ?? "n/a"}${tool.durationEstimated ? "~" : ""}`;
      const outputTail = tool.outputStatus
        ? ` outputStatus=${tool.outputStatus}`
        : "";
      console.log(
        `  - ${tool.toolName} (${tool.toolCallId}) status=${tool.status} durationMs=${durationLabel}${outputTail}${tail}`,
      );
    }
  }

  if (run.assertionFailures.length > 0) {
    console.log("- assertions:");
    for (const failure of run.assertionFailures) {
      console.log(`  - ${failure}`);
    }
  }

  if (run.sparkArtifacts.length > 0) {
    console.log("- sparkArtifacts:");
    for (const artifact of run.sparkArtifacts) {
      console.log(
        `  - ${artifact.sparkType} (${artifact.kind}) ${artifact.title} [${artifact.toolCallId}]`,
      );
    }
  }

  if (run.sceneFiles.length > 0) {
    console.log("- htmlSparkFiles:");
    for (const scene of run.sceneFiles) {
      const uri = toFileUri(scene.filePath);
      console.log(
        `  - ${scene.sparkType} ${scene.title} (${scene.toolCallId}) ${scene.filePath}`,
      );
      console.log(
        `    agent-browser: npx agent-browser --allow-file-access open \"${uri}\" && npx agent-browser snapshot -i && npx agent-browser screenshot --full`,
      );
    }
  }

  if (run.actionError) {
    console.log(`- actionError: ${truncate(run.actionError, 180)}`);
  }
}

async function runCommand(parsed: ParsedArgs): Promise<void> {
  const convexUrl =
    process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  const apiKey =
    process.env.STUDI_PLAYGROUND_API_KEY ??
    process.env.PLAYGROUND_API_KEY ??
    "";

  if (!convexUrl) {
    printUsageAndExit(
      "Missing CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL) environment variable.",
    );
  }
  if (!apiKey) {
    printUsageAndExit(
      "Missing STUDI_PLAYGROUND_API_KEY (or PLAYGROUND_API_KEY) environment variable.",
    );
  }

  const client = new ConvexHttpClient(convexUrl);

  const userId = getRequiredFlag(parsed.flags, "userId");
  const prompt = getRequiredFlag(parsed.flags, "prompt");
  const threadId = getSingleFlag(parsed.flags, "threadId");
  const newThread = getBooleanFlag(parsed.flags, "newThread");
  const includeContext = getBooleanFlag(parsed.flags, "context");
  const verbose = getBooleanFlag(parsed.flags, "verbose");
  const debugRaw = getBooleanFlag(parsed.flags, "debugRaw");
  const pollMsFlag = getSingleFlag(parsed.flags, "pollMs");
  const pollMs = pollMsFlag
    ? parseNumberFlag(parsed.flags, "pollMs", 250)
    : 250;
  const profile = parseModelProfileFlag(parsed.flags);
  const profileAgentName = profile ? getStudiAgentName(profile) : undefined;
  const agentName =
    getSingleFlag(parsed.flags, "agentName") ?? profileAgentName ?? "studi";
  const title = getSingleFlag(parsed.flags, "title") ?? "Agent Lab Thread";
  const modelLabel = getSingleFlag(parsed.flags, "modelLabel");
  const sceneOutDir = getSingleFlag(parsed.flags, "sceneOutDir");
  const saveSceneHtml =
    getBooleanFlag(parsed.flags, "saveSceneHtml") || Boolean(sceneOutDir);
  const expectTools = parseCsvFlag(parsed.flags, "expectTools");
  const expectPlanTools = parseCsvFlag(parsed.flags, "expectPlanTools");
  const failOnToolError = getBooleanFlag(parsed.flags, "failOnToolError");
  const requirePlan = getBooleanFlag(parsed.flags, "requirePlan");
  const expectPlanPhase = parsePlanPhaseFlag(parsed.flags, "expectPlanPhase");
  const minPlanProgress = parseOptionalPercentFlag(
    parsed.flags,
    "minPlanProgress",
  );
  const verifyTelemetry = getBooleanFlag(parsed.flags, "verifyTelemetry");
  const verifyPosthog = getBooleanFlag(parsed.flags, "verifyPosthog");
  const posthogWaitMsFlag = getSingleFlag(parsed.flags, "posthogWaitMs");
  const posthogWaitMs = posthogWaitMsFlag
    ? parseNumberFlag(parsed.flags, "posthogWaitMs", 4000)
    : 4000;

  const run = await runSingle(client, apiKey, {
    userId,
    prompt,
    agentName,
    threadId,
    newThread,
    title,
    pollMs,
    includeContext,
    verbose,
    modelLabel,
    livePrint: verbose,
    debugRaw,
    saveSceneHtml,
    sceneOutDir,
    expectTools,
    expectPlanTools,
    failOnToolError,
    requirePlan,
    expectPlanPhase,
    minPlanProgress,
    verifyTelemetry,
    verifyPosthog,
    posthogWaitMs,
  });

  printRunSummary(run);
  const artifactPath = await writeRunArtifact(run);
  console.log(`- artifact: ${artifactPath}`);

  if (run.assertionFailures.length > 0) {
    process.exitCode = 1;
  }
}

function parseSuiteConfig(raw: unknown): SuiteConfig {
  if (!raw || typeof raw !== "object") {
    throw new Error("Suite config must be a JSON object.");
  }

  const candidate = raw as Record<string, unknown>;
  if (!Array.isArray(candidate.cases) || candidate.cases.length === 0) {
    throw new Error("Suite config requires a non-empty 'cases' array.");
  }

  return candidate as SuiteConfig;
}

async function runSuiteCommand(parsed: ParsedArgs): Promise<void> {
  const convexUrl =
    process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  const apiKey =
    process.env.STUDI_PLAYGROUND_API_KEY ??
    process.env.PLAYGROUND_API_KEY ??
    "";

  if (!convexUrl) {
    printUsageAndExit(
      "Missing CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL) environment variable.",
    );
  }
  if (!apiKey) {
    printUsageAndExit(
      "Missing STUDI_PLAYGROUND_API_KEY (or PLAYGROUND_API_KEY) environment variable.",
    );
  }

  const file = getRequiredFlag(parsed.flags, "file");
  const text = await readFile(file, "utf8");
  const suite = parseSuiteConfig(JSON.parse(text));

  const client = new ConvexHttpClient(convexUrl);
  const overrideUserId = getSingleFlag(parsed.flags, "userId");
  const overrideAgentName = getSingleFlag(parsed.flags, "agentName");
  const profile = parseModelProfileFlag(parsed.flags);
  const profileAgentName = profile ? getStudiAgentName(profile) : undefined;
  const pollMsFlag = getSingleFlag(parsed.flags, "pollMs");
  const pollMs = pollMsFlag
    ? parseNumberFlag(parsed.flags, "pollMs", 250)
    : (suite.defaults?.pollMs ?? 250);
  const includeContext = getBooleanFlag(parsed.flags, "context");
  const verbose = getBooleanFlag(parsed.flags, "verbose");
  const debugRaw = getBooleanFlag(parsed.flags, "debugRaw");
  const sceneOutDir = getSingleFlag(parsed.flags, "sceneOutDir");
  const saveSceneHtml =
    getBooleanFlag(parsed.flags, "saveSceneHtml") || Boolean(sceneOutDir);
  const expectToolsOverride = parseCsvFlag(parsed.flags, "expectTools");
  const expectPlanToolsOverride = parseCsvFlag(parsed.flags, "expectPlanTools");
  const failOnToolErrorOverride = getBooleanFlag(
    parsed.flags,
    "failOnToolError",
  );
  const requirePlanOverride = getBooleanFlag(parsed.flags, "requirePlan");
  const expectPlanPhaseOverride = parsePlanPhaseFlag(
    parsed.flags,
    "expectPlanPhase",
  );
  const minPlanProgressOverride = parseOptionalPercentFlag(
    parsed.flags,
    "minPlanProgress",
  );
  const verifyTelemetry = getBooleanFlag(parsed.flags, "verifyTelemetry");
  const verifyPosthog = getBooleanFlag(parsed.flags, "verifyPosthog");
  const posthogWaitMsFlag = getSingleFlag(parsed.flags, "posthogWaitMs");
  const posthogWaitMs = posthogWaitMsFlag
    ? parseNumberFlag(parsed.flags, "posthogWaitMs", 4000)
    : 4000;

  const results: RunResult[] = [];
  let previousThreadId: string | undefined;

  console.log(`Running suite: ${suite.name ?? "unnamed-suite"}`);

  for (const testCase of suite.cases) {
    const repeats = Math.max(1, testCase.repeat ?? 1);
    for (let i = 0; i < repeats; i += 1) {
      const userId =
        overrideUserId ??
        testCase.userId ??
        suite.defaults?.userId ??
        "agentic-test-user";
      const agentName =
        overrideAgentName ??
        profileAgentName ??
        testCase.agentName ??
        suite.defaults?.agentName ??
        "studi";
      const newThread = testCase.newThread ?? suite.defaults?.newThread ?? true;
      const reusePreviousThread = testCase.reusePreviousThread ?? false;
      const title =
        testCase.title ?? suite.defaults?.title ?? `Suite: ${testCase.name}`;
      const modelLabel = testCase.modelLabel;
      const expectTools =
        expectToolsOverride.length > 0
          ? expectToolsOverride
          : (testCase.expectTools ?? suite.defaults?.expectTools ?? []);
      const expectPlanTools =
        expectPlanToolsOverride.length > 0
          ? expectPlanToolsOverride
          : (testCase.expectPlanTools ?? suite.defaults?.expectPlanTools ?? []);
      const failOnToolError =
        failOnToolErrorOverride ||
        testCase.failOnToolError ||
        suite.defaults?.failOnToolError ||
        false;
      const requirePlan =
        requirePlanOverride ||
        testCase.requirePlan ||
        suite.defaults?.requirePlan ||
        false;
      const expectPlanPhase =
        expectPlanPhaseOverride ??
        testCase.expectPlanPhase ??
        suite.defaults?.expectPlanPhase;
      const minPlanProgress =
        minPlanProgressOverride ??
        testCase.minPlanProgress ??
        suite.defaults?.minPlanProgress;

      let resolvedThreadId = testCase.threadId;
      let resolvedNewThread = newThread;
      if (reusePreviousThread) {
        if (!resolvedThreadId && previousThreadId) {
          resolvedThreadId = previousThreadId;
        }
        if (resolvedThreadId) {
          resolvedNewThread = false;
        }
      }

      console.log(`\nCase ${testCase.name} (${i + 1}/${repeats})`);

      const run = await runSingle(client, apiKey, {
        userId,
        prompt: testCase.prompt,
        agentName,
        threadId: resolvedThreadId,
        newThread: resolvedNewThread,
        title,
        pollMs,
        includeContext:
          includeContext || (suite.defaults?.includeContext ?? false),
        verbose,
        modelLabel,
        livePrint: false,
        debugRaw,
        saveSceneHtml,
        sceneOutDir,
        expectTools,
        expectPlanTools,
        failOnToolError,
        requirePlan,
        expectPlanPhase,
        minPlanProgress,
        verifyTelemetry,
        verifyPosthog,
        posthogWaitMs,
      });

      printRunSummary(run);
      results.push(run);
      previousThreadId = run.threadId;
    }
  }

  const baseDir = path.join(process.cwd(), ".tmp", "agent-lab");
  await mkdir(baseDir, { recursive: true });
  const suiteRunId = `${new Date().toISOString().replace(/[.:]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  const suitePath = path.join(baseDir, `suite-${suiteRunId}.json`);

  const caseSummaries = results.map((run) => ({
    runId: run.runId,
    userId: run.userId,
    threadId: run.threadId,
    promptHash: run.promptHash,
    modelLabel: run.modelLabel,
    totalDurationMs: run.totalDurationMs,
    firstAssistantEventMs: run.firstAssistantEventMs,
    totalTokens: run.usage.totalTokens,
    sparkFailures: run.spark.failures,
    labFailures: run.lab.failures,
    planFailures: run.plan.failures,
    telemetryEvents: run.telemetrySummary?.telemetry.events,
    telemetryFailures: run.telemetrySummary?.telemetry.failures,
    posthogOk: run.posthog?.ok,
    posthogMatched: run.posthog?.totalMatched,
    planPhase: run.plan.finalSnapshot.phase,
    planProgress: run.plan.finalSnapshot.progressPercent,
    assertionFailures: run.assertionFailures.length,
    responseHash: run.actionResultTextHash,
    actionError: run.actionError,
  }));

  const groupedByPrompt = new Map<string, RunResult[]>();
  for (const run of results) {
    const key = run.promptHash;
    const bucket = groupedByPrompt.get(key) ?? [];
    bucket.push(run);
    groupedByPrompt.set(key, bucket);
  }

  const comparisons = Array.from(groupedByPrompt.entries()).map(
    ([promptHash, runs]) => {
      const durations = runs.map((r) => r.totalDurationMs);
      const sparkFailures = runs.reduce((sum, r) => sum + r.spark.failures, 0);
      const labFailures = runs.reduce((sum, r) => sum + r.lab.failures, 0);
      const planFailures = runs.reduce((sum, r) => sum + r.plan.failures, 0);
      const assertionFailures = runs.reduce(
        (sum, r) => sum + r.assertionFailures.length,
        0,
      );
      const responses = runs
        .map((r) => r.actionResultTextHash)
        .filter((value): value is string => Boolean(value));

      return {
        promptHash,
        runs: runs.length,
        durationMs: {
          min: Math.min(...durations),
          max: Math.max(...durations),
          avg: Math.round(
            durations.reduce((sum, value) => sum + value, 0) / durations.length,
          ),
        },
        sparkFailures,
        labFailures,
        planFailures,
        assertionFailures,
        distinctResponseHashes: Array.from(new Set(responses)).length,
      };
    },
  );

  const artifact = {
    suiteName: suite.name ?? "unnamed-suite",
    command: process.argv.join(" "),
    generatedAt: Date.now(),
    totalRuns: results.length,
    runs: results,
    caseSummaries,
    comparisons,
  };

  await writeFile(suitePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  console.log("\nSuite complete");
  console.log(`- runs: ${results.length}`);
  console.log(`- artifact: ${suitePath}`);

  const totalAssertionFailures = results.reduce(
    (sum, run) => sum + run.assertionFailures.length,
    0,
  );
  console.log(`- assertionFailures: ${totalAssertionFailures}`);

  if (totalAssertionFailures > 0) {
    process.exitCode = 1;
  }

  for (const comparison of comparisons) {
    console.log(
      `- prompt ${comparison.promptHash}: runs=${comparison.runs}, avgDurationMs=${comparison.durationMs.avg}, sparkFailures=${comparison.sparkFailures}, labFailures=${comparison.labFailures}, planFailures=${comparison.planFailures}, assertionFailures=${comparison.assertionFailures}, distinctResponses=${comparison.distinctResponseHashes}`,
    );
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.command === "run") {
    await runCommand(parsed);
    return;
  }
  await runSuiteCommand(parsed);
}

main().catch((error) => {
  console.error(`Fatal: ${safeString(error)}`);
  process.exit(1);
});
