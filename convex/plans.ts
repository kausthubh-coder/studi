import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type PlanPhase = "discovery" | "draft_review" | "active" | "completed";
type PlanItemStatus = "todo" | "doing" | "done";

type SparkActivity = {
  sparkType: string;
  promptSeed: string;
  artifactId?: string;
};

type LabActivity = {
  objective: string;
  labSessionId?: string;
  requiredOutcomes?: string[];
};

type LearnActivity = {
  topic: string;
  resources?: string[];
};

type PlanChecklistItem = {
  id: string;
  text: string;
  status: PlanItemStatus;
  note?: string;
  updatedAt?: number;
  spark?: SparkActivity;
  lab?: LabActivity;
  learn?: LearnActivity;
};

type PlanNode = {
  id: string;
  title: string;
  kind?: string;
  summary?: string;
  dependsOn?: string[];
  checklist: PlanChecklistItem[];
};

type PlanDocument = {
  title: string;
  goal: string;
  overview?: string;
  nodes: PlanNode[];
};

type PlanSummary = {
  phase: PlanPhase;
  hasDraft: boolean;
  title?: string;
  progressPercent: number;
};

const planPhaseValidator = v.union(
  v.literal("discovery"),
  v.literal("draft_review"),
  v.literal("active"),
  v.literal("completed"),
);

const planItemStatusValidator = v.union(
  v.literal("todo"),
  v.literal("doing"),
  v.literal("done"),
);

const threadPlanValidator = v.object({
  threadId: v.string(),
  phase: planPhaseValidator,
  revision: v.number(),
  title: v.optional(v.string()),
  hasDraft: v.boolean(),
  latestChangeRequest: v.optional(v.string()),
  progressPercent: v.number(),
  totalItems: v.number(),
  completedItems: v.number(),
  draftPlan: v.optional(v.any()),
  acceptedPlan: v.optional(v.any()),
  updatedAt: v.number(),
});

const planSummaryValidator = v.object({
  phase: planPhaseValidator,
  hasDraft: v.boolean(),
  title: v.optional(v.string()),
  progressPercent: v.number(),
});

const planContextItemValidator = v.object({
  nodeId: v.string(),
  nodeTitle: v.string(),
  itemId: v.string(),
  text: v.string(),
  status: planItemStatusValidator,
});

const planContextValidator = v.object({
  phase: planPhaseValidator,
  title: v.optional(v.string()),
  hasDraft: v.boolean(),
  progressPercent: v.number(),
  totalItems: v.number(),
  completedItems: v.number(),
  latestChangeRequest: v.optional(v.string()),
  openItems: v.array(planContextItemValidator),
  checkable: v.boolean(),
});

const planDraftingContextValidator = v.object({
  phase: planPhaseValidator,
  title: v.optional(v.string()),
  latestChangeRequest: v.optional(v.string()),
  draftPlan: v.optional(v.any()),
  acceptedPlan: v.optional(v.any()),
});

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const values = value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
  return values.length > 0 ? values : undefined;
}

function normalizeStatus(value: unknown): PlanItemStatus {
  if (value === "doing") return "doing";
  if (value === "done") return "done";
  return "todo";
}

function normalizeSpark(value: unknown): SparkActivity | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const sparkType = asString(record.sparkType);
  const promptSeed = asString(record.promptSeed);
  if (!sparkType || !promptSeed) return undefined;
  return {
    sparkType,
    promptSeed,
    artifactId: asString(record.artifactId),
  };
}

function normalizeLab(value: unknown): LabActivity | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const objective = asString(record.objective);
  if (!objective) return undefined;
  return {
    objective,
    labSessionId: asString(record.labSessionId),
    requiredOutcomes: asStringArray(record.requiredOutcomes),
  };
}

function normalizeLearn(value: unknown): LearnActivity | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const topic = asString(record.topic);
  if (!topic) return undefined;
  return {
    topic,
    resources: asStringArray(record.resources),
  };
}

