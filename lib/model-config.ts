export type ModelProfile = "balanced" | "fast" | "quality";

export type ModelConfig = {
  studiAgent: string;
  codiAgent: string;
  voiceAgent: string;
  voiceTextFallback: string;
  planAgent: string;
  sparkSceneWorker: string;
  sparkDesmosWorker: string;
  sparkCodeWorker: string;
  sparkWebWorker: string;
  sparkQuizWorker: string;
  sparkFlashWorker: string;
};

export type ModelRouteKey = keyof ModelConfig;

// Verified 2026-06-24 against Anthropic model docs (`claude-opus-4-8`)
// and OpenRouter `/api/v1/models`, where the provider slug is:
export const openRouterClaudeOpus48Model = "anthropic/claude-opus-4.8";
export const openRouterClaudeOpus48FastModel =
  "anthropic/claude-opus-4.8-fast";

const opus48Everywhere: ModelConfig = {
  studiAgent: openRouterClaudeOpus48Model,
  codiAgent: openRouterClaudeOpus48Model,
  voiceAgent: openRouterClaudeOpus48Model,
  voiceTextFallback: openRouterClaudeOpus48Model,
  planAgent: openRouterClaudeOpus48Model,
  sparkSceneWorker: openRouterClaudeOpus48Model,
  sparkDesmosWorker: openRouterClaudeOpus48Model,
  sparkCodeWorker: openRouterClaudeOpus48Model,
  sparkWebWorker: openRouterClaudeOpus48Model,
  sparkQuizWorker: openRouterClaudeOpus48Model,
  sparkFlashWorker: openRouterClaudeOpus48Model,
};

const modelProfiles: Record<ModelProfile, ModelConfig> = {
  balanced: {
    ...opus48Everywhere,
  },
  fast: {
    ...opus48Everywhere,
    sparkSceneWorker: openRouterClaudeOpus48FastModel,
    sparkDesmosWorker: openRouterClaudeOpus48FastModel,
    sparkCodeWorker: openRouterClaudeOpus48FastModel,
    sparkWebWorker: openRouterClaudeOpus48FastModel,
    sparkQuizWorker: openRouterClaudeOpus48FastModel,
    sparkFlashWorker: openRouterClaudeOpus48FastModel,
  },
  quality: {
    ...opus48Everywhere,
  },
};

export const activeModelProfile: ModelProfile = "balanced";

export function listModelProfiles(): ModelProfile[] {
  return Object.keys(modelProfiles) as ModelProfile[];
}

export function isModelProfile(value: string): value is ModelProfile {
  return value === "balanced" || value === "fast" || value === "quality";
}

export function getModelConfig(profile: ModelProfile): ModelConfig {
  return modelProfiles[profile];
}

export function getActiveModelConfig(): ModelConfig {
  return getModelConfig(activeModelProfile);
}

export function getModelForRoute(
  routeKey: ModelRouteKey,
  profile: ModelProfile = activeModelProfile,
): string {
  return getModelConfig(profile)[routeKey];
}

export function getStudiAgentName(profile: ModelProfile): string {
  return profile === activeModelProfile ? "studi" : `studi-${profile}`;
}
