"use node";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { capturePosthogEvent } from "./posthog";

const internalApi = internal as unknown as {
  billing: {
    recordTextAiCostInternal: FunctionReference<"mutation", "internal">;
  };
  plans: {
    getPlanDraftingContextInternal: FunctionReference<"query", "internal">;
    savePlanDraftInternal: FunctionReference<"mutation", "internal">;
  };
  telemetry: {
    insertRawUsageInternal: FunctionReference<"mutation", "internal">;
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

type UsageSnapshot = {
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  inputTokenDetails?: unknown;
  outputTokenDetails?: unknown;
  raw?: unknown;
};

function readNumericCandidate(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function extractEstimatedCostUsd(providerMetadata: unknown): number | undefined {
  if (!providerMetadata || typeof providerMetadata !== "object") {
    return undefined;
  }

  const stack: Record<string, unknown>[] = [
    providerMetadata as Record<string, unknown>,
  ];
  const seen = new Set<Record<string, unknown>>();
  const keys = [
    "totalCostUsd",
    "total_cost_usd",
    "totalCost",
    "total_cost",
    "costUsd",
    "cost_usd",
    "cost",
  ];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || seen.has(node)) {
      continue;
    }
    seen.add(node);

    for (const key of keys) {
      const found = readNumericCandidate(node, key);
      if (found !== undefined) {
        return found;
      }
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        stack.push(value as Record<string, unknown>);
      }
    }
  }

  return undefined;
}

const openRouterApiKey = process.env.OPENROUTER_API_KEY;

if (!openRouterApiKey) {
  throw new Error(
    "OPENROUTER_API_KEY is missing. Set it in .env.local and Convex env vars.",
  );
}

const plannerModel = "z-ai/glm-5";

const fallbackPlannerModels = [
  plannerModel,
].filter((value, index, all) => all.indexOf(value) === index);

const openrouter = createOpenRouter({
  apiKey: openRouterApiKey,
});

const planDraftSchema = z.object({
  title: z.string().min(3).max(120),
  goal: z.string().min(8).max(300),
  overview: z.string().max(400).optional(),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(2).max(120),
        kind: z.string().max(40).optional(),
        summary: z.string().max(220).optional(),
        dependsOn: z.array(z.string()).optional(),
        checklist: z
          .array(
            z.object({
              id: z.string().min(1),
              text: z.string().min(2).max(180),
              status: z.enum(["todo", "doing", "done"]).default("todo"),
            }),
          )
          .min(1)
          .max(6),
      }),
    )
    .min(1)
    .max(8),
});

function buildPlannerPrompt(args: {
  brief: string;
  changeRequest?: string;
  existingTitle?: string;
  existingAcceptedPlan?: unknown;
  existingDraftPlan?: unknown;
  latestChangeRequest?: string;
}): string {
  const existingAccepted = args.existingAcceptedPlan
    ? JSON.stringify(args.existingAcceptedPlan, null, 2)
    : "none";
  const existingDraft = args.existingDraftPlan
    ? JSON.stringify(args.existingDraftPlan, null, 2)
    : "none";

  return [
    "Create or revise a thread learning plan as strict JSON.",
    "",
    "Requirements:",
    "- Return practical milestones and checklists for iterative learning.",
    "- Keep IDs stable if revising existing nodes/items.",
    "- Checklist status should default to todo unless there is strong reason.",
    "- Keep the draft compact: 4-8 milestones, each with 3-6 checklist items.",
    "- Keep every checklist item short (under 140 characters when possible).",
    "- Use concise, learner-friendly wording.",
    "",
    `Learner brief: ${args.brief}`,
    `Change request: ${args.changeRequest ?? "none"}`,
    `Latest saved change request: ${args.latestChangeRequest ?? "none"}`,
    `Existing title: ${args.existingTitle ?? "none"}`,
    "",
    "Existing accepted plan JSON:",
    existingAccepted,
    "",
    "Existing draft plan JSON:",
    existingDraft,
  ].join("\n");
}

