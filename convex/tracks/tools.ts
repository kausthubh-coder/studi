"use node";

import { createTool } from "@convex-dev/agent";
import type { FunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  classifyProviderError,
  toProviderErrorMessage,
} from "../../lib/observability/contracts";
import {
  normalizeLearningTrackDraft,
  selectTrackForPhase,
  type TrackToolResult,
} from "../../lib/tracks/contracts";
import {
  acceptTrackToolInputSchema,
  draftTrackToolInputSchema,
  linkTrackActivityToolInputSchema,
  markTrackItemToolInputSchema,
  reviseTrackToolInputSchema,
} from "./schemas";

const internalApi = internal as unknown as {
  tracks: {
    upsertDraftTrackInternal: FunctionReference<"mutation", "internal">;
    acceptCurrentTrackInternal: FunctionReference<"mutation", "internal">;
    markItemInternal: FunctionReference<"mutation", "internal">;
    linkActivityInternal: FunctionReference<"mutation", "internal">;
  };
  telemetry: {
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
  quotas: {
    reserveDailyQuotaInternal: FunctionReference<"mutation", "internal">;
  };
};

type TrackToolContext = {
  userId?: string;
  threadId?: string;
  runMutation: (
    ref: FunctionReference<"mutation", "internal">,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
};

function requireToolContext(ctx: { userId?: string; threadId?: string }) {
  if (!ctx.userId) {
    throw new Error("Track tools require an authenticated learner.");
  }
  if (!ctx.threadId) {
    throw new Error("Track tools require an active thread.");
  }
  return {
    userId: ctx.userId,
    threadId: ctx.threadId,
  };
}

async function reserveTrackGeneration(
  ctx: TrackToolContext,
  name: string,
): Promise<{ userId: string; threadId: string }> {
  const { userId, threadId } = requireToolContext(ctx);
  const quota = (await ctx.runMutation(
    internalApi.quotas.reserveDailyQuotaInternal,
    {
      userId,
      threadId,
      action: "track_generation",
      name,
    },
  )) as { allowed: boolean; message?: string };
  if (!quota.allowed) {
    throw new Error(quota.message ?? "Track generation limit reached.");
  }
  return { userId, threadId };
}

async function recordTrackToolTelemetry(
  ctx: TrackToolContext,
  args: {
    name: string;
    startedAt: number;
    status: "success" | "failed";
    error?: unknown;
    metadata?: Record<string, unknown>;
  },
) {
  if (!ctx.userId) return;
  const fault = args.error ? classifyProviderError(args.error) : undefined;
  await ctx
    .runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
      userId: ctx.userId,
      threadId: ctx.threadId,
      source: "track",
      name: args.name,
      status: args.status,
      durationMs: Date.now() - args.startedAt,
      errorCategory: fault?.category,
      retriable: fault?.retriable,
      metadata: {
        ...args.metadata,
        error: fault?.message,
      },
    })
    .catch((telemetryError) => {
      console.error("Failed to store track tool telemetry", telemetryError);
    });
}

function toTrackToolResult(
  track: {
    _id: Id<"learningTracks">;
    phase: TrackToolResult["phase"];
    revision: number;
    draftTrack?: unknown;
    acceptedTrack?: unknown;
    progress?: TrackToolResult["progress"];
  },
  summary: string,
): TrackToolResult {
  const learningTrack = selectTrackForPhase(track);
  return {
    status: "success",
    summary,
    trackId: track._id,
    phase: track.phase,
    revision: track.revision,
    track: learningTrack
      ? normalizeLearningTrackDraft(learningTrack)
      : undefined,
    progress: track.progress,
  };
}