function normalizeChecklistItem(
  rawItem: unknown,
  nodeIndex: number,
  itemIndex: number,
): PlanChecklistItem | null {
  if (typeof rawItem === "string") {
    const text = asString(rawItem);
    if (!text) return null;
    return {
      id: `n${nodeIndex + 1}-i${itemIndex + 1}`,
      text,
      status: "todo",
    };
  }

  const record = asRecord(rawItem);
  if (!record) return null;

  const text = asString(record.text);
  if (!text) return null;

  return {
    id: asString(record.id) ?? `n${nodeIndex + 1}-i${itemIndex + 1}`,
    text,
    status: normalizeStatus(record.status),
    note: asString(record.note),
    updatedAt:
      typeof record.updatedAt === "number" ? record.updatedAt : undefined,
    spark: normalizeSpark(record.spark),
    lab: normalizeLab(record.lab),
    learn: normalizeLearn(record.learn),
  };
}

function normalizePlanNode(
  rawNode: unknown,
  nodeIndex: number,
): PlanNode | null {
  const record = asRecord(rawNode);
  if (!record) return null;
  const title = asString(record.title);
  if (!title) return null;

  const source = Array.isArray(record.checklist)
    ? record.checklist
    : Array.isArray(record.items)
      ? record.items
      : [];

  const checklist = source
    .map((item, itemIndex) =>
      normalizeChecklistItem(item, nodeIndex, itemIndex),
    )
    .filter((item): item is PlanChecklistItem => item !== null);

  if (checklist.length === 0) {
    return null;
  }

  return {
    id: asString(record.id) ?? `node-${nodeIndex + 1}`,
    title,
    kind: asString(record.kind),
    summary: asString(record.summary),
    dependsOn: asStringArray(record.dependsOn),
    checklist,
  };
}

function normalizePlanDocument(
  rawPlan: unknown,
  fallbackTitle: string,
): PlanDocument {
  const record = asRecord(rawPlan);
  const rawNodes = Array.isArray(record?.nodes) ? record.nodes : [];
  const nodes = rawNodes
    .map((node, index) => normalizePlanNode(node, index))
    .filter((node): node is PlanNode => node !== null);

  if (nodes.length === 0) {
    return {
      title: fallbackTitle,
      goal:
        asString(record?.goal) ??
        "Build a structured learning track with clear milestones.",
      overview: asString(record?.overview),
      nodes: [
        {
          id: "node-1",
          title: "Kickoff",
          kind: "learn",
          checklist: [
            {
              id: "node-1-item-1",
              text: "Define your first milestone in this thread.",
              status: "todo",
            },
          ],
        },
      ],
    };
  }

  return {
    title: asString(record?.title) ?? fallbackTitle,
    goal: asString(record?.goal) ?? "Achieve the learning objective.",
    overview: asString(record?.overview),
    nodes,
  };
}

function computeProgress(plan: PlanDocument) {
  let totalItems = 0;
  let completedItems = 0;

  for (const node of plan.nodes) {
    for (const item of node.checklist) {
      totalItems += 1;
      if (item.status === "done") {
        completedItems += 1;
      }
    }
  }

  const progressPercent =
    totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  return {
    totalItems,
    completedItems,
    progressPercent,
  };
}

function collectOpenItems(plan: PlanDocument, limit = 12) {
  const openItems: Array<{
    nodeId: string;
    nodeTitle: string;
    itemId: string;
    text: string;
    status: PlanItemStatus;
  }> = [];

  for (const node of plan.nodes) {
    for (const item of node.checklist) {
      if (item.status === "done") continue;
      openItems.push({
        nodeId: node.id,
        nodeTitle: node.title,
        itemId: item.id,
        text: item.text,
        status: item.status,
      });
      if (openItems.length >= limit) {
        return openItems;
      }
    }
  }

  return openItems;
}

function applyItemStatus(
  plan: PlanDocument,
  itemId: string,
  status: PlanItemStatus,
  note: string | undefined,
) {
  let changed = false;
  const now = Date.now();

  const nodes = plan.nodes.map((node) => ({
    ...node,
    checklist: node.checklist.map((item) => {
      if (item.id !== itemId) {
        return item;
      }
      changed = true;
      return {
        ...item,
        status,
        note,
        updatedAt: now,
      };
    }),
  }));

  return {
    changed,
    plan: {
      ...plan,
      nodes,
    },
  };
}

