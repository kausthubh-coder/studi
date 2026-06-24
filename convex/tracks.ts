import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  applyProgressToTrack,
  isTrackComplete,
  normalizeLearningTrackDraft,
  normalizeLinkedActivityReference,
  normalizeTrackProgress,
  selectTrackForPhase,
  type LearningTrack,
  type TrackItemStatus,
} from "../lib/tracks/contracts";
import {
  learningTrackValidator,
  trackItemStatusValidator,
  trackLinkedActivityValidator,
  trackPhaseValidator,
  trackProgressValidator,
} from "./tracks/validators";

const trackRecordValidator = v.object({
  _id: v.id("learningTracks"),
  _creationTime: v.number(),
  userId: v.string(),
  threadId: v.string(),
  phase: trackPhaseValidator,
  revision: v.number(),
  draftTrack: v.optional(learningTrackValidator),
  acceptedTrack: v.optional(learningTrackValidator),
  progress: trackProgressValidator,
  linkedActivities: v.array(trackLinkedActivityValidator),
  revisionNote: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

async function requireUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity.subject;
}

async function assertThreadOwner(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  threadId: string,
) {
  const thread = await ctx.db
    .query("userThreads")
    .withIndex("by_userId_and_threadId", (q) =>
      q.eq("userId", userId).eq("threadId", threadId),
    )
    .unique();

  if (!thread) {
    throw new Error("Thread not found");
  }
}

async function getTrackForThread(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  threadId: string,
) {
  return await ctx.db
    .query("learningTracks")
    .withIndex("by_userId_and_threadId", (q) =>
      q.eq("userId", userId).eq("threadId", threadId),
    )
    .unique();
}

async function getOwnedTrackById(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  trackId: Id<"learningTracks">,
) {
  const track = await ctx.db.get(trackId);
  if (!track || track.userId !== userId) {
    throw new Error("Track not found");
  }
  return track;
}

function getTrackDocumentForProgress(track: Doc<"learningTracks">) {
  return track.acceptedTrack ?? track.draftTrack;
}

function updateTrackItemStatus(
  track: LearningTrack,
  itemId: string,
  status: TrackItemStatus,
  previousProgress = normalizeTrackProgress(track),
) {
  const itemIds = new Set(
    track.milestones.flatMap((milestone) =>
      milestone.items.map((item) => item.id),
    ),
  );

  if (!itemIds.has(itemId)) {
    throw new Error("Track item not found");
  }

  const completed = new Set(previousProgress.completedItemIds);
  const skipped = new Set(previousProgress.skippedItemIds);

  completed.delete(itemId);
  skipped.delete(itemId);

  if (status === "completed") {
    completed.add(itemId);
  } else if (status === "skipped") {
    skipped.add(itemId);
  }

  const orderedItemIds = Array.from(itemIds);
  const currentItemId =
    status === "active" || status === "pending"
      ? itemId
      : orderedItemIds.find((id) => !completed.has(id) && !skipped.has(id));

  const progress = normalizeTrackProgress(
    track,
    {
      currentItemId,
      completedItemIds: Array.from(completed),
      skippedItemIds: Array.from(skipped),
    },
    Date.now(),
  );

  return {
    progress,
    track: applyProgressToTrack(track, progress),
  };
}

export const getThreadTrack = query({
  args: {
    threadId: v.string(),
  },
  returns: v.union(v.null(), trackRecordValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertThreadOwner(ctx, userId, args.threadId);
    return await getTrackForThread(ctx, userId, args.threadId);
  },
});

export const requestRevision = mutation({
  args: {
    trackId: v.id("learningTracks"),
    note: v.string(),
  },
  returns: trackRecordValidator,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const track = await getOwnedTrackById(ctx, userId, args.trackId);
    const now = Date.now();
    const note = args.note.trim().slice(0, 500);

    await ctx.db.patch(track._id, {
      phase: "discovery",
      revisionNote: note || undefined,
      updatedAt: now,
    });

    const updated = await ctx.db.get(track._id);
    if (!updated) {
      throw new Error("Track not found");
    }
    return updated;
  },
});

