"use node";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import type { FunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { activeModelProfile, getModelForRoute } from "../lib/model-config";
import {
  classifyProviderError,
  toProviderErrorMessage,
} from "../lib/observability/contracts";
import {
  normalizeLearningTrackDraft,
  type TrackToolResult,
} from "../lib/tracks/contracts";
import { resolveAgentRole } from "../lib/role-router";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { learningTrackSchema } from "./tracks/schemas";
import {
  learningTrackValidator,
  trackPhaseValidator,
  trackProgressValidator,
} from "./tracks/validators";

const internalApi = internal as unknown as {
  chat: {
    assertThreadOwner: FunctionReference<"query", "internal">;
  };
  tracks: {
    upsertDraftTrackInternal: FunctionReference<"mutation", "internal">;
  };
  telemetry: {
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
  quotas: {
    reserveDailyQuotaInternal: FunctionReference<"mutation", "internal">;
  };
};

type OpenRouterProvider = ReturnType<typeof createOpenRouter>;

let openrouter: OpenRouterProvider | null = null;

function getOpenRouter() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Set it in .env.local and Convex env vars.",
    );
  }

  openrouter ??= createOpenRouter({ apiKey: openRouterApiKey });
  return openrouter;
}

async function requireUserId(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity.subject;
}

function assertQuotaAllowed(quota: {
  allowed: boolean;
  action: string;
  message?: string;
  limit?: number;
  resetAt?: number;
}) {
  if (quota.allowed) return;
  throw new ConvexError({
    code: "QUOTA_EXCEEDED",
    action: quota.action,
    message: quota.message ?? "Daily usage limit reached.",
    limit: quota.limit,
    resetAt: quota.resetAt,
  });
}

export const draftTrackFromGoal = action({
  args: {
    threadId: v.string(),
    goal: v.string(),
    context: v.optional(v.string()),
  },
  returns: v.object({
    status: v.union(v.literal("success"), v.literal("failed")),
    summary: v.string(),
    trackId: v.optional(v.string()),
    phase: v.optional(trackPhaseValidator),
    revision: v.optional(v.number()),
    track: v.optional(learningTrackValidator),
    progress: v.optional(trackProgressValidator),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<TrackToolResult> => {
    const userId = await requireUserId(ctx);
    const startedAt = Date.now();
    await ctx.runQuery(internalApi.chat.assertThreadOwner, {
      userId,
      threadId: args.threadId,
    });

    const role = resolveAgentRole({ requestedCapability: "track" });
    const model = getModelForRoute(role.modelRouteKey, activeModelProfile);
    const prompt = [
      "Draft a compact learning Track for Studi.",
      "Use product language: Track, milestone, step. Do not introduce multiple tutor personas.",
      "Keep the path short enough to use inside a chat thread.",
      "Prefer intuition-first steps, checks for understanding, and optional Spark/Lab references only when useful.",
      `Learner goal: ${args.goal.trim()}`,
      args.context ? `Thread context: ${args.context.trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const quota = (await ctx.runMutation(
        internalApi.quotas.reserveDailyQuotaInternal,
        {
          userId,
          threadId: args.threadId,
          action: "track_generation",
          name: "draft_track_from_goal",
        },
      )) as {
        allowed: boolean;
        action: string;
        message?: string;
        limit?: number;
        resetAt?: number;
      };
      assertQuotaAllowed(quota);

      const result = await generateObject({
        model: getOpenRouter().chat(model),
        schema: learningTrackSchema,
        prompt,
      });
      const draftTrack = normalizeLearningTrackDraft(result.object);
      const track = await ctx.runMutation(
        internalApi.tracks.upsertDraftTrackInternal,
        {
          userId,
          threadId: args.threadId,
          draftTrack,
          revisionNote: args.goal,
        },
      );

      await ctx.runMutation(
        internalApi.telemetry.insertTelemetryEventInternal,
        {
          userId,
          threadId: args.threadId,
          source: "track",
          name: "draft_track_from_goal",
          status: "success",
          durationMs: Date.now() - startedAt,
          model,
          metadata: { phase: track.phase, revision: track.revision },
        },
      );

      return {
        status: "success",
        summary: "Drafted a Track for review.",
        trackId: track._id,
        phase: track.phase,
        revision: track.revision,
        track: track.draftTrack,
        progress: track.progress,
      };
    } catch (error) {
      const fault = classifyProviderError(error);
      await ctx
        .runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
          userId,
          threadId: args.threadId,
          source: "track",
          name: "draft_track_from_goal",
          status: "failed",
          durationMs: Date.now() - startedAt,
          errorCategory: fault.category,
          retriable: fault.retriable,
          model,
          metadata: { error: fault.message },
        })
        .catch((telemetryError) => {
          console.error("Failed to store track telemetry", telemetryError);
        });

      return {
        status: "failed",
        summary: "Track draft failed.",
        error: toProviderErrorMessage(error),
      };
    }
  },
});