function createLabStarterPlan(
  topic?: string,
  objective?: string,
): PlanDocument {
  const title = topic ? `${topic} Lab Track` : "Lab Learning Track";
  const objectiveText =
    objective ??
    "Build, test, and iterate in the lab until the objective is met.";

  return {
    title,
    goal: objectiveText,
    overview:
      "This plan was created automatically when lab mode started. Update it anytime.",
    nodes: [
      {
        id: "lab-foundation",
        title: "Lab foundation",
        kind: "lab",
        checklist: [
          {
            id: "lab-foundation-1",
            text: "Confirm the lab objective and constraints.",
            status: "todo",
            lab: {
              objective: objectiveText,
            },
          },
          {
            id: "lab-foundation-2",
            text: "Implement a working first version in the lab.",
            status: "todo",
            lab: {
              objective: objectiveText,
            },
          },
          {
            id: "lab-foundation-3",
            text: "Run verification and capture what to improve next.",
            status: "todo",
          },
        ],
      },
    ],
  };
}

async function assertThreadOwner(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  threadId: string,
) {
  const ownedThread = await ctx.db
    .query("userThreads")
    .withIndex("by_userId_and_threadId", (q) =>
      q.eq("userId", userId).eq("threadId", threadId),
    )
    .unique();

  if (!ownedThread) {
    throw new Error("Thread not found");
  }
}

async function upsertDiscoveryPlan(
  ctx: MutationCtx,
  userId: string,
  threadId: string,
  topic: string | undefined,
  latestChangeRequest: string | undefined,
): Promise<PlanSummary> {
  await assertThreadOwner(ctx, userId, threadId);

  const now = Date.now();
  const existing = await ctx.db
    .query("learningPlans")
    .withIndex("by_userId_and_threadId", (q) =>
      q.eq("userId", userId).eq("threadId", threadId),
    )
    .unique();

  const title =
    topic?.trim() || existing?.title || "Personalized Learning Track";

  if (existing) {
    await ctx.db.patch(existing._id, {
      phase: "discovery",
      title,
      latestChangeRequest,
      updatedAt: now,
    });
    return {
      phase: "discovery",
      hasDraft: Boolean(existing.draftPlan),
      title,
      progressPercent: existing.progressPercent,
    };
  }

  await ctx.db.insert("learningPlans", {
    userId,
    threadId,
    phase: "discovery",
    revision: 0,
    title,
    acceptedPlan: undefined,
    draftPlan: undefined,
    latestChangeRequest,
    progressPercent: 0,
    totalItems: 0,
    completedItems: 0,
    createdAt: now,
    updatedAt: now,
  });

  return {
    phase: "discovery",
    hasDraft: false,
    title,
    progressPercent: 0,
  };
}

async function acceptDraft(
  ctx: MutationCtx,
  userId: string,
  threadId: string,
): Promise<PlanSummary> {
  await assertThreadOwner(ctx, userId, threadId);

  const row = await ctx.db
    .query("learningPlans")
    .withIndex("by_userId_and_threadId", (q) =>
      q.eq("userId", userId).eq("threadId", threadId),
    )
    .unique();

  if (!row || !row.draftPlan) {
    throw new Error("No draft plan to accept");
  }

  const normalized = normalizePlanDocument(
    row.draftPlan,
    row.title ?? "Personalized Learning Track",
  );
  const progress = computeProgress(normalized);
  const nextPhase: PlanPhase =
    progress.totalItems > 0 && progress.totalItems === progress.completedItems
      ? "completed"
      : "active";

  await ctx.db.patch(row._id, {
    phase: nextPhase,
    revision: row.revision + 1,
    title: normalized.title,
    acceptedPlan: normalized,
    draftPlan: undefined,
    progressPercent: progress.progressPercent,
    totalItems: progress.totalItems,
    completedItems: progress.completedItems,
    updatedAt: Date.now(),
  });

  return {
    phase: nextPhase,
    hasDraft: false,
    title: normalized.title,
    progressPercent: progress.progressPercent,
  };
}

async function setItemStatus(
  ctx: MutationCtx,
  userId: string,
  threadId: string,
  itemId: string,
  status: PlanItemStatus,
  note: string | undefined,
): Promise<PlanSummary> {
  await assertThreadOwner(ctx, userId, threadId);

  const row = await ctx.db
    .query("learningPlans")
    .withIndex("by_userId_and_threadId", (q) =>
      q.eq("userId", userId).eq("threadId", threadId),
    )
    .unique();

  if (!row || !row.acceptedPlan) {
    throw new Error("No active plan found");
  }

  const acceptedPlan = normalizePlanDocument(
    row.acceptedPlan,
    row.title ?? "Personalized Learning Track",
  );
  const updated = applyItemStatus(acceptedPlan, itemId, status, note);
  if (!updated.changed) {
    throw new Error("Plan item not found");
  }

  const progress = computeProgress(updated.plan);
  const nextPhase: PlanPhase =
    progress.totalItems > 0 && progress.totalItems === progress.completedItems
      ? "completed"
      : "active";

  await ctx.db.patch(row._id, {
    phase: nextPhase,
    acceptedPlan: updated.plan,
    progressPercent: progress.progressPercent,
    totalItems: progress.totalItems,
    completedItems: progress.completedItems,
    updatedAt: Date.now(),
  });

  return {
    phase: nextPhase,
    hasDraft: Boolean(row.draftPlan),
    title: row.title,
    progressPercent: progress.progressPercent,
  };
}

