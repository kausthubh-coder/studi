"use node";

import { Agent, type UsageHandler } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { stepCountIs } from "ai";
import type { FunctionReference } from "convex/server";
import {
  activeModelProfile,
  getModelForRoute,
  getStudiAgentName,
  type ModelProfile,
} from "../lib/model-config";
import { resolveAgentRole } from "../lib/role-router";
import { getCodeSparkContextTool } from "../lib/agent-tools/getCodeSparkContextTool";
import { renderPrompt } from "../lib/prompts";
import { sparkCatalogPromptBlock } from "../lib/sparks/catalog";
import { components, internal } from "./_generated/api";
import { createSparkToolForProfile } from "./sparks/tools";

const internalApi = internal as unknown as {
  billing: {
    recordTextAiCostInternal: FunctionReference<"mutation", "internal">;
  };
  telemetry: {
    insertRawUsageInternal: FunctionReference<"mutation", "internal">;
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

function readNumericCandidate(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function extractEstimatedCostUsd(
  providerMetadata: unknown,
): number | undefined {
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
    if (!node || seen.has(node)) continue;
    seen.add(node);

    for (const key of keys) {
      const found = readNumericCandidate(node, key);
      if (found !== undefined) return found;
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        stack.push(value as Record<string, unknown>);
      }
    }
  }

  return undefined;
}

const usageHandler: UsageHandler = async (ctx, args) => {
  if (!args.userId) return;

  const estimatedCostUsd = extractEstimatedCostUsd(args.providerMetadata);

  try {
    await ctx.runMutation(internalApi.telemetry.insertRawUsageInternal, {
      userId: args.userId,
      threadId: args.threadId,
      agentName: args.agentName,
      model: args.model,
      provider: args.provider,
      usage: args.usage,
      providerMetadata: args.providerMetadata,
    });

    await ctx.runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
      userId: args.userId,
      threadId: args.threadId,
      source: "agent_usage",
      name: args.agentName ?? "agent_usage",
      status: "success",
      model: args.model,
      metadata: {
        provider: args.provider,
        totalTokens: args.usage.totalTokens,
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        estimatedCostUsd,
      },
    });

    await ctx.runMutation(internalApi.billing.recordTextAiCostInternal, {
      userId: args.userId,
      textAiCostUsd: estimatedCostUsd ?? 0,
    });
  } catch (error) {
    console.error("usageHandler failed", error);
  }
};

type OpenRouterProvider = ReturnType<typeof createOpenRouter>;

let openrouter: OpenRouterProvider | null = null;

function getOpenRouter() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Set it in .env.local and Convex env vars.",
    );
  }

  openrouter ??= createOpenRouter({ apiKey: openRouterApiKey });
  return openrouter;
}

const studiAgentInstructions = renderPrompt("agents/studi.md", {
  sparkCatalogPromptBlock: sparkCatalogPromptBlock(),
});

export function buildStudiToolset(profile: ModelProfile) {
  return {
    create_spark: createSparkToolForProfile(profile),
    get_code_spark_context: getCodeSparkContextTool,
  };
}

function createStudiAgent(profile: ModelProfile): Agent {
  const role = resolveAgentRole({ requestedCapability: "tutor" });
  return new Agent(components.agent, {
    name: getStudiAgentName(profile),
    languageModel: getOpenRouter().chat(
      getModelForRoute(role.modelRouteKey, profile),
    ),
    stopWhen: stepCountIs(6),
    tools: buildStudiToolset(profile),
    instructions: studiAgentInstructions,
    usageHandler,
  });
}

const studiAgentsByProfile: Partial<Record<ModelProfile, Agent>> = {};

export function getStudiAgent(profile: ModelProfile = activeModelProfile): Agent {
  studiAgentsByProfile[profile] ??= createStudiAgent(profile);
  return studiAgentsByProfile[profile];
}

export function getPlaygroundAgents(): Agent[] {
  return [
    getStudiAgent("balanced"),
    getStudiAgent("fast"),
    getStudiAgent("quality"),
  ];
}
