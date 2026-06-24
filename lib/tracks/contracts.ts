export type TrackPhase =
  | "discovery"
  | "draft_review"
  | "active"
  | "completed";

export type TrackItemStatus =
  | "pending"
  | "active"
  | "completed"
  | "skipped";

export type TrackLinkedActivityKind =
  | "spark"
  | "lab"
  | "message"
  | "external";

export type TrackLinkedActivityReference = {
  kind: TrackLinkedActivityKind;
  id: string;
  itemId?: string;
  title?: string;
  href?: string;
};

export type TrackItem = {
  id: string;
  title: string;
  summary?: string;
  objective?: string;
  status: TrackItemStatus;
  linkedActivities: TrackLinkedActivityReference[];
};

export type TrackMilestone = {
  id: string;
  title: string;
  summary?: string;
  items: TrackItem[];
};

export type LearningTrack = {
  title: string;
  summary: string;
  learnerGoal?: string;
  estimatedMinutes?: number;
  milestones: TrackMilestone[];
};

export type TrackProgress = {
  currentItemId?: string;
  completedItemIds: string[];
  skippedItemIds: string[];
  updatedAt: number;
};

export type TrackToolResult = {
  status: "success" | "failed";
  summary: string;
  trackId?: string;
  phase?: TrackPhase;
  revision?: number;
  track?: LearningTrack;
  progress?: TrackProgress;
  error?: string;
};

const FALLBACK_TRACK_TITLE = "Learning track";
const FALLBACK_TRACK_SUMMARY = "A focused path for this thread.";
const MAX_TITLE_LENGTH = 90;
const MAX_SUMMARY_LENGTH = 240;
const MAX_MILESTONES = 6;
const MAX_ITEMS_PER_MILESTONE = 8;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(
  value: unknown,
  fallback: string,
  maxLength = MAX_SUMMARY_LENGTH,
): string {
  const text =
    typeof value === "string" && value.trim().length > 0
      ? value.trim()
      : fallback;
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
}

function optionalCleanText(
  value: unknown,
  maxLength = MAX_SUMMARY_LENGTH,
): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  return cleanText(value, "", maxLength);
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function uniqueId(base: string, seen: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (seen.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  seen.add(candidate);
  return candidate;
}

export function isTrackItemStatus(value: unknown): value is TrackItemStatus {
  return (
    value === "pending" ||
    value === "active" ||
    value === "completed" ||
    value === "skipped"
  );
}

export function isTrackPhase(value: unknown): value is TrackPhase {
  return (
    value === "discovery" ||
    value === "draft_review" ||
    value === "active" ||
    value === "completed"
  );
}

export function normalizeLinkedActivityReference(
  value: unknown,
): TrackLinkedActivityReference | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const kind =
    record.kind === "spark" ||
    record.kind === "lab" ||
    record.kind === "message" ||
    record.kind === "external"
      ? record.kind
      : "external";

  const id = cleanText(record.id, "", 120);
  if (!id) {
    return null;
  }

  return {
    kind,
    id,
    itemId: optionalCleanText(record.itemId, 90),
    title: optionalCleanText(record.title, MAX_TITLE_LENGTH),
    href: optionalCleanText(record.href, 300),
  };
}

function normalizeItem(
  value: unknown,
  milestoneIndex: number,
  itemIndex: number,
  seenIds: Set<string>,
): TrackItem {
  const record = asRecord(value) ?? {};
  const title = cleanText(
    record.title,
    `Step ${itemIndex + 1}`,
    MAX_TITLE_LENGTH,
  );
  const explicitId = optionalCleanText(record.id, 80);
  const id = uniqueId(
    slugify(explicitId ?? title, `m${milestoneIndex + 1}-step-${itemIndex + 1}`),
    seenIds,
  );
  const linkedActivities = Array.isArray(record.linkedActivities)
    ? record.linkedActivities
        .map(normalizeLinkedActivityReference)
        .filter(
          (activity): activity is TrackLinkedActivityReference =>
            activity !== null,
        )
    : [];

  return {
    id,
    title,
    summary: optionalCleanText(record.summary),
    objective: optionalCleanText(record.objective),
    status: isTrackItemStatus(record.status) ? record.status : "pending",
    linkedActivities,
  };
}

function fallbackMilestone(goal: string): TrackMilestone {
  const seenIds = new Set<string>();
  return {
    id: "starter-path",
    title: "Starter path",
    summary: goal,
    items: [
      normalizeItem(
        {
          id: "clarify-goal",
          title: "Clarify the goal",
          summary: "Name what you want to understand and why it matters.",
        },
        0,
        0,
        seenIds,
      ),
      normalizeItem(
        {
          id: "build-intuition",
          title: "Build intuition",
          summary: "Use a tiny example or Spark to make the idea visible.",
        },
        0,
        1,
        seenIds,
      ),
      normalizeItem(
        {
          id: "prove-it",
          title: "Prove it",
          summary: "Solve one check without help and explain the reason.",
        },
        0,
        2,
        seenIds,
      ),
    ],
  };
}

