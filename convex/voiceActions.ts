"use node";

import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { activeModelProfile } from "../lib/model-config";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { capturePosthogEvent } from "./posthog";
import { createSparkToolForProfile } from "./sparks/tools";
import { createWarningTool } from "./voiceTools";

const OPENAI_REALTIME_MODEL = "gpt-realtime-mini";
const OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

const realtimeToolNameValidator = v.union(
  v.literal("create_spark"),
  v.literal("create_warning"),
);

const SHRU_REALTIME_INSTRUCTIONS = [
  "You are Shru, Studi's voice tutor.",
  "Keep responses concise and conversational for spoken audio.",
  "Use create_spark when an interactive artifact would help learning.",
  "Use create_warning for labs, planning flows, long-term tracks, or long lesson design.",
  "After create_warning, briefly ask the user to switch to text chat.",
].join(" ");

const usageValidator = v.object({
  totalTokens: v.optional(v.number()),
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  cachedInputTokens: v.optional(v.number()),
  inputTokenDetails: v.optional(v.any()),
  outputTokenDetails: v.optional(v.any()),
  raw: v.optional(v.any()),
});

const internalApi = internal as unknown as {
  chat: {
    assertThreadOwner: FunctionReference<"query", "internal">;
  };
  telemetry: {
    insertRawUsageInternal: FunctionReference<"mutation", "internal">;
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

type UsagePayload = {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  inputTokenDetails?: unknown;
  outputTokenDetails?: unknown;
  raw?: unknown;
};

type VoiceUsageType = "input_transcription" | "realtime_response";

type VoiceRates = {
  realtimeInputTextPer1M: number;
  realtimeCachedInputTextPer1M: number;
  realtimeInputAudioPer1M: number;
  realtimeOutputTextPer1M: number;
  realtimeOutputAudioPer1M: number;
  transcriptionInputAudioPer1M: number;
  transcriptionInputTextPer1M: number;
  transcriptionOutputTextPer1M: number;
};

function readRate(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function getVoiceRates(): VoiceRates {
  return {
    realtimeInputTextPer1M: readRate(
      "OPENAI_REALTIME_INPUT_TEXT_PER_1M_USD",
      0.6,
    ),
    realtimeCachedInputTextPer1M: readRate(
      "OPENAI_REALTIME_CACHED_INPUT_TEXT_PER_1M_USD",
      0.3,
    ),
    realtimeInputAudioPer1M: readRate(
      "OPENAI_REALTIME_INPUT_AUDIO_PER_1M_USD",
      10,
    ),
    realtimeOutputTextPer1M: readRate(
      "OPENAI_REALTIME_OUTPUT_TEXT_PER_1M_USD",
      2.4,
    ),
    realtimeOutputAudioPer1M: readRate(
      "OPENAI_REALTIME_OUTPUT_AUDIO_PER_1M_USD",
      20,
    ),
    transcriptionInputAudioPer1M: readRate(
      "OPENAI_TRANSCRIPTION_INPUT_AUDIO_PER_1M_USD",
      6,
    ),
    transcriptionInputTextPer1M: readRate(
      "OPENAI_TRANSCRIPTION_INPUT_TEXT_PER_1M_USD",
      0.6,
    ),
    transcriptionOutputTextPer1M: readRate(
      "OPENAI_TRANSCRIPTION_OUTPUT_TEXT_PER_1M_USD",
      2.4,
    ),
  };
}

function roundCost(value: number): number {
  return Number(value.toFixed(8));
}

function readNumericCandidate(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function extractEstimatedCostUsd(
  providerMetadata: unknown,
): number | undefined {
  if (!providerMetadata || typeof providerMetadata !== "object") {
    return undefined;
  }

  const stack: Record<string, unknown>[] = [
    providerMetadata as Record<string, unknown>,
  ];
  const seen = new Set<Record<string, unknown>>();
  const keys = [
    "totalCostUsd",
    "total_cost_usd",
    "totalCost",
    "total_cost",
    "costUsd",
    "cost_usd",
    "cost",
  ];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || seen.has(node)) {
      continue;
    }
    seen.add(node);

    for (const key of keys) {
      const found = readNumericCandidate(node, key);
      if (found !== undefined) {
        return found;
      }
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        stack.push(value as Record<string, unknown>);
      }
    }
  }

  return undefined;
}

function getDetailsRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  const parsed: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      parsed[key] = raw;
    }
  }
  return parsed;
}

