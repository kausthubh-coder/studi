"use node";

import { Agent } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { stepCountIs } from "ai";
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
import { components } from "./_generated/api";
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
