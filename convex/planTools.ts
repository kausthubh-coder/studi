"use node";

import { createTool } from "@convex-dev/agent";
import type { FunctionReference } from "convex/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import { capturePosthogEvent } from "./posthog";

const internalApi = internal as unknown as {
  chat: {
    createThreadRecord: FunctionReference<"mutation", "internal">;
  };
  plans: {
    startPlanModeInternal: FunctionReference<"mutation", "internal">;
    getPlanContextForAgentInternal: FunctionReference<"query", "internal">;
    acceptDraftPlanInternal: FunctionReference<"mutation", "internal">;
    requestPlanChangesInternal: FunctionReference<"mutation", "internal">;
    setPlanItemStatusInternal: FunctionReference<"mutation", "internal">;
  };
  planActions: {
    generatePlanDraft: FunctionReference<"action", "internal">;
  };
  telemetry: {
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

async function recordPlanToolTelemetry(
  ctx: {
    userId?: string;
    threadId?: string;
    runMutation: (
      ref: FunctionReference<"mutation", "internal">,
      args: Record<string, unknown>,
    ) => Promise<unknown>;
  },
  params: {
    name: string;
    status: "success" | "failed";
    durationMs: number;
    metadata?: Record<string, unknown>;
  },
) {
  if (!ctx.userId) {
    return;
  }

  await ctx
    .runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
      userId: ctx.userId,
      threadId: ctx.threadId,
      source: "plan_tool",
      name: params.name,
      status: params.status,
      durationMs: params.durationMs,
      errorCategory: params.status === "failed" ? "plan_tool_error" : undefined,
      retriable: params.status === "failed",
      metadata: params.metadata,
    })
    .catch((error) => {
      console.error("Failed to store plan tool telemetry", error);
    });

  await capturePosthogEvent({
    event: "plan_tool_result",
    distinctId: ctx.userId,
    properties: {
      thread_id: ctx.threadId,
      tool_name: params.name,
      status: params.status,
      duration_ms: params.durationMs,
      ...(params.metadata ?? {}),
    },
  });
}

function requireThreadContext(ctx: { userId?: string; threadId?: string }) {
  if (!ctx.userId || !ctx.threadId) {
    throw new Error("Plan tools require user and thread context.");
  }
  return {
    userId: ctx.userId,
    threadId: ctx.threadId,
  };
}

async function ensureThreadRecord(
  ctx: {
    runMutation: (
      ref: FunctionReference<"mutation", "internal">,
      args: {
        userId: string;
        threadId: string;
        title?: string;
        lastMessageAt?: number;
      },
    ) => Promise<unknown>;
  },
  userId: string,
  threadId: string,
) {
  await ctx.runMutation(internalApi.chat.createThreadRecord, {
    userId,
    threadId,
    lastMessageAt: Date.now(),
  });
}

const startPlanModeSchema = z.object({
  topic: z.string().optional(),
});