export const acceptDraft = mutation({
  args: {
    trackId: v.id("learningTracks"),
  },
  returns: trackRecordValidator,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const track = await getOwnedTrackById(ctx, userId, args.trackId);
    const draftTrack =
      track.phase === "draft_review"
        ? track.draftTrack
        : selectTrackForPhase(track);
    if (!draftTrack) {
      throw new Error("No track draft to accept");
    }

    const normalized = normalizeLearningTrackDraft(draftTrack);
    const progress = normalizeTrackProgress(normalized);
    const acceptedTrack = applyProgressToTrack(normalized, progress);
    const now = Date.now();

    await ctx.db.patch(track._id, {
      phase: isTrackComplete(acceptedTrack, progress) ? "completed" : "active",
      revision: track.revision + 1,
      acceptedTrack,
      progress,
      revisionNote: undefined,
      updatedAt: now,
    });

    const updated = await ctx.db.get(track._id);
    if (!updated) {
      throw new Error("Track not found");
    }
    return updated;
  },
});

export const markItem = mutation({
  args: {
    trackId: v.id("learningTracks"),
    itemId: v.string(),
    status: trackItemStatusValidator,
  },
  returns: trackRecordValidator,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const track = await getOwnedTrackById(ctx, userId, args.trackId);
    const acceptedTrack = track.acceptedTrack;
    if (!acceptedTrack) {
      throw new Error("Accept the track before updating progress");
    }

    const { progress, track: nextAcceptedTrack } = updateTrackItemStatus(
      acceptedTrack,
      args.itemId,
      args.status,
      track.progress,
    );
    const now = Date.now();

    await ctx.db.patch(track._id, {
      phase: isTrackComplete(nextAcceptedTrack, progress)
        ? "completed"
        : "active",
      acceptedTrack: nextAcceptedTrack,
      progress,
      updatedAt: now,
    });

    const updated = await ctx.db.get(track._id);
    if (!updated) {
      throw new Error("Track not found");
    }
    return updated;
  },
});

export const upsertDraftTrackInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    draftTrack: v.any(),
    revisionNote: v.optional(v.string()),
  },
  returns: trackRecordValidator,
  handler: async (ctx, args) => {
    await assertThreadOwner(ctx, args.userId, args.threadId);

    const draftTrack = normalizeLearningTrackDraft(args.draftTrack);
    const progress = normalizeTrackProgress(draftTrack);
    const now = Date.now();
    const existing = await getTrackForThread(ctx, args.userId, args.threadId);

    if (existing) {
      await ctx.db.patch(existing._id, {
        phase: "draft_review",
        revision: existing.revision + 1,
        draftTrack,
        progress:
          existing.acceptedTrack && existing.phase !== "discovery"
            ? existing.progress
            : progress,
        revisionNote: args.revisionNote?.trim() || undefined,
        updatedAt: now,
      });

      const updated = await ctx.db.get(existing._id);
      if (!updated) {
        throw new Error("Track not found");
      }
      return updated;
    }

    const trackId = await ctx.db.insert("learningTracks", {
      userId: args.userId,
      threadId: args.threadId,
      phase: "draft_review",
      revision: 1,
      draftTrack,
      progress,
      linkedActivities: [],
      revisionNote: args.revisionNote?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });

    const inserted = await ctx.db.get(trackId);
    if (!inserted) {
      throw new Error("Track not found");
    }
    return inserted;
  },
});

export const acceptCurrentTrackInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    trackId: v.optional(v.id("learningTracks")),
  },
  returns: trackRecordValidator,
  handler: async (ctx, args) => {
    await assertThreadOwner(ctx, args.userId, args.threadId);
    const track = args.trackId
      ? await getOwnedTrackById(ctx, args.userId, args.trackId)
      : await getTrackForThread(ctx, args.userId, args.threadId);
    if (!track || track.threadId !== args.threadId) {
      throw new Error("Track not found");
    }

    const draftTrack =
      track.phase === "draft_review"
        ? track.draftTrack
        : selectTrackForPhase(track);
    if (!draftTrack) {
      throw new Error("No track draft to accept");
    }

    const normalized = normalizeLearningTrackDraft(draftTrack);
    const progress = normalizeTrackProgress(normalized);
    const acceptedTrack = applyProgressToTrack(normalized, progress);
    await ctx.db.patch(track._id, {
      phase: isTrackComplete(acceptedTrack, progress) ? "completed" : "active",
      revision: track.revision + 1,
      acceptedTrack,
      progress,
      revisionNote: undefined,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(track._id);
    if (!updated) {
      throw new Error("Track not found");
    }
    return updated;
  },
});

