"use node";

import { saveMessage } from "@convex-dev/agent";
import { createHash } from "node:crypto";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  action,
  type ActionCtx,
} from "./_generated/server";
import {
  createOpenAIRealtimeClientSecret,
  toVoiceSessionError,
} from "../lib/voice-runtime/realtime2Session";
import {
  defaultRealtimeVoiceModel,
  type VoiceToolName,
  type VoiceSessionError,
} from "../lib/voice-runtime/contracts";
import { activeModelProfile } from "../lib/model-config";
import { createSparkToolForProfile } from "./sparks/tools";
import type {
  CreateSparkToolInput,
  CreateSparkToolResult,
} from "../lib/sparks/contracts";

const internalApi = internal as unknown as {
  chat: {
    assertThreadOwner: FunctionReference<"query", "internal">;
  };
  telemetry: {
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
  voice: {
    recordVoiceSessionCreated: FunctionReference<"mutation", "internal">;
  };
};

const voiceSessionCredentialsValidator = v.object({
  sessionId: v.string(),
  provider: v.literal("openai_realtime"),
  model: v.string(),
  clientSecret: v.object({
    value: v.string(),
    expiresAt: v.optional(v.number()),
  }),
  realtimeUrl: v.string(),
  createdAt: v.number(),
});

const voiceToolResultValidator = v.object({
  status: v.union(
    v.literal("succeeded"),
    v.literal("failed"),
    v.literal("pending_adapter"),
  ),
  summary: v.string(),
  output: v.optional(v.any()),
  error: v.optional(v.string()),
});

async function requireAuthenticatedUserId(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity.subject;
}

function safetyIdentifierForUser(userId: string): string {
  return createHash("sha256").update(`studi:${userId}`).digest("hex");
}

export const createOpenAIRealtimeSession = action({
  args: {
    threadId: v.string(),
  },
  returns: voiceSessionCredentialsValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.runQuery(internalApi.chat.assertThreadOwner, {
      userId,
      threadId: args.threadId,
    });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const error: VoiceSessionError = {
        code: "missing_openai_api_key",
        message:
          "OPENAI_API_KEY is missing. Set it in Convex env vars before starting voice.",
        retriable: false,
        provider: "openai_realtime",
      };
      throw new Error(JSON.stringify(error));
    }

    try {
      const credentials = await createOpenAIRealtimeClientSecret({
        apiKey,
        safetyIdentifier: safetyIdentifierForUser(userId),
        model: defaultRealtimeVoiceModel,
      });

      await ctx.runMutation(internalApi.voice.recordVoiceSessionCreated, {
        userId,
        threadId: args.threadId,
        provider: credentials.provider,
        model: credentials.model,
        clientSessionId: credentials.sessionId,
        createdAt: credentials.createdAt,
        expiresAt: credentials.clientSecret.expiresAt,
      });

      await ctx.runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
        userId,
        threadId: args.threadId,
        source: "voice",
        name: "create_openai_realtime_session",
        status: "success",
        model: credentials.model,
        metadata: {
          provider: credentials.provider,
          expiresAt: credentials.clientSecret.expiresAt,
        },
      });

      return credentials;
    } catch (error) {
      const voiceError = toVoiceSessionError(error);
      await ctx.runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
        userId,
        threadId: args.threadId,
        source: "voice",
        name: "create_openai_realtime_session",
        status: "failed",
        errorCategory: voiceError.code,
        retriable: voiceError.retriable,
        model: defaultRealtimeVoiceModel,
        metadata: {
          provider: voiceError.provider,
          status: voiceError.status,
        },
      });
      throw new Error(JSON.stringify(voiceError));
    }
  },
});

function parseCreateSparkInput(input: unknown): CreateSparkToolInput {
  if (!input || typeof input !== "object") {
    throw new Error("create_spark input must be an object.");
  }

  const candidate = input as Record<string, unknown>;
  const sparkId = candidate.sparkId;
  const context = candidate.context;
  if (typeof sparkId !== "string" || typeof context !== "string") {
    throw new Error("create_spark requires sparkId and context.");
  }

  return {
    sparkId,
    context,
    title: typeof candidate.title === "string" ? candidate.title : undefined,
    summary:
      typeof candidate.summary === "string" ? candidate.summary : undefined,
  } as CreateSparkToolInput;
}

export const runVoiceTool = action({
  args: {
    threadId: v.string(),
    sessionId: v.string(),
    toolCallId: v.string(),
    toolName: v.union(
      v.literal("create_spark"),
      v.literal("open_lab"),
      v.literal("handoff_to_text"),
    ),
    input: v.any(),
  },
  returns: voiceToolResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    await ctx.runQuery(internalApi.chat.assertThreadOwner, {
      userId,
      threadId: args.threadId,
    });

    if (args.toolName === "open_lab") {
      return {
        status: "pending_adapter" as const,
        summary:
          "Labs are pending because the Daytona Labs APIs are not merged in this branch yet.",
      };
    }

    if (args.toolName === "handoff_to_text") {
      const summary =
        args.input &&
        typeof args.input === "object" &&
        typeof (args.input as { summary?: unknown }).summary === "string"
          ? (args.input as { summary: string }).summary
          : "Continue this voice request in text chat.";

      await saveMessage(ctx, components.agent, {
        threadId: args.threadId,
        userId,
        agentName: "studi-voice",
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: `Let's continue this in chat: ${summary}`,
            },
          ],
        },
        metadata: {
          model: defaultRealtimeVoiceModel,
          provider: "openai_realtime",
          providerMetadata: {
            studi: {
              source: "voice_tool",
              sessionId: args.sessionId,
              toolName: args.toolName satisfies VoiceToolName,
              toolCallId: args.toolCallId,
            },
          },
        },
      });

      return {
        status: "succeeded" as const,
        summary: "Added a text handoff message to the thread.",
      };
    }

    try {
      const sparkInput = parseCreateSparkInput(args.input);
      const sparkTool = createSparkToolForProfile(activeModelProfile) as unknown as {
        ctx?: unknown;
        execute: (
          input: CreateSparkToolInput,
          options: { toolCallId: string; abortSignal?: AbortSignal },
        ) => Promise<CreateSparkToolResult>;
      };

      sparkTool.ctx = {
        ...ctx,
        userId,
        threadId: args.threadId,
      };

      const result = await sparkTool.execute(sparkInput, {
        toolCallId: args.toolCallId,
      });

      return {
        status:
          result.status === "success"
            ? ("succeeded" as const)
            : ("failed" as const),
        summary: result.workerSummary,
        output: result,
        error: result.status === "failed" ? result.error : undefined,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: "Voice Spark tool failed.",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
