"use node";

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  getFreeModelApiKey,
  normalizeFreeModelAnthropicBaseURL,
  type TextModelEndpoint,
} from "../lib/model-config";

type AnthropicProvider = ReturnType<typeof createAnthropic>;
type OpenRouterProvider = ReturnType<typeof createOpenRouter>;

let freeModelAnthropic: AnthropicProvider | null = null;
let freeModelAnthropicCacheKey: string | null = null;
let openrouter: OpenRouterProvider | null = null;

function getFreeModelAnthropicProvider(): AnthropicProvider {
  const apiKey = getFreeModelApiKey();
  if (!apiKey) {
    throw new Error(
      "FREEMODEL_API_KEY is missing. Set it in Convex env vars for FreeModel Anthropic.",
    );
  }

  const baseURL = normalizeFreeModelAnthropicBaseURL(
    process.env.FREEMODEL_ANTHROPIC_BASE_URL,
  );
  const cacheKey = `${baseURL}:${apiKey}`;
  if (!freeModelAnthropic || freeModelAnthropicCacheKey !== cacheKey) {
    freeModelAnthropic = createAnthropic({
      apiKey,
      baseURL,
      name: "freemodel_anthropic",
    });
    freeModelAnthropicCacheKey = cacheKey;
  }

  return freeModelAnthropic;
}

function getOpenRouterProvider(): OpenRouterProvider {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Set it in .env.local and Convex env vars.",
    );
  }

  openrouter ??= createOpenRouter({ apiKey: openRouterApiKey });
  return openrouter;
}

export function createTextLanguageModel(endpoint: TextModelEndpoint) {
  if (endpoint.provider === "freemodel_anthropic") {
    return getFreeModelAnthropicProvider().chat(endpoint.model);
  }
  return getOpenRouterProvider().chat(endpoint.model);
}

export function describeTextModelEndpoint(endpoint: TextModelEndpoint): string {
  return `${endpoint.provider}:${endpoint.model}`;
}