function getTokenCount(
  details: Record<string, number>,
  keys: string[],
): number {
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function computeVoiceEstimatedCostUsd(args: {
  usageType: VoiceUsageType;
  usage: UsagePayload;
}): number | undefined {
  const rates = getVoiceRates();
  const inputDetails = getDetailsRecord(args.usage.inputTokenDetails);
  const outputDetails = getDetailsRecord(args.usage.outputTokenDetails);

  if (args.usageType === "realtime_response") {
    const inputTextTokens = getTokenCount(inputDetails, [
      "text_tokens",
      "textTokens",
    ]);
    const inputAudioTokens = getTokenCount(inputDetails, [
      "audio_tokens",
      "audioTokens",
    ]);
    const cachedTokens = getTokenCount(inputDetails, [
      "cached_tokens",
      "cachedTokens",
    ]);

    const outputTextTokens = getTokenCount(outputDetails, [
      "text_tokens",
      "textTokens",
    ]);
    const outputAudioTokens = getTokenCount(outputDetails, [
      "audio_tokens",
      "audioTokens",
    ]);

    const billableInputTextTokens = Math.max(0, inputTextTokens - cachedTokens);

    const total =
      (billableInputTextTokens / 1_000_000) * rates.realtimeInputTextPer1M +
      (cachedTokens / 1_000_000) * rates.realtimeCachedInputTextPer1M +
      (inputAudioTokens / 1_000_000) * rates.realtimeInputAudioPer1M +
      (outputTextTokens / 1_000_000) * rates.realtimeOutputTextPer1M +
      (outputAudioTokens / 1_000_000) * rates.realtimeOutputAudioPer1M;

    return roundCost(total);
  }

  const inputAudioTokens = getTokenCount(inputDetails, [
    "audio_tokens",
    "audioTokens",
  ]);
  const inputTextTokens = getTokenCount(inputDetails, [
    "text_tokens",
    "textTokens",
  ]);
  const outputTextTokens = args.usage.outputTokens ?? 0;

  const total =
    (inputAudioTokens / 1_000_000) * rates.transcriptionInputAudioPer1M +
    (inputTextTokens / 1_000_000) * rates.transcriptionInputTextPer1M +
    (outputTextTokens / 1_000_000) * rates.transcriptionOutputTextPer1M;

  return roundCost(total);
}

async function requireAuthenticatedUserId(ctx: {
  auth: {
    getUserIdentity: () => Promise<{ subject: string } | null>;
  };
}): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity.subject;
}

function parseRealtimeToolArguments(json: string): unknown {
  const value = json.trim();
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error("Invalid realtime tool arguments JSON.");
  }
}

function createToolExecutionCtx(
  ctx: Parameters<typeof requireAuthenticatedUserId>[0] & {
    runMutation: unknown;
    runQuery: unknown;
    runAction?: unknown;
    scheduler?: unknown;
    storage?: unknown;
  },
  userId: string,
  threadId: string,
): Record<string, unknown> {
  return {
    runMutation: ctx.runMutation,
    runQuery: ctx.runQuery,
    runAction: ctx.runAction,
    scheduler: ctx.scheduler,
    storage: ctx.storage,
    userId,
    threadId,
  };
}

async function executeRealtimeToolWithCtx(args: {
  tool: unknown;
  ctx: Record<string, unknown>;
  callId: string;
  input: unknown;
}): Promise<unknown> {
  const tool = args.tool as {
    execute?: (input: unknown, options: unknown) => Promise<unknown>;
    ctx?: unknown;
  };

  if (typeof tool.execute !== "function") {
    throw new Error("Realtime tool execute handler is unavailable.");
  }

  tool.ctx = args.ctx;

  return await tool.execute(args.input, {
    toolCallId: args.callId,
    messages: [],
    abortSignal: new AbortController().signal,
  });
}

