"use node";

import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { capturePosthogEvent } from "./posthog";

const OPENAI_REALTIME_MODEL = "gpt-realtime-mini";
const OPENAI_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

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
            instructions:
              "You are a transcription transport session for Studi voice mode. Do not generate assistant responses.",
            turn_detection: {
              type: "server_vad",
              create_response: false,
            },
            input_audio_transcription: {
              model: OPENAI_TRANSCRIPTION_MODEL,
            },
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

      throw new Error(
        `Failed to create realtime client secret (${response.status}).`,
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

    await ctx.runMutation(internalApi.telemetry.insertRawUsageInternal, {
      userId,
      threadId: args.threadId,
      agentName: "shru-voice-transcription",
      model: args.model,
      provider: "openai",
      usage: args.usage,
      providerMetadata: {
        usageType: args.usageType,
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