export const markItemInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    trackId: v.optional(v.id("learningTracks")),
    itemId: v.string(),
    status: trackItemStatusValidator,
  },
  returns: trackRecordValidator,
  handler: async (ctx, args) => {
    await assertThreadOwner(ctx, args.userId, args.threadId);
    const track = args.trackId
      ? await getOwnedTrackById(ctx, args.userId, args.trackId)
      : await getTrackForThread(ctx, args.userId, args.threadId);
    if (!track || track.threadId !== args.threadId) {
      throw new Error("Track not found");
    }

    const acceptedTrack = track.acceptedTrack;
    if (!acceptedTrack) {
      throw new Error("Accept the track before updating progress");
    }

    const { progress, track: nextAcceptedTrack } = updateTrackItemStatus(
      acceptedTrack,
      args.itemId,
      args.status,
      track.progress,
    );

    await ctx.db.patch(track._id, {
      phase: isTrackComplete(nextAcceptedTrack, progress)
        ? "completed"
        : "active",
      acceptedTrack: nextAcceptedTrack,
      progress,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(track._id);
    if (!updated) {
      throw new Error("Track not found");
    }
    return updated;
  },
});

export const linkActivityInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    trackId: v.optional(v.id("learningTracks")),
    activity: v.any(),
  },
  returns: trackRecordValidator,
  handler: async (ctx, args) => {
    await assertThreadOwner(ctx, args.userId, args.threadId);
    const activity = normalizeLinkedActivityReference(args.activity);
    if (!activity) {
      throw new Error("Invalid activity reference");
    }

    const track = args.trackId
      ? await getOwnedTrackById(ctx, args.userId, args.trackId)
      : await getTrackForThread(ctx, args.userId, args.threadId);
    if (!track || track.threadId !== args.threadId) {
      throw new Error("Track not found");
    }

    const linkedActivities = [
      ...track.linkedActivities.filter(
        (candidate) =>
          candidate.kind !== activity.kind || candidate.id !== activity.id,
      ),
      activity,
    ];

    const patch: Partial<Doc<"learningTracks">> = {
      linkedActivities,
      updatedAt: Date.now(),
    };

    const activeTrack = getTrackDocumentForProgress(track);
    if (activeTrack && activity.itemId) {
      const attach = (learningTrack: LearningTrack): LearningTrack => ({
        ...learningTrack,
        milestones: learningTrack.milestones.map((milestone) => ({
          ...milestone,
          items: milestone.items.map((item) =>
            item.id === activity.itemId
              ? {
                  ...item,
                  linkedActivities: [
                    ...item.linkedActivities.filter(
                      (candidate) =>
                        candidate.kind !== activity.kind ||
                        candidate.id !== activity.id,
                    ),
                    activity,
                  ],
                }
              : item,
          ),
        })),
      });
      if (track.acceptedTrack) patch.acceptedTrack = attach(track.acceptedTrack);
      if (track.draftTrack) patch.draftTrack = attach(track.draftTrack);
    }

    await ctx.db.patch(track._id, patch);
    const updated = await ctx.db.get(track._id);
    if (!updated) {
      throw new Error("Track not found");
    }
    return updated;
  },
});

export const deleteForThreadInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const tracks = await ctx.db
      .query("learningTracks")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .collect();

    for (const track of tracks) {
      await ctx.db.delete(track._id);
    }

    return tracks.length;
  },
});

export const getByThreadInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.union(v.null(), trackRecordValidator),
  handler: async (ctx, args) => {
    await assertThreadOwner(ctx, args.userId, args.threadId);
    return await getTrackForThread(ctx, args.userId, args.threadId);
  },
});
