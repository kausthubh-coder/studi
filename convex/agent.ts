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
  getShruAgentName,
  getStudiAgentName,
  type ModelProfile,
} from "../lib/model-config";
import { getCodeSparkContextTool } from "../lib/agent-tools/getCodeSparkContextTool";
import { loadPrompt, renderPrompt } from "../lib/prompts";
import { sparkCatalogPromptBlock } from "../lib/sparks/catalog";
import { capturePosthogEvent } from "./posthog";
import { components, internal } from "./_generated/api";
import {
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
import {
  createSparkToolForModels,
  createSparkToolForProfile,
  type SparkWorkerModels,
} from "./sparks/tools";
import { createWarningTool } from "./voiceTools";

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

    await ctx.runMutation(internalApi.billing.recordTextAiCostInternal, {
      userId: args.userId,
      textAiCostUsd: estimatedCostUsd ?? 0,
    });

    await capturePosthogEvent({
      event: "$ai_generation",
      distinctId: args.userId,
      properties: {
        $ai_trace_id: args.threadId,
        $ai_model: args.model,
        $ai_provider: args.provider ?? "openrouter",
        $ai_input_tokens: args.usage.inputTokens,
        $ai_output_tokens: args.usage.outputTokens,
        $ai_total_cost_usd: estimatedCostUsd,
        $ai_span_name: args.agentName ?? "agent_generation",
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

const shruAgentInstructions = renderPrompt("agents/shru.md", {
  sparkCatalogPromptBlock: sparkCatalogPromptBlock(),
});

export function buildStudiToolset(
  profile: ModelProfile,
  includePlanTools: boolean,
) {
  return {
    create_spark: createSparkToolForProfile(profile),
    get_code_spark_context: getCodeSparkContextTool,
    create_lab: createLabTool,
    glob: globTool,
    run: runTool,
    ...planToolsAlways,
    ...(includePlanTools ? planToolsWhenPresent : {}),
  };
}

function buildStudiToolsetWithSparkModels(
  sparkModels: SparkWorkerModels,
  includePlanTools: boolean,
) {
  return {
    create_spark: createSparkToolForModels(sparkModels),
    get_code_spark_context: getCodeSparkContextTool,
    create_lab: createLabTool,
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
    ...planToolsAlways,
    ...(includePlanTools ? planToolsWhenPresent : {}),
  };
}

export function buildShruToolset(profile: ModelProfile) {
  return {
    create_spark: createSparkToolForProfile(profile),
    create_warning: createWarningTool,
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

function createShruAgent(profile: ModelProfile): Agent {
  const modelConfig = getModelConfig(profile);
  return new Agent(components.agent, {
    name: getShruAgentName(profile),
    languageModel: openrouter.chat(modelConfig.shruAgent),
    stopWhen: stepCountIs(6),
    tools: buildShruToolset(profile),
    instructions: shruAgentInstructions,
    usageHandler,
  });
}

function createBenchmarkStudiAgent(params: {
  name: string;
  model: string;
  sparkModel: string;
}): Agent {
  return new Agent(components.agent, {
    name: params.name,
    languageModel: openrouter.chat(params.model),
    stopWhen: stepCountIs(6),
    tools: buildStudiToolsetWithSparkModels(
      {
        sparkScene: params.sparkModel,
        sparkDesmos: params.sparkModel,
        sparkCode: params.sparkModel,
        sparkQuiz: params.sparkModel,
        sparkFlash: params.sparkModel,
      },
      true,
    ),
    instructions: studiAgentInstructions,
    usageHandler,
  });
}

export const studiBenchmarkAgents = {
  seedMini: createBenchmarkStudiAgent({
    name: "studi-bakeoff-seed-2-0-mini",
    model: "bytedance-seed/seed-2.0-mini",
    sparkModel: "bytedance-seed/seed-2.0-mini",
  }),
  geminiFlashLite: createBenchmarkStudiAgent({
    name: "studi-bakeoff-gemini-3-1-flash-lite-preview",
    model: "google/gemini-3.1-flash-lite-preview",
    sparkModel: "google/gemini-3.1-flash-lite-preview",
  }),
  kimiK2Nitro: createBenchmarkStudiAgent({
    name: "studi-bakeoff-kimi-k2-0905-nitro",
    model: "moonshotai/kimi-k2-0905:nitro",
    sparkModel: "moonshotai/kimi-k2-0905:nitro",
  }),
  kimiK2Base: createBenchmarkStudiAgent({
    name: "studi-bakeoff-kimi-k2-0905",
    model: "moonshotai/kimi-k2-0905",
    sparkModel: "moonshotai/kimi-k2-0905",
  }),
};

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

export const shruAgentsByProfile: Record<ModelProfile, Agent> = {
  balanced: createShruAgent("balanced"),
  fast: createShruAgent("fast"),
  quality: createShruAgent("quality"),
};

export const studiAgent: Agent = studiAgentsByProfile[activeModelProfile];

export const codiAgent: Agent = codiAgentsByProfile[activeModelProfile];

export const shruAgent: Agent = shruAgentsByProfile[activeModelProfile];

export const playgroundAgents: Agent[] = [
  studiAgentsByProfile.balanced,
  codiAgentsByProfile.balanced,
  shruAgentsByProfile.balanced,
  studiAgentsByProfile.fast,
  codiAgentsByProfile.fast,
  shruAgentsByProfile.fast,
  studiAgentsByProfile.quality,
  codiAgentsByProfile.quality,
  shruAgentsByProfile.quality,
  studiBenchmarkAgents.seedMini,
  studiBenchmarkAgents.geminiFlashLite,
  studiBenchmarkAgents.kimiK2Nitro,
  studiBenchmarkAgents.kimiK2Base,
];