export const startPlanModeTool = createTool({
  description:
    "Enable plan mode for this thread. Use after learner agrees to create a long-term learning track.",
  args: startPlanModeSchema,
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const { userId, threadId } = requireThreadContext(ctx);
    try {
      await ensureThreadRecord(ctx, userId, threadId);
      const summary = await ctx.runMutation(
        internalApi.plans.startPlanModeInternal,
        {
          userId,
          threadId,
          topic: args.topic,
          latestChangeRequest: undefined,
        },
      );

      await recordPlanToolTelemetry(ctx, {
        name: "start_plan_mode",
        status: "success",
        durationMs: Date.now() - startedAt,
        metadata: { topic: args.topic, phase: summary.phase },
      });

      return {
        status: "ok" as const,
        summary: `Plan mode is now ${summary.phase}.`,
        phase: summary.phase,
        title: summary.title,
      };
    } catch (error) {
      await recordPlanToolTelemetry(ctx, {
        name: "start_plan_mode",
        status: "failed",
        durationMs: Date.now() - startedAt,
        metadata: {
          topic: args.topic,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  },
});

export const getPlanContextTool = createTool({
  description:
    "Get current plan context, phase, and open checklist items. Call this before checking off plan items.",
  args: z.object({}),
  handler: async (ctx) => {
    const startedAt = Date.now();
    const { userId, threadId } = requireThreadContext(ctx);
    try {
      await ensureThreadRecord(ctx, userId, threadId);
      const context = await ctx.runQuery(
        internalApi.plans.getPlanContextForAgentInternal,
        {
          userId,
          threadId,
        },
      );

      await recordPlanToolTelemetry(ctx, {
        name: "get_plan_context",
        status: "success",
        durationMs: Date.now() - startedAt,
        metadata: {
          hasPlan: Boolean(context),
          phase: context?.phase,
        },
      });

      if (!context) {
        return {
          status: "missing" as const,
          summary: "No plan exists in this thread yet.",
        };
      }

      return {
        status: "ok" as const,
        summary: `Plan phase: ${context.phase}.`,
        ...context,
      };
    } catch (error) {
      await recordPlanToolTelemetry(ctx, {
        name: "get_plan_context",
        status: "failed",
        durationMs: Date.now() - startedAt,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  },
});

const generatePlanDraftSchema = z.object({
  brief: z.string().min(8),
  changeRequest: z.string().optional(),
});

export const generatePlanDraftTool = createTool({
  description:
    "Generate or revise a plan draft using the planning model. Use after collecting learner requirements.",
  args: generatePlanDraftSchema,
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const { userId, threadId } = requireThreadContext(ctx);
    try {
      await ensureThreadRecord(ctx, userId, threadId);
      const result = await ctx.runAction(
        internalApi.planActions.generatePlanDraft,
        {
          userId,
          threadId,
          brief: args.brief,
          changeRequest: args.changeRequest,
        },
      );

      await recordPlanToolTelemetry(ctx, {
        name: "generate_plan_draft",
        status: "success",
        durationMs: Date.now() - startedAt,
        metadata: {
          milestoneCount: result.milestoneCount,
          checklistItemCount: result.checklistItemCount,
          model: result.model,
        },
      });

      return result;
    } catch (error) {
      await recordPlanToolTelemetry(ctx, {
        name: "generate_plan_draft",
        status: "failed",
        durationMs: Date.now() - startedAt,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  },
});

export const acceptPlanDraftTool = createTool({
  description:
    "Accept the current plan draft and make it the active plan for this thread.",
  args: z.object({}),
  handler: async (ctx) => {
    const startedAt = Date.now();
    const { userId, threadId } = requireThreadContext(ctx);
    try {
      await ensureThreadRecord(ctx, userId, threadId);
      const summary = await ctx.runMutation(
        internalApi.plans.acceptDraftPlanInternal,
        {
          userId,
          threadId,
        },
      );

      await recordPlanToolTelemetry(ctx, {
        name: "accept_plan_draft",
        status: "success",
        durationMs: Date.now() - startedAt,
        metadata: {
          phase: summary.phase,
          progressPercent: summary.progressPercent,
        },
      });

      return {
        status: "ok" as const,
        summary: "Draft accepted and plan activated.",
        phase: summary.phase,
        progressPercent: summary.progressPercent,
      };
    } catch (error) {
      await recordPlanToolTelemetry(ctx, {
        name: "accept_plan_draft",
        status: "failed",
        durationMs: Date.now() - startedAt,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  },
});

const requestPlanChangesSchema = z.object({
  feedback: z.string().min(3),
});

export const requestPlanChangesTool = createTool({
  description:
    "Move plan back into discovery and store requested plan changes from the learner.",
  args: requestPlanChangesSchema,
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const { userId, threadId } = requireThreadContext(ctx);
    try {
      await ensureThreadRecord(ctx, userId, threadId);
      const summary = await ctx.runMutation(
        internalApi.plans.requestPlanChangesInternal,
        {
          userId,
          threadId,
          feedback: args.feedback,
        },
      );

      await recordPlanToolTelemetry(ctx, {
        name: "request_plan_changes",
        status: "success",
        durationMs: Date.now() - startedAt,
        metadata: {
          feedbackLength: args.feedback.length,
          phase: summary.phase,
        },
      });

      return {
        status: "ok" as const,
        summary: "Captured change request and switched back to discovery.",
        phase: summary.phase,
      };
    } catch (error) {
      await recordPlanToolTelemetry(ctx, {
        name: "request_plan_changes",
        status: "failed",
        durationMs: Date.now() - startedAt,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  },
});

const setPlanItemStatusSchema = z.object({
  itemId: z.string().min(1),
  status: z.enum(["todo", "doing", "done"]),
  note: z.string().optional(),
});

export const setPlanItemStatusTool = createTool({
  description:
    "Update a checklist item in the active plan. Only use when completion evidence is clear or learner confirms completion.",
  args: setPlanItemStatusSchema,
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const { userId, threadId } = requireThreadContext(ctx);
    try {
      await ensureThreadRecord(ctx, userId, threadId);
      const summary = await ctx.runMutation(
        internalApi.plans.setPlanItemStatusInternal,
        {
          userId,
          threadId,
          itemId: args.itemId,
          status: args.status,
          note: args.note,
        },
      );

      await recordPlanToolTelemetry(ctx, {
        name: "set_plan_item_status",
        status: "success",
        durationMs: Date.now() - startedAt,
        metadata: {
          itemId: args.itemId,
          status: args.status,
          progressPercent: summary.progressPercent,
        },
      });

      return {
        status: "ok" as const,
        summary: `Updated item ${args.itemId} to ${args.status}.`,
        phase: summary.phase,
        progressPercent: summary.progressPercent,
      };
    } catch (error) {
      await recordPlanToolTelemetry(ctx, {
        name: "set_plan_item_status",
        status: "failed",
        durationMs: Date.now() - startedAt,
        metadata: {
          itemId: args.itemId,
          status: args.status,
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  },
});

export const planToolsAlways = {
  start_plan_mode: startPlanModeTool,
};

export const planToolsWhenPresent = {
  get_plan_context: getPlanContextTool,
  generate_plan_draft: generatePlanDraftTool,
  accept_plan_draft: acceptPlanDraftTool,
  request_plan_changes: requestPlanChangesTool,
  set_plan_item_status: setPlanItemStatusTool,
};
