import { z } from "zod";

export const trackItemStatusSchema = z.enum([
  "pending",
  "active",
  "completed",
  "skipped",
]);

export const linkedActivitySchema = z.object({
  kind: z.enum(["spark", "lab", "message", "external"]),
  id: z.string().min(1),
  itemId: z.string().optional(),
  title: z.string().optional(),
  href: z.string().optional(),
});

export const trackItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  objective: z.string().optional(),
  status: trackItemStatusSchema.optional(),
  linkedActivities: z.array(linkedActivitySchema).optional(),
});

export const trackMilestoneSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  items: z.array(trackItemSchema).min(1),
});

export const learningTrackSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  learnerGoal: z.string().optional(),
  estimatedMinutes: z.number().optional(),
  milestones: z.array(trackMilestoneSchema).min(1),
});

export const draftTrackToolInputSchema = z.object({
  track: learningTrackSchema,
  sourcePrompt: z.string().optional(),
});

export const reviseTrackToolInputSchema = z.object({
  track: learningTrackSchema,
  revisionNote: z.string().min(1),
});

export const acceptTrackToolInputSchema = z.object({
  trackId: z.string().optional(),
});

export const markTrackItemToolInputSchema = z.object({
  trackId: z.string().optional(),
  itemId: z.string().min(1),
  status: trackItemStatusSchema,
});

export const linkTrackActivityToolInputSchema = z.object({
  trackId: z.string().optional(),
  activity: linkedActivitySchema,
});
