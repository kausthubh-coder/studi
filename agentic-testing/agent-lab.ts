import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import {
  isCreateSparkToolResult,
  isSparkArtifact,
  type CreateSparkToolResult,
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
  sparkStatus?: string;
};

type SceneFileExport = {
  toolCallId: string;
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
  sparkArtifacts: SparkArtifactSummary[];
  sceneFiles: SceneFileExport[];
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
  --pollMs 250                Poll interval in ms (default: 250)
  --context                   Fetch and store prompt context
  --verbose                   Print detailed timeline while running
  --debugRaw                  Include raw message payloads in artifact JSON
  --modelLabel sonnet-4.6     Tag run metadata for comparison
  --saveSceneHtml             Save generated spark_scene HTML files locally
  --sceneOutDir <path>        Custom directory for saved scene files

Run-specific flags:
  --threadId <id>             Use existing thread
  --newThread                 Force create a new thread
  --title "New Thread"        Thread title (when creating)

Env vars required:
  CONVEX_URL (or NEXT_PUBLIC_CONVEX_URL)
  STUDI_PLAYGROUND_API_KEY (or PLAYGROUND_API_KEY)
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
          const existing = toolsByCallId.get(toolCallId);
          const status: "success" | "error" =
            part.isError === true || spark?.failed ? "error" : "success";
          const detail = extractDetailFromPart(part) || `${toolName} finished`;

          if (existing) {
            existing.endedAt = at;
            existing.durationMs = Math.max(0, at - existing.startedAt);
            existing.status = status;
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
              spark.result.artifact.kind === "spark_scene" &&
              !savedSceneToolCalls.has(toolCallId)
            ) {
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
              await writeFile(filePath, `${artifact.payload.html}\n`, "utf8");
              sceneFiles.push({
                toolCallId,
                filePath,
                title: artifact.title,
                summary: artifact.summary,
              });
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
    sparkArtifacts,
    sceneFiles,
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

  if (run.tools.length > 0) {
    console.log("- toolRuns:");
    for (const tool of run.tools) {
      const tail = tool.error ? ` error=${truncate(tool.error, 80)}` : "";
      const durationLabel = `${tool.durationMs ?? "n/a"}${tool.durationEstimated ? "~" : ""}`;
      console.log(
        `  - ${tool.toolName} (${tool.toolCallId}) status=${tool.status} durationMs=${durationLabel}${tail}`,
      );
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
    console.log("- sceneFiles:");
    for (const scene of run.sceneFiles) {
      const uri = toFileUri(scene.filePath);
      console.log(`  - ${scene.title} (${scene.toolCallId}) ${scene.filePath}`);
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
  const agentName = getSingleFlag(parsed.flags, "agentName") ?? "studi";
  const title = getSingleFlag(parsed.flags, "title") ?? "Agent Lab Thread";
  const modelLabel = getSingleFlag(parsed.flags, "modelLabel");
  const sceneOutDir = getSingleFlag(parsed.flags, "sceneOutDir");
  const saveSceneHtml =
    getBooleanFlag(parsed.flags, "saveSceneHtml") || Boolean(sceneOutDir);

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
  });

  printRunSummary(run);
  const artifactPath = await writeRunArtifact(run);
  console.log(`- artifact: ${artifactPath}`);
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

  const results: RunResult[] = [];

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
        testCase.agentName ??
        suite.defaults?.agentName ??
        "studi";
      const newThread = testCase.newThread ?? suite.defaults?.newThread ?? true;
      const title =
        testCase.title ?? suite.defaults?.title ?? `Suite: ${testCase.name}`;
      const modelLabel = testCase.modelLabel;

      console.log(`\nCase ${testCase.name} (${i + 1}/${repeats})`);

      const run = await runSingle(client, apiKey, {
        userId,
        prompt: testCase.prompt,
        agentName,
        threadId: testCase.threadId,
        newThread,
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
      });

      printRunSummary(run);
      results.push(run);
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

  for (const comparison of comparisons) {
    console.log(
      `- prompt ${comparison.promptHash}: runs=${comparison.runs}, avgDurationMs=${comparison.durationMs.avg}, sparkFailures=${comparison.sparkFailures}, distinctResponses=${comparison.distinctResponseHashes}`,
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
