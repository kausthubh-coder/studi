import { v } from "convex/values";

export const trackPhaseValidator = v.union(
  v.literal("discovery"),
  v.literal("draft_review"),
  v.literal("active"),
  v.literal("completed"),
);

export const trackItemStatusValidator = v.union(
  v.literal("pending"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("skipped"),
);

export const trackLinkedActivityValidator = v.object({
  kind: v.union(
    v.literal("spark"),
    v.literal("lab"),
    v.literal("message"),
    v.literal("external"),
  ),
  id: v.string(),
  itemId: v.optional(v.string()),
  title: v.optional(v.string()),
  href: v.optional(v.string()),
});

export const trackItemValidator = v.object({
  id: v.string(),
  title: v.string(),
  summary: v.optional(v.string()),
  objective: v.optional(v.string()),
  status: trackItemStatusValidator,
  linkedActivities: v.array(trackLinkedActivityValidator),
});

export const trackMilestoneValidator = v.object({
  id: v.string(),
  title: v.string(),
  summary: v.optional(v.string()),
  items: v.array(trackItemValidator),
});

export const learningTrackValidator = v.object({
  title: v.string(),
  summary: v.string(),
  learnerGoal: v.optional(v.string()),
  estimatedMinutes: v.optional(v.number()),
  milestones: v.array(trackMilestoneValidator),
});

export const trackProgressValidator = v.object({
  currentItemId: v.optional(v.string()),
  completedItemIds: v.array(v.string()),
  skippedItemIds: v.array(v.string()),
  updatedAt: v.number(),
});
