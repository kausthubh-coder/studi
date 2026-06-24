import { describe, expect, it } from "vitest";
import {
  activeModelProfile,
  getActiveModelConfig,
  getModelConfig,
  getModelForRoute,
  openRouterClaudeOpus48FastModel,
  openRouterClaudeOpus48Model,
  type ModelRouteKey,
} from "@/lib/model-config";

const defaultOpus48RouteKeys: ModelRouteKey[] = [
  "studiAgent",
  "codiAgent",
  "voiceAgent",
  "voiceTextFallback",
  "planAgent",
  "sparkSceneWorker",
  "sparkDesmosWorker",
  "sparkCodeWorker",
  "sparkWebWorker",
  "sparkQuizWorker",
  "sparkFlashWorker",
];

describe("model config", () => {
  it("uses the verified OpenRouter Claude Opus 4.8 slug for active defaults", () => {
    expect(activeModelProfile).toBe("balanced");
    expect(openRouterClaudeOpus48Model).toBe("anthropic/claude-opus-4.8");

    const activeConfig = getActiveModelConfig();

    for (const routeKey of defaultOpus48RouteKeys) {
      expect(activeConfig[routeKey]).toBe(openRouterClaudeOpus48Model);
      expect(getModelForRoute(routeKey)).toBe(openRouterClaudeOpus48Model);
    }
  });

  it("keeps profile overrides available without changing the active default", () => {
    const fastConfig = getModelConfig("fast");

    expect(fastConfig.studiAgent).toBe(openRouterClaudeOpus48Model);
    expect(fastConfig.codiAgent).toBe(openRouterClaudeOpus48Model);
    expect(fastConfig.voiceTextFallback).toBe(openRouterClaudeOpus48Model);
    expect(fastConfig.planAgent).toBe(openRouterClaudeOpus48Model);
    expect(fastConfig.sparkSceneWorker).toBe(openRouterClaudeOpus48FastModel);
    expect(fastConfig.sparkWebWorker).toBe(openRouterClaudeOpus48FastModel);
    expect(getModelForRoute("sparkSceneWorker", "fast")).toBe(
      openRouterClaudeOpus48FastModel,
    );
  });
});
