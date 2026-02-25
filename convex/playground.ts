import { definePlaygroundAPI } from "@convex-dev/agent";
import { components } from "./_generated/api";
import { playgroundAgents } from "./agent";

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
