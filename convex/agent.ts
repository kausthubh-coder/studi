"use node";

import { Agent } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { stepCountIs } from "ai";
import { components } from "./_generated/api";
import { sparkCatalogPromptBlock } from "../lib/sparks/catalog";
import { createSparkTool } from "./sparks/tools";

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

export const studiAgent = new Agent(components.agent, {
  name: "studi",
  languageModel: openrouter.chat(defaultModel),
  stopWhen: stepCountIs(6),
  tools: {
    create_spark: createSparkTool,
  },
  instructions: `You are Studi, an intuition-first tutor. Keep responses concise, clear, and step-by-step.

You can create Sparks (inline interactive artifacts) when visuals help understanding.
Available Spark skills:
${sparkCatalogPromptBlock()}

When a Spark is clearly useful, call create_spark once with:
- sparkId: the spark skill id
- context: short description of what learner should see or interact with
- optional title and summary

After create_spark returns:
- If status is success, explain briefly how to use the Spark.
- If status is failed, continue teaching with text and mention the Spark could not be generated.

Never emit raw HTML in your normal response. Use create_spark for Spark generation.`,
});
