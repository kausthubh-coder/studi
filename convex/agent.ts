"use node";

import { Agent } from "@convex-dev/agent";
import type { UsageHandler } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { stepCountIs } from "ai";
import type { FunctionReference } from "convex/server";
import {
  activeModelProfile,
  getCodiAgentName,
  getModelConfig,
  getStudiAgentName,
  type ModelProfile,
} from "../lib/model-config";
import { getCodeSparkContextTool } from "../lib/agent-tools/getCodeSparkContextTool";
import { loadPrompt, renderPrompt } from "../lib/prompts";
import { sparkCatalogPromptBlock } from "../lib/sparks/catalog";
import { capturePosthogEvent } from "./posthog";
import { components, internal } from "./_generated/api";
import {
  archiveLabTool,
  createLabTool,
  editTool,
  globTool,
  grepTool,
  listTool,
  readTool,
  runTool,
  writeTool,
} from "./labTools";
import { planToolsAlways, planToolsWhenPresent } from "./planTools";
import { createSparkToolForProfile } from "./sparks/tools";

const internalApi = internal as unknown as {
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

const usageHandler: UsageHandler = async (ctx, args) => {
  if (!args.userId) {
    return;
  }

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

    await capturePosthogEvent({
      event: "agent_usage_recorded",
      distinctId: args.userId,
      properties: {
        thread_id: args.threadId,
        agent_name: args.agentName,
        model: args.model,
        provider: args.provider,
        total_tokens: args.usage.totalTokens,
        input_tokens: args.usage.inputTokens,
        output_tokens: args.usage.outputTokens,
        estimated_cost_usd: estimatedCostUsd,
      },
    });
  } catch (error) {
    console.error("usageHandler failed", error);
  }
};

const openRouterApiKey = process.env.OPENROUTER_API_KEY;

if (!openRouterApiKey) {
  throw new Error(
    "OPENROUTER_API_KEY is missing. Set it in .env.local and Convex env vars.",
  );
}

const openrouter = createOpenRouter({
  apiKey: openRouterApiKey,
});

const studiAgentInstructions = renderPrompt("agents/studi.md", {
  sparkCatalogPromptBlock: sparkCatalogPromptBlock(),
});

const codiAgentInstructions = loadPrompt("agents/codi.md");

export function buildStudiToolset(
  profile: ModelProfile,
  includePlanTools: boolean,
) {
  return {
    create_spark: createSparkToolForProfile(profile),
    get_code_spark_context: getCodeSparkContextTool,
    create_lab: createLabTool,
    archive_lab: archiveLabTool,
    glob: globTool,
    run: runTool,
    ...planToolsAlways,
    ...(includePlanTools ? planToolsWhenPresent : {}),
  };
}

export function buildCodiToolset(includePlanTools: boolean) {
  return {
    list: listTool,
    read: readTool,
    grep: grepTool,
    glob: globTool,
    run: runTool,
    edit: editTool,
    write: writeTool,
    archive_lab: archiveLabTool,
    ...planToolsAlways,
    ...(includePlanTools ? planToolsWhenPresent : {}),
  };
}

function createStudiAgent(profile: ModelProfile): Agent {
  const modelConfig = getModelConfig(profile);
  return new Agent(components.agent, {
    name: getStudiAgentName(profile),
    languageModel: openrouter.chat(modelConfig.studiAgent),
    stopWhen: stepCountIs(6),
    tools: buildStudiToolset(profile, true),
    instructions: studiAgentInstructions,
    usageHandler,
  });
}

function createCodiAgent(profile: ModelProfile): Agent {
  const modelConfig = getModelConfig(profile);
  return new Agent(components.agent, {
    name: getCodiAgentName(profile),
    languageModel: openrouter.chat(modelConfig.codiAgent),
    stopWhen: stepCountIs(10),
    tools: buildCodiToolset(true),
    instructions: codiAgentInstructions,
    usageHandler,
  });
}

export const studiAgentsByProfile: Record<ModelProfile, Agent> = {
  balanced: createStudiAgent("balanced"),
  fast: createStudiAgent("fast"),
  quality: createStudiAgent("quality"),
};

export const codiAgentsByProfile: Record<ModelProfile, Agent> = {
  balanced: createCodiAgent("balanced"),
  fast: createCodiAgent("fast"),
  quality: createCodiAgent("quality"),
};

export const studiAgent: Agent = studiAgentsByProfile[activeModelProfile];

export const codiAgent: Agent = codiAgentsByProfile[activeModelProfile];

export const playgroundAgents: Agent[] = [
  studiAgentsByProfile.balanced,
  codiAgentsByProfile.balanced,
  studiAgentsByProfile.fast,
  codiAgentsByProfile.fast,
  studiAgentsByProfile.quality,
  codiAgentsByProfile.quality,
];