export const getThreadPlan = query({
  args: {
    threadId: v.string(),
  },
  returns: v.union(v.null(), threadPlanValidator),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    await assertThreadOwner(ctx, identity.subject, args.threadId);

    const row = await ctx.db
      .query("learningPlans")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", identity.subject).eq("threadId", args.threadId),
      )
      .unique();

    if (!row) {
      return null;
    }

    return {
      threadId: row.threadId,
      phase: row.phase,
      revision: row.revision,
      title: row.title,
      hasDraft: Boolean(row.draftPlan),
      latestChangeRequest: row.latestChangeRequest,
      progressPercent: row.progressPercent,
      totalItems: row.totalItems,
      completedItems: row.completedItems,
      draftPlan: row.draftPlan,
      acceptedPlan: row.acceptedPlan,
      updatedAt: row.updatedAt,
    };
  },
});

export const startPlanMode = mutation({
  args: {
    threadId: v.string(),
    topic: v.optional(v.string()),
  },
  returns: planSummaryValidator,
  handler: async (ctx, args): Promise<PlanSummary> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    return await upsertDiscoveryPlan(
      ctx,
      identity.subject,
      args.threadId,
      args.topic,
      undefined,
    );
  },
});

export const requestPlanChanges = mutation({
  args: {
    threadId: v.string(),
    feedback: v.string(),
  },
  returns: planSummaryValidator,
  handler: async (ctx, args): Promise<PlanSummary> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    return await upsertDiscoveryPlan(
      ctx,
      identity.subject,
      args.threadId,
      undefined,
      args.feedback,
    );
  },
});

export const acceptDraftPlan = mutation({
  args: {
    threadId: v.string(),
  },
  returns: planSummaryValidator,
  handler: async (ctx, args): Promise<PlanSummary> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    return await acceptDraft(ctx, identity.subject, args.threadId);
  },
});

export const setPlanItemStatus = mutation({
  args: {
    threadId: v.string(),
    itemId: v.string(),
    status: planItemStatusValidator,
    note: v.optional(v.string()),
  },
  returns: planSummaryValidator,
  handler: async (ctx, args): Promise<PlanSummary> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    return await setItemStatus(
      ctx,
      identity.subject,
      args.threadId,
      args.itemId,
      args.status,
      args.note,
    );
  },
});

export const getPlanSummaryForThreadInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.union(v.null(), planSummaryValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("learningPlans")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (!row) {
      return null;
    }

    return {
      phase: row.phase,
      hasDraft: Boolean(row.draftPlan),
      title: row.title,
      progressPercent: row.progressPercent,
    };
  },
});

export const getPlanContextForAgentInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.union(v.null(), planContextValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("learningPlans")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (!row) {
      return null;
    }

    const activePlan = row.acceptedPlan
      ? normalizePlanDocument(row.acceptedPlan, row.title ?? "Learning Track")
      : row.draftPlan
        ? normalizePlanDocument(row.draftPlan, row.title ?? "Learning Draft")
        : null;

    return {
      phase: row.phase,
      title: row.title,
      hasDraft: Boolean(row.draftPlan),
      progressPercent: row.progressPercent,
      totalItems: row.totalItems,
      completedItems: row.completedItems,
      latestChangeRequest: row.latestChangeRequest,
      openItems: activePlan ? collectOpenItems(activePlan) : [],
      checkable: Boolean(row.acceptedPlan),
    };
  },
});

export const getPlanDraftingContextInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.union(v.null(), planDraftingContextValidator),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("learningPlans")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (!row) {
      return null;
    }

    return {
      phase: row.phase,
      title: row.title,
      latestChangeRequest: row.latestChangeRequest,
      draftPlan: row.draftPlan,
      acceptedPlan: row.acceptedPlan,
    };
  },
});

