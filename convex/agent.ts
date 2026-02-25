"use node";

import { Agent } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { stepCountIs } from "ai";
import { components } from "./_generated/api";
import { sparkCatalogPromptBlock } from "../lib/sparks/catalog";
import { loadPrompt, renderPrompt } from "../lib/prompts";
import { createSparkTool } from "./sparks/tools";
import { getCodeSparkContextTool } from "../lib/agent-tools/getCodeSparkContextTool";
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

const openRouterApiKey = process.env.OPENROUTER_API_KEY;

if (!openRouterApiKey) {
  throw new Error(
    "OPENROUTER_API_KEY is missing. Set it in .env.local and Convex env vars.",
  );
}

const openrouter = createOpenRouter({
  apiKey: openRouterApiKey,
});

const defaultModel =
  process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.6";

const studiAgentInstructions = renderPrompt("agents/studi.md", {
  sparkCatalogPromptBlock: sparkCatalogPromptBlock(),
});

const codiAgentInstructions = loadPrompt("agents/codi.md");

export const studiAgent: Agent = new Agent(components.agent, {
  name: "studi",
  languageModel: openrouter.chat(defaultModel),
  stopWhen: stepCountIs(6),
  tools: {
    create_spark: createSparkTool,
    get_code_spark_context: getCodeSparkContextTool,
    create_lab: createLabTool,
    archive_lab: archiveLabTool,
    glob: globTool,
    run: runTool,
  },
  instructions: studiAgentInstructions,
});

export const codiAgent: Agent = new Agent(components.agent, {
  name: "codi",
  languageModel: openrouter.chat(defaultModel),
  stopWhen: stepCountIs(10),
  tools: {
    list: listTool,
    read: readTool,
    grep: grepTool,
    glob: globTool,
    run: runTool,
    edit: editTool,
    write: writeTool,
    archive_lab: archiveLabTool,
  },
  instructions: codiAgentInstructions,
});
