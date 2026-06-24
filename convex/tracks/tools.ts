"use node";

import { createTool } from "@convex-dev/agent";
import type { FunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
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
        try {
          const { userId, threadId } = requireToolContext(ctx);
          const track = await ctx.runMutation(
            internalApi.tracks.upsertDraftTrackInternal,
            {
              userId,
              threadId,
              draftTrack: args.track,
              revisionNote: args.sourcePrompt,
            },
          );

          return toTrackToolResult(track, "Drafted a Track for review.");
        } catch (error) {
          return {
            status: "failed",
            summary: "Track draft failed.",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    revise_track: createTool({
      description:
        "Revise the current draft Track after learner feedback. Provide the full revised Track, not a patch.",
      args: reviseTrackToolInputSchema,
      handler: async (ctx, args): Promise<TrackToolResult> => {
        try {
          const { userId, threadId } = requireToolContext(ctx);
          const track = await ctx.runMutation(
            internalApi.tracks.upsertDraftTrackInternal,
            {
              userId,
              threadId,
              draftTrack: args.track,
              revisionNote: args.revisionNote,
            },
          );

          return toTrackToolResult(track, "Revised the Track draft.");
        } catch (error) {
          return {
            status: "failed",
            summary: "Track revision failed.",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    accept_track: createTool({
      description:
        "Accept and start the current Track for this thread after the learner agrees.",
      args: acceptTrackToolInputSchema,
      handler: async (ctx, args): Promise<TrackToolResult> => {
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

          return toTrackToolResult(track, "Started the Track.");
        } catch (error) {
          return {
            status: "failed",
            summary: "Track accept failed.",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    mark_track_item: createTool({
      description:
        "Update progress for one Track item in the current thread after the learner completes, skips, or resumes it.",
      args: markTrackItemToolInputSchema,
      handler: async (ctx, args): Promise<TrackToolResult> => {
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

          return toTrackToolResult(track, "Updated Track progress.");
        } catch (error) {
          return {
            status: "failed",
            summary: "Track progress update failed.",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    link_track_activity: createTool({
      description:
        "Link a Spark, future Lab, message, or external activity to a Track item.",
      args: linkTrackActivityToolInputSchema,
      handler: async (ctx, args): Promise<TrackToolResult> => {
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

          return toTrackToolResult(track, "Linked activity to the Track.");
        } catch (error) {
          return {
            status: "failed",
            summary: "Track activity link failed.",
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),
  };
}