export const startPlanModeInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    topic: v.optional(v.string()),
    latestChangeRequest: v.optional(v.string()),
  },
  returns: planSummaryValidator,
  handler: async (ctx, args): Promise<PlanSummary> => {
    return await upsertDiscoveryPlan(
      ctx,
      args.userId,
      args.threadId,
      args.topic,
      args.latestChangeRequest,
    );
  },
});

export const requestPlanChangesInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    feedback: v.string(),
  },
  returns: planSummaryValidator,
  handler: async (ctx, args): Promise<PlanSummary> => {
    return await upsertDiscoveryPlan(
      ctx,
      args.userId,
      args.threadId,
      undefined,
      args.feedback,
    );
  },
});

export const savePlanDraftInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    draftPlan: v.any(),
    latestChangeRequest: v.optional(v.string()),
  },
  returns: planSummaryValidator,
  handler: async (ctx, args): Promise<PlanSummary> => {
    await assertThreadOwner(ctx, args.userId, args.threadId);

    const now = Date.now();
    const existing = await ctx.db
      .query("learningPlans")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    const normalizedDraft = normalizePlanDocument(
      args.draftPlan,
      existing?.title ?? "Personalized Learning Track",
    );

    if (!existing) {
      await ctx.db.insert("learningPlans", {
        userId: args.userId,
        threadId: args.threadId,
        phase: "draft_review",
        revision: 0,
        title: normalizedDraft.title,
        acceptedPlan: undefined,
        draftPlan: normalizedDraft,
        latestChangeRequest: args.latestChangeRequest,
        progressPercent: 0,
        totalItems: 0,
        completedItems: 0,
        createdAt: now,
        updatedAt: now,
      });

      return {
        phase: "draft_review",
        hasDraft: true,
        title: normalizedDraft.title,
        progressPercent: 0,
      };
    }

    await ctx.db.patch(existing._id, {
      phase: "draft_review",
      title: normalizedDraft.title,
      draftPlan: normalizedDraft,
      latestChangeRequest: args.latestChangeRequest,
      updatedAt: now,
    });

    return {
      phase: "draft_review",
      hasDraft: true,
      title: normalizedDraft.title,
      progressPercent: existing.progressPercent,
    };
  },
});

export const acceptDraftPlanInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: planSummaryValidator,
  handler: async (ctx, args): Promise<PlanSummary> => {
    return await acceptDraft(ctx, args.userId, args.threadId);
  },
});

export const setPlanItemStatusInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    itemId: v.string(),
    status: planItemStatusValidator,
    note: v.optional(v.string()),
  },
  returns: planSummaryValidator,
  handler: async (ctx, args): Promise<PlanSummary> => {
    return await setItemStatus(
      ctx,
      args.userId,
      args.threadId,
      args.itemId,
      args.status,
      args.note,
    );
  },
});

export const ensureLabPlanInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    topic: v.optional(v.string()),
    objective: v.optional(v.string()),
  },
  returns: v.object({
    created: v.boolean(),
    phase: planPhaseValidator,
    progressPercent: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    created: boolean;
    phase: PlanPhase;
    progressPercent: number;
  }> => {
    await assertThreadOwner(ctx, args.userId, args.threadId);

    const existing = await ctx.db
      .query("learningPlans")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (existing) {
      return {
        created: false,
        phase: existing.phase as PlanPhase,
        progressPercent: existing.progressPercent,
      };
    }

    const starterPlan = createLabStarterPlan(args.topic, args.objective);
    const progress = computeProgress(starterPlan);
    const now = Date.now();

    await ctx.db.insert("learningPlans", {
      userId: args.userId,
      threadId: args.threadId,
      phase: "active",
      revision: 1,
      title: starterPlan.title,
      acceptedPlan: starterPlan,
      draftPlan: undefined,
      latestChangeRequest: undefined,
      progressPercent: progress.progressPercent,
      totalItems: progress.totalItems,
      completedItems: progress.completedItems,
      createdAt: now,
      updatedAt: now,
    });

    return {
      created: true,
      phase: "active",
      progressPercent: progress.progressPercent,
    };
  },
});

export const deletePlanForThreadInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("learningPlans")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", args.userId).eq("threadId", args.threadId),
      )
      .unique();

    if (!existing) {
      return false;
    }

    await ctx.db.delete(existing._id);
    return true;
  },
});