export function normalizeLearningTrackDraft(input: unknown): LearningTrack {
  const record = asRecord(input) ?? {};
  const title = cleanText(record.title, FALLBACK_TRACK_TITLE, MAX_TITLE_LENGTH);
  const summary = cleanText(record.summary, FALLBACK_TRACK_SUMMARY);
  const learnerGoal = optionalCleanText(record.learnerGoal ?? record.goal);
  const estimatedMinutes =
    typeof record.estimatedMinutes === "number" &&
    Number.isFinite(record.estimatedMinutes)
      ? Math.max(5, Math.min(600, Math.round(record.estimatedMinutes)))
      : undefined;
  const seenIds = new Set<string>();
  const rawMilestones = Array.isArray(record.milestones)
    ? record.milestones.slice(0, MAX_MILESTONES)
    : [];

  const milestones = rawMilestones
    .map((milestone, milestoneIndex): TrackMilestone => {
      const milestoneRecord = asRecord(milestone) ?? {};
      const milestoneTitle = cleanText(
        milestoneRecord.title,
        `Milestone ${milestoneIndex + 1}`,
        MAX_TITLE_LENGTH,
      );
      const milestoneId = uniqueId(
        slugify(
          optionalCleanText(milestoneRecord.id, 80) ?? milestoneTitle,
          `milestone-${milestoneIndex + 1}`,
        ),
        seenIds,
      );
      const items = Array.isArray(milestoneRecord.items)
        ? milestoneRecord.items
            .slice(0, MAX_ITEMS_PER_MILESTONE)
            .map((item, itemIndex) =>
              normalizeItem(item, milestoneIndex, itemIndex, seenIds),
            )
        : [];

      return {
        id: milestoneId,
        title: milestoneTitle,
        summary: optionalCleanText(milestoneRecord.summary),
        items,
      };
    })
    .filter((milestone) => milestone.items.length > 0);

  return {
    title,
    summary,
    learnerGoal,
    estimatedMinutes,
    milestones:
      milestones.length > 0
        ? milestones
        : [fallbackMilestone(learnerGoal ?? summary)],
  };
}

export function listTrackItemIds(track: LearningTrack): string[] {
  return track.milestones.flatMap((milestone) =>
    milestone.items.map((item) => item.id),
  );
}

export function selectTrackForPhase<T>(track: {
  phase?: TrackPhase;
  draftTrack?: T;
  acceptedTrack?: T;
}): T | undefined {
  return track.phase === "draft_review"
    ? track.draftTrack ?? track.acceptedTrack
    : track.acceptedTrack ?? track.draftTrack;
}

export function normalizeTrackProgress(
  track: LearningTrack,
  progress?: Partial<TrackProgress>,
  now = Date.now(),
): TrackProgress {
  const itemIds = new Set(listTrackItemIds(track));
  const completedItemIds = Array.from(
    new Set(progress?.completedItemIds ?? []),
  ).filter((id) => itemIds.has(id));
  const skippedItemIds = Array.from(
    new Set(progress?.skippedItemIds ?? []),
  ).filter((id) => itemIds.has(id) && !completedItemIds.includes(id));
  const currentItemId =
    progress?.currentItemId && itemIds.has(progress.currentItemId)
      ? progress.currentItemId
      : listTrackItemIds(track).find(
          (id) => !completedItemIds.includes(id) && !skippedItemIds.includes(id),
        );

  return {
    currentItemId,
    completedItemIds,
    skippedItemIds,
    updatedAt: now,
  };
}

export function applyProgressToTrack(
  track: LearningTrack,
  progress: TrackProgress,
): LearningTrack {
  const completed = new Set(progress.completedItemIds);
  const skipped = new Set(progress.skippedItemIds);

  return {
    ...track,
    milestones: track.milestones.map((milestone) => ({
      ...milestone,
      items: milestone.items.map((item) => ({
        ...item,
        status: completed.has(item.id)
          ? "completed"
          : skipped.has(item.id)
            ? "skipped"
            : item.id === progress.currentItemId
              ? "active"
              : "pending",
      })),
    })),
  };
}

export function isTrackComplete(
  track: LearningTrack,
  progress: TrackProgress,
): boolean {
  const itemIds = listTrackItemIds(track);
  const finished = new Set([
    ...progress.completedItemIds,
    ...progress.skippedItemIds,
  ]);
  return itemIds.length > 0 && itemIds.every((id) => finished.has(id));
}
