import { definePlaygroundAPI } from "@convex-dev/agent";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { action } from "./_generated/server";
import { playgroundAgents } from "./agent";
import { internal } from "./_generated/api";

const internalApi = internal as unknown as {
  telemetry: {
    getThreadObservabilitySummaryInternal: FunctionReference<
      "query",
      "internal"
    >;
    getThreadUsageBreakdownInternal: FunctionReference<"query", "internal">;
  };
};

/**
 * Exposes the Agent Playground API.
 *
 * Use an API key issued from the agent component:
 * bunx convex run --component agent apiKeys:issue '{"name":"studi-playground"}'
 */
export const {
  isApiKeyValid,
  listAgents,
  listUsers,
  listThreads,
  listMessages,
  createThread,
  generateText,
  fetchPromptContext,
} = definePlaygroundAPI(components.agent, {
  agents: playgroundAgents,
});

export const getThreadObservabilitySummary = action({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.object({
    usage: v.object({
      calls: v.number(),
      totalTokens: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
    }),
    telemetry: v.object({
      events: v.number(),
      failures: v.number(),
      sparkFailures: v.number(),
      labToolFailures: v.number(),
      planToolFailures: v.number(),
      runtimeFailures: v.number(),
      voiceFailures: v.number(),
      lastFailureAt: v.optional(v.number()),
    }),
  }),
  handler: async (ctx, args) => {
    return await ctx.runQuery(
      internalApi.telemetry.getThreadObservabilitySummaryInternal,
      {
        userId: args.userId,
        threadId: args.threadId,
      },
    );
  },
});

export const getThreadUsageBreakdown = action({
  args: {
    userId: v.string(),
    threadId: v.string(),
  },
  returns: v.object({
    totals: v.object({
      calls: v.number(),
      totalTokens: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      reasoningTokens: v.number(),
      cachedInputTokens: v.number(),
      estimatedCostUsd: v.number(),
    }),
    byModel: v.array(
      v.object({
        model: v.string(),
        provider: v.string(),
        calls: v.number(),
        totalTokens: v.number(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        reasoningTokens: v.number(),
        cachedInputTokens: v.number(),
        estimatedCostUsd: v.number(),
        lastCallAt: v.optional(v.number()),
      }),
    ),
    byAgent: v.array(
      v.object({
        agentName: v.string(),
        calls: v.number(),
        totalTokens: v.number(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        reasoningTokens: v.number(),
        cachedInputTokens: v.number(),
        estimatedCostUsd: v.number(),
        lastCallAt: v.optional(v.number()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    return await ctx.runQuery(
      internalApi.telemetry.getThreadUsageBreakdownInternal,
      {
        userId: args.userId,
        threadId: args.threadId,
      },
    );
  },
});
