import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

const internalApi = internal as unknown as {
  waitlistActions: {
    syncWaitlistEntry: FunctionReference<"action", "internal">;
  };
};

const waitlistStatusValidator = v.union(
  v.literal("queued"),
  v.literal("synced"),
  v.literal("failed"),
);
type WaitlistStatus = "queued" | "synced" | "failed";

function toWaitlistStatus(value: unknown): WaitlistStatus {
  if (value === "synced") {
    return "synced";
  }
  if (value === "failed") {
    return "failed";
  }
  return "queued";
}

const waitlistWebhookEventValidator = v.object({
  _id: v.id("waitlistWebhookEvents"),
  _creationTime: v.number(),
  source: v.literal("tally_waitlist"),
  dedupeKey: v.string(),
  eventId: v.optional(v.string()),
  submissionId: v.optional(v.string()),
  formId: v.optional(v.string()),
  emailAddress: v.string(),
  payload: v.any(),
  status: waitlistStatusValidator,
  attempts: v.number(),
  lastError: v.optional(v.string()),
  clerkWaitlistEntryId: v.optional(v.string()),
  receivedAt: v.number(),
  lastAttemptAt: v.optional(v.number()),
  processedAt: v.optional(v.number()),
});

export const ingestTallyWebhook = internalMutation({
  args: {
    dedupeKey: v.string(),
    eventId: v.optional(v.string()),
    submissionId: v.optional(v.string()),
    formId: v.optional(v.string()),
    emailAddress: v.string(),
    payload: v.any(),
    receivedAt: v.number(),
  },
  returns: v.object({
    eventDocId: v.id("waitlistWebhookEvents"),
    deduped: v.boolean(),
    status: waitlistStatusValidator,
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("waitlistWebhookEvents")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", args.dedupeKey))
      .unique();

    if (existing) {
      return {
        eventDocId: existing._id,
        deduped: true,
        status: toWaitlistStatus(existing.status),
      };
    }

    const eventDocId = await ctx.db.insert("waitlistWebhookEvents", {
      source: "tally_waitlist",
      dedupeKey: args.dedupeKey,
      eventId: args.eventId,
      submissionId: args.submissionId,
      formId: args.formId,
      emailAddress: args.emailAddress,
      payload: args.payload,
      status: "queued",
      attempts: 0,
      receivedAt: args.receivedAt,
    });

    await ctx.scheduler.runAfter(0, internalApi.waitlistActions.syncWaitlistEntry, {
      eventDocId,
    });

    return {
      eventDocId,
      deduped: false,
      status: "queued" as const,
    };
  },
});

export const getWaitlistWebhookEventInternal = internalQuery({
  args: {
    eventDocId: v.id("waitlistWebhookEvents"),
  },
  returns: v.union(waitlistWebhookEventValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.eventDocId);
  },
});

export const startSyncAttemptInternal = internalMutation({
  args: {
    eventDocId: v.id("waitlistWebhookEvents"),
    startedAt: v.number(),
  },
  returns: v.object({
    shouldProcess: v.boolean(),
    emailAddress: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.eventDocId);
    if (!doc) {
      return { shouldProcess: false };
    }

    if (doc.status === "synced") {
      return { shouldProcess: false, emailAddress: doc.emailAddress };
    }

    await ctx.db.patch(doc._id, {
      attempts: doc.attempts + 1,
      lastAttemptAt: args.startedAt,
    });

    return {
      shouldProcess: true,
      emailAddress: doc.emailAddress,
    };
  },
});

export const markWaitlistSyncedInternal = internalMutation({
  args: {
    eventDocId: v.id("waitlistWebhookEvents"),
    clerkWaitlistEntryId: v.string(),
    processedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.eventDocId);
    if (!doc || doc.status === "synced") {
      return null;
    }

    await ctx.db.patch(doc._id, {
      status: "synced",
      clerkWaitlistEntryId: args.clerkWaitlistEntryId,
      processedAt: args.processedAt,
    });

    return null;
  },
});

export const markWaitlistFailedInternal = internalMutation({
  args: {
    eventDocId: v.id("waitlistWebhookEvents"),
    error: v.string(),
    processedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.eventDocId);
    if (!doc || doc.status === "synced") {
      return null;
    }

    await ctx.db.patch(doc._id, {
      status: "failed",
      lastError: args.error,
      processedAt: args.processedAt,
    });

    return null;
  },
});