export const createRealtimeClientSecret = action({
  args: {
    threadId: v.string(),
  },
  returns: v.object({
    clientSecret: v.string(),
    expiresAt: v.optional(v.number()),
    model: v.string(),
    transcriptionModel: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.runQuery(internalApi.chat.assertThreadOwner, {
      userId,
      threadId: args.threadId,
    });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is missing. Add it to .env.local and Convex env vars.",
      );
    }

    const startedAt = Date.now();
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: OPENAI_REALTIME_MODEL,
            instructions: SHRU_REALTIME_INSTRUCTIONS,
            output_modalities: ["audio"],
            audio: {
              input: {
                turn_detection: {
                  type: "server_vad",
                  create_response: true,
                },
                transcription: {
                  model: OPENAI_TRANSCRIPTION_MODEL,
                },
              },
              output: {
                voice: "alloy",
              },
            },
            tools: [
              {
                type: "function",
                name: "create_spark",
                description:
                  "Create an interactive spark artifact for the learner.",
                parameters: {
                  type: "object",
                  properties: {
                    sparkId: {
                      type: "string",
                      enum: [
                        "scene",
                        "quiz",
                        "flash_card",
                        "desmos_graph",
                        "code_playground",
                        "web_playground",
                      ],
                    },
                    context: { type: "string" },
                    title: { type: "string" },
                    summary: { type: "string" },
                  },
                  required: ["sparkId", "context"],
                  additionalProperties: false,
                },
              },
              {
                type: "function",
                name: "create_warning",
                description:
                  "Show a warning asking the learner to switch to text mode.",
                parameters: {
                  type: "object",
                  properties: {
                    reason: {
                      type: "string",
                      enum: [
                        "lab_required",
                        "plan_required",
                        "long_term",
                        "long_lesson",
                      ],
                    },
                    title: { type: "string" },
                    message: { type: "string" },
                    ctaLabel: { type: "string" },
                    suggestedPrompt: { type: "string" },
                  },
                  required: ["reason"],
                  additionalProperties: false,
                },
              },
            ],
            tool_choice: "auto",
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();

      await ctx.runMutation(
        internalApi.telemetry.insertTelemetryEventInternal,
        {
          userId,
          threadId: args.threadId,
          source: "voice",
          name: "create_realtime_client_secret",
          status: "failed",
          durationMs: Date.now() - startedAt,
          errorCategory: "provider_error",
          retriable: true,
          metadata: {
            statusCode: response.status,
            body: detail.slice(0, 800),
          },
        },
      );

      await capturePosthogEvent({
        event: "voice_session_failed",
        distinctId: userId,
        properties: {
          thread_id: args.threadId,
          status_code: response.status,
          phase: "client_secret",
        },
      });

      const providerMessage = detail.slice(0, 200).replace(/\s+/g, " ").trim();
      throw new Error(
        `Failed to create realtime client secret (${response.status}): ${providerMessage}`,
      );
    }

    const payload = (await response.json()) as {
      value?: string;
      expires_at?: number;
      client_secret?: { value?: string; expires_at?: number };
    };
    const clientSecret = payload.value ?? payload.client_secret?.value;
    const expiresAt = payload.expires_at ?? payload.client_secret?.expires_at;

    if (!clientSecret) {
      throw new Error("Realtime client secret response missing value.");
    }

    await ctx.runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
      userId,
      threadId: args.threadId,
      source: "voice",
      name: "create_realtime_client_secret",
      status: "success",
      durationMs: Date.now() - startedAt,
      model: OPENAI_REALTIME_MODEL,
      metadata: {
        transcriptionModel: OPENAI_TRANSCRIPTION_MODEL,
        expiresAt,
      },
    });

    await capturePosthogEvent({
      event: "voice_session_started",
      distinctId: userId,
      properties: {
        thread_id: args.threadId,
        model: OPENAI_REALTIME_MODEL,
        transcription_model: OPENAI_TRANSCRIPTION_MODEL,
      },
    });

    return {
      clientSecret,
      expiresAt,
      model: OPENAI_REALTIME_MODEL,
      transcriptionModel: OPENAI_TRANSCRIPTION_MODEL,
    };
  },
});

