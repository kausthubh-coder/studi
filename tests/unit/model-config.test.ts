import { describe, expect, it } from "vitest";
import {
  defaultFreeModelAnthropicBaseURL,
  getConfiguredChatModelAttempts,
  getConfiguredModelEndpointAttempts,
  getModelConfig,
  hasConfiguredTextModelProvider,
  listModelProfiles,
  normalizeFreeModelAnthropicBaseURL,
  openRouterReasoningProviderOptions,
} from "@/lib/model-config";

describe("model config", () => {
  it("enables shared model surfaces for either configured provider", () => {
    expect(hasConfiguredTextModelProvider({ FREEMODEL_API_KEY: "free" })).toBe(
      true,
    );
    expect(hasConfiguredTextModelProvider({ OPENROUTER_API_KEY: "router" })).toBe(
      true,
    );
    expect(hasConfiguredTextModelProvider({})).toBe(false);
  });

  it("uses FreeModel Anthropic Opus 4.8 with OpenRouter Opus 4.8 fallback for every active model role", () => {
    for (const profile of listModelProfiles()) {
      const config = getModelConfig(profile);
      const routes = [
        config.studiAgent,
        config.sparkScene,
        config.sparkDesmos,
        config.sparkQuiz,
        config.sparkFlash,
      ];

      for (const route of routes) {
        expect(route.primary).toEqual({
          provider: "freemodel_anthropic",
          model: "claude-opus-4-8",
        });
        expect(route.fallback).toEqual({
          provider: "openrouter",
          model: "anthropic/claude-opus-4.8",
          providerOptions: openRouterReasoningProviderOptions,
        });
      }
    }
  });

  it("orders configured model attempts with OpenRouter as fallback", () => {
    const route = getModelConfig("fast").studiAgent;

    expect(
      getConfiguredModelEndpointAttempts(route, {
        FREEMODEL_API_KEY: "freemodel-key",
        OPENROUTER_API_KEY: "openrouter-key",
      }),
    ).toEqual([route.primary, route.fallback]);

    expect(
      getConfiguredModelEndpointAttempts(route, {
        OPENROUTER_API_KEY: "openrouter-key",
      }),
    ).toEqual([route.fallback]);
  });

  it("preserves two same-provider chat attempts when only one endpoint is configured", () => {
    const route = getModelConfig("fast").studiAgent;

    expect(
      getConfiguredChatModelAttempts(route, {
        OPENROUTER_API_KEY: "openrouter-key",
      }),
    ).toEqual([
      { endpoint: route.fallback, role: "primary" },
      { endpoint: route.fallback, role: "fallback" },
    ]);

    expect(
      getConfiguredChatModelAttempts(route, {
        FREEMODEL_API_KEY: "freemodel-key",
        OPENROUTER_API_KEY: "openrouter-key",
      }),
    ).toEqual([
      { endpoint: route.primary, role: "primary" },
      { endpoint: route.fallback, role: "fallback" },
    ]);
  });

  it("normalizes the FreeModel Anthropic base URL to the Messages API prefix", () => {
    expect(normalizeFreeModelAnthropicBaseURL(undefined)).toBe(
      defaultFreeModelAnthropicBaseURL,
    );
    expect(
      normalizeFreeModelAnthropicBaseURL("https://api-cc.freemodel.dev"),
    ).toBe("https://api-cc.freemodel.dev/v1");
    expect(
      normalizeFreeModelAnthropicBaseURL("https://api-cc.freemodel.dev/v1/"),
    ).toBe("https://api-cc.freemodel.dev/v1");
  });

  it("centralizes OpenRouter medium reasoning provider options", () => {
    expect(openRouterReasoningProviderOptions).toEqual({
      openrouter: {
        reasoning: {
          effort: "medium",
        },
      },
    });
  });
});