function formatProviderError(error: unknown): string {
  if (error instanceof Error) {
    const candidate = error as Error & {
      statusCode?: number;
      responseBody?: string;
      data?: unknown;
      cause?: unknown;
    };
    const statusPart =
      typeof candidate.statusCode === "number"
        ? `status=${candidate.statusCode}`
        : "status=unknown";
    const bodyPart =
      typeof candidate.responseBody === "string" &&
      candidate.responseBody.trim().length > 0
        ? candidate.responseBody
        : candidate.cause instanceof Error
          ? candidate.cause.message
          : typeof candidate.data === "string"
            ? candidate.data
            : candidate.message;
    return `${statusPart}; ${bodyPart}`;
  }
  return String(error);
}

async function generateDraftWithFallbackModels(prompt: string) {
  const errors: string[] = [];

  for (const modelId of fallbackPlannerModels) {
    try {
      const result = await generateObject({
        model: openrouter.chat(modelId),
        schema: planDraftSchema,
        prompt,
        maxOutputTokens: 2200,
        temperature: 0.2,
      });
      return {
        modelId,
        object: result.object,
        usage: (result as { usage?: UsageSnapshot }).usage,
        providerMetadata: (result as { providerMetadata?: unknown })
          .providerMetadata,
      };
    } catch (error) {
      errors.push(`${modelId}: ${formatProviderError(error)}`);
    }
  }

  throw new Error(
    `Plan draft generation failed across models. ${errors.join(" | ")}`,
  );
}

export const generatePlanDraft = internalAction({
  args: {
    userId: v.string(),
    threadId: v.string(),
    brief: v.string(),
    changeRequest: v.optional(v.string()),
  },
  returns: v.object({
    status: v.literal("draft_ready"),
    title: v.string(),
    summary: v.string(),
    milestoneCount: v.number(),
    checklistItemCount: v.number(),
    model: v.string(),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.runQuery(
      internalApi.plans.getPlanDraftingContextInternal,
      {
        userId: args.userId,
        threadId: args.threadId,
      },
    );

    const prompt = buildPlannerPrompt({
      brief: args.brief,
      changeRequest: args.changeRequest,
      existingTitle: existing?.title,
      existingAcceptedPlan: existing?.acceptedPlan,
      existingDraftPlan: existing?.draftPlan,
      latestChangeRequest: existing?.latestChangeRequest,
    });

    const result = await generateDraftWithFallbackModels(prompt);

    await ctx.runMutation(internalApi.telemetry.insertRawUsageInternal, {
      userId: args.userId,
      threadId: args.threadId,
      agentName: "plan_worker",
      model: result.modelId,
      provider: "openrouter",
      usage: {
        totalTokens: result.usage?.totalTokens,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        reasoningTokens: result.usage?.reasoningTokens,
        cachedInputTokens: result.usage?.cachedInputTokens,
        inputTokenDetails: result.usage?.inputTokenDetails,
        outputTokenDetails: result.usage?.outputTokenDetails,
        raw: result.usage?.raw,
      },
      providerMetadata: result.providerMetadata,
    });

    await ctx.runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
      userId: args.userId,
      threadId: args.threadId,
      source: "agent_usage",
      name: "plan_worker_generation",
      status: "success",
      model: result.modelId,
      metadata: {
        totalTokens: result.usage?.totalTokens,
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
      },
    });

    await capturePosthogEvent({
      event: "plan_worker_generation",
      distinctId: args.userId,
      properties: {
        thread_id: args.threadId,
        model: result.modelId,
        total_tokens: result.usage?.totalTokens,
        input_tokens: result.usage?.inputTokens,
        output_tokens: result.usage?.outputTokens,
      },
    });

    await ctx.runMutation(internalApi.billing.recordTextAiCostInternal, {
      userId: args.userId,
      textAiCostUsd: extractEstimatedCostUsd(result.providerMetadata) ?? 0,
    });

    await ctx.runMutation(internalApi.plans.savePlanDraftInternal, {
      userId: args.userId,
      threadId: args.threadId,
      draftPlan: result.object,
      latestChangeRequest: args.changeRequest,
    });

    const checklistItemCount = result.object.nodes.reduce(
      (total, node) => total + node.checklist.length,
      0,
    );

    return {
      status: "draft_ready" as const,
      title: result.object.title,
      summary: `Draft ready with ${result.object.nodes.length} milestones and ${checklistItemCount} checklist items.`,
      milestoneCount: result.object.nodes.length,
      checklistItemCount,
      model: result.modelId,
    };
  },
});