export const executeRealtimeToolCall = action({
  args: {
    threadId: v.string(),
    callId: v.string(),
    toolName: realtimeToolNameValidator,
    argumentsJson: v.string(),
  },
  returns: v.object({
    callId: v.string(),
    toolName: realtimeToolNameValidator,
    success: v.boolean(),
    output: v.any(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.runQuery(internalApi.chat.assertThreadOwner, {
      userId,
      threadId: args.threadId,
    });

    const startedAt = Date.now();
    const input = parseRealtimeToolArguments(args.argumentsJson);
    const toolCtx = createToolExecutionCtx(ctx, userId, args.threadId);

    try {
      const output =
        args.toolName === "create_spark"
          ? await executeRealtimeToolWithCtx({
              tool: createSparkToolForProfile(activeModelProfile),
              ctx: toolCtx,
              callId: args.callId,
              input,
            })
          : await executeRealtimeToolWithCtx({
              tool: createWarningTool,
              ctx: toolCtx,
              callId: args.callId,
              input,
            });

      await ctx.runMutation(
        internalApi.telemetry.insertTelemetryEventInternal,
        {
          userId,
          threadId: args.threadId,
          source: "voice",
          name: `voice_tool_${args.toolName}`,
          status: "success",
          durationMs: Date.now() - startedAt,
          metadata: {
            callId: args.callId,
            toolName: args.toolName,
          },
        },
      );

      return {
        callId: args.callId,
        toolName: args.toolName,
        success: true,
        output,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      await ctx.runMutation(
        internalApi.telemetry.insertTelemetryEventInternal,
        {
          userId,
          threadId: args.threadId,
          source: "voice",
          name: `voice_tool_${args.toolName}`,
          status: "failed",
          durationMs: Date.now() - startedAt,
          errorCategory: "runtime_error",
          retriable: true,
          metadata: {
            callId: args.callId,
            toolName: args.toolName,
            error: message,
          },
        },
      );

      return {
        callId: args.callId,
        toolName: args.toolName,
        success: false,
        output: {
          status: "failed",
          error: message,
        },
      };
    }
  },
});

export const recordVoiceUsage = action({
  args: {
    threadId: v.string(),
    usageType: v.union(
      v.literal("input_transcription"),
      v.literal("realtime_response"),
    ),
    model: v.string(),
    usage: usageValidator,
    providerMetadata: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.runQuery(internalApi.chat.assertThreadOwner, {
      userId,
      threadId: args.threadId,
    });

    const providerEstimatedCostUsd = extractEstimatedCostUsd(
      args.providerMetadata,
    );
    const computedEstimatedCostUsd = computeVoiceEstimatedCostUsd({
      usageType: args.usageType,
      usage: args.usage,
    });

    const estimatedCostUsd =
      providerEstimatedCostUsd ?? computedEstimatedCostUsd ?? undefined;
    const costSource =
      providerEstimatedCostUsd !== undefined
        ? "provider"
        : computedEstimatedCostUsd !== undefined
          ? "computed"
          : "unknown";

    await ctx.runMutation(internalApi.telemetry.insertRawUsageInternal, {
      userId,
      threadId: args.threadId,
      agentName: "shru-voice-transcription",
      model: args.model,
      provider: "openai",
      usage: args.usage,
      providerMetadata: {
        usageType: args.usageType,
        costSource,
        totalCostUsd: estimatedCostUsd,
        estimatedCostUsd,
        ...(args.providerMetadata ?? {}),
      },
    });

    await ctx.runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
      userId,
      threadId: args.threadId,
      source: "voice",
      name: "voice_usage_recorded",
      status: "success",
      model: args.model,
      metadata: {
        usageType: args.usageType,
        totalTokens: args.usage.totalTokens,
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        estimatedCostUsd,
        costSource,
      },
    });

    await capturePosthogEvent({
      event: "voice_usage_recorded",
      distinctId: userId,
      properties: {
        thread_id: args.threadId,
        usage_type: args.usageType,
        model: args.model,
        total_tokens: args.usage.totalTokens ?? 0,
        input_tokens: args.usage.inputTokens ?? 0,
        output_tokens: args.usage.outputTokens ?? 0,
        estimated_cost_usd: estimatedCostUsd,
        cost_source: costSource,
      },
    });

    return null;
  },
});

export const recordVoiceEvent = action({
  args: {
    threadId: v.string(),
    name: v.string(),
    status: v.union(v.literal("success"), v.literal("failed")),
    durationMs: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.runQuery(internalApi.chat.assertThreadOwner, {
      userId,
      threadId: args.threadId,
    });

    await ctx.runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
      userId,
      threadId: args.threadId,
      source: "voice",
      name: args.name,
      status: args.status,
      durationMs: args.durationMs,
      errorCategory: args.status === "failed" ? "voice_error" : undefined,
      retriable: args.status === "failed",
      metadata: args.metadata,
    });

    await capturePosthogEvent({
      event: "voice_event",
      distinctId: userId,
      properties: {
        thread_id: args.threadId,
        name: args.name,
        status: args.status,
        duration_ms: args.durationMs,
        ...(args.metadata ?? {}),
      },
    });

    return null;
  },
});