export function buildTrackToolset() {
  return {
    draft_track: createTool({
      description:
        "Create or replace the draft Track for this chat thread. Use this when the learner wants a plan, roadmap, sequence, syllabus, or learning track.",
      args: draftTrackToolInputSchema,
      handler: async (ctx, args): Promise<TrackToolResult> => {
        const startedAt = Date.now();
        try {
          const { userId, threadId } = await reserveTrackGeneration(
            ctx,
            "draft_track",
          );
          const track = await ctx.runMutation(
            internalApi.tracks.upsertDraftTrackInternal,
            {
              userId,
              threadId,
              draftTrack: args.track,
              revisionNote: args.sourcePrompt,
            },
          );

          await recordTrackToolTelemetry(ctx, {
            name: "draft_track",
            startedAt,
            status: "success",
            metadata: { trackId: track._id, phase: track.phase },
          });

          return toTrackToolResult(track, "Drafted a Track for review.");
        } catch (error) {
          await recordTrackToolTelemetry(ctx, {
            name: "draft_track",
            startedAt,
            status: "failed",
            error,
          });
          return {
            status: "failed",
            summary: "Track draft failed.",
            error: toProviderErrorMessage(error),
          };
        }
      },
    }),

    revise_track: createTool({
      description:
        "Revise the current draft Track after learner feedback. Provide the full revised Track, not a patch.",
      args: reviseTrackToolInputSchema,
      handler: async (ctx, args): Promise<TrackToolResult> => {
        const startedAt = Date.now();
        try {
          const { userId, threadId } = await reserveTrackGeneration(
            ctx,
            "revise_track",
          );
          const track = await ctx.runMutation(
            internalApi.tracks.upsertDraftTrackInternal,
            {
              userId,
              threadId,
              draftTrack: args.track,
              revisionNote: args.revisionNote,
            },
          );

          await recordTrackToolTelemetry(ctx, {
            name: "revise_track",
            startedAt,
            status: "success",
            metadata: { trackId: track._id, phase: track.phase },
          });

          return toTrackToolResult(track, "Revised the Track draft.");
        } catch (error) {
          await recordTrackToolTelemetry(ctx, {
            name: "revise_track",
            startedAt,
            status: "failed",
            error,
          });
          return {
            status: "failed",
            summary: "Track revision failed.",
            error: toProviderErrorMessage(error),
          };
        }
      },
    }),

    accept_track: createTool({
      description:
        "Accept and start the current Track for this thread after the learner agrees.",
      args: acceptTrackToolInputSchema,
      handler: async (ctx, args): Promise<TrackToolResult> => {
        const startedAt = Date.now();
        try {
          const { userId, threadId } = requireToolContext(ctx);
          const track = await ctx.runMutation(
            internalApi.tracks.acceptCurrentTrackInternal,
            {
              userId,
              threadId,
              trackId: args.trackId as Id<"learningTracks"> | undefined,
            },
          );

          await recordTrackToolTelemetry(ctx, {
            name: "accept_track",
            startedAt,
            status: "success",
            metadata: { trackId: track._id, phase: track.phase },
          });

          return toTrackToolResult(track, "Started the Track.");
        } catch (error) {
          await recordTrackToolTelemetry(ctx, {
            name: "accept_track",
            startedAt,
            status: "failed",
            error,
          });
          return {
            status: "failed",
            summary: "Track accept failed.",
            error: toProviderErrorMessage(error),
          };
        }
      },
    }),

    mark_track_item: createTool({
      description:
        "Update progress for one Track item in the current thread after the learner completes, skips, or resumes it.",
      args: markTrackItemToolInputSchema,
      handler: async (ctx, args): Promise<TrackToolResult> => {
        const startedAt = Date.now();
        try {
          const { userId, threadId } = requireToolContext(ctx);
          const track = await ctx.runMutation(
            internalApi.tracks.markItemInternal,
            {
              userId,
              threadId,
              trackId: args.trackId as Id<"learningTracks"> | undefined,
              itemId: args.itemId,
              status: args.status,
            },
          );

          await recordTrackToolTelemetry(ctx, {
            name: "mark_track_item",
            startedAt,
            status: "success",
            metadata: {
              trackId: track._id,
              phase: track.phase,
              itemId: args.itemId,
              status: args.status,
            },
          });

          return toTrackToolResult(track, "Updated Track progress.");
        } catch (error) {
          await recordTrackToolTelemetry(ctx, {
            name: "mark_track_item",
            startedAt,
            status: "failed",
            error,
            metadata: { itemId: args.itemId, status: args.status },
          });
          return {
            status: "failed",
            summary: "Track progress update failed.",
            error: toProviderErrorMessage(error),
          };
        }
      },
    }),

    link_track_activity: createTool({
      description:
        "Link a Spark, future Lab, message, or external activity to a Track item.",
      args: linkTrackActivityToolInputSchema,
      handler: async (ctx, args): Promise<TrackToolResult> => {
        const startedAt = Date.now();
        try {
          const { userId, threadId } = requireToolContext(ctx);
          const track = await ctx.runMutation(
            internalApi.tracks.linkActivityInternal,
            {
              userId,
              threadId,
              trackId: args.trackId as Id<"learningTracks"> | undefined,
              activity: args.activity,
            },
          );

          await recordTrackToolTelemetry(ctx, {
            name: "link_track_activity",
            startedAt,
            status: "success",
            metadata: {
              trackId: track._id,
              phase: track.phase,
              activityKind: args.activity.kind,
            },
          });

          return toTrackToolResult(track, "Linked activity to the Track.");
        } catch (error) {
          await recordTrackToolTelemetry(ctx, {
            name: "link_track_activity",
            startedAt,
            status: "failed",
            error,
            metadata: { activityKind: args.activity.kind },
          });
          return {
            status: "failed",
            summary: "Track activity link failed.",
            error: toProviderErrorMessage(error),
          };
        }
      },
    }),
  };
}
