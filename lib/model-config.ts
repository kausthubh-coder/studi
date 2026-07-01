export type ModelProfile = "balanced" | "fast" | "quality";

export type OpenRouterReasoningEffort = "low" | "medium" | "high";

export type OpenRouterProviderOptions = {
  openrouter: {
    reasoning: {
      effort: OpenRouterReasoningEffort;
    };
  };
};

export type ModelConfig = {
  studiAgent: string;
  sparkScene: string;
  sparkDesmos: string;
  sparkQuiz: string;
  sparkFlash: string;
  providerOptions: OpenRouterProviderOptions;
};

const defaultAgentModel = "anthropic/claude-sonnet-4.6";
const defaultSparkModel = defaultAgentModel;

export const openRouterReasoningProviderOptions: OpenRouterProviderOptions = {
  openrouter: {
    reasoning: {
      effort: "medium",
    },
  },
};

const modelProfiles: Record<ModelProfile, ModelConfig> = {
  balanced: {
    studiAgent: defaultAgentModel,
    sparkScene: defaultSparkModel,
    sparkDesmos: defaultSparkModel,
    sparkQuiz: defaultSparkModel,
    sparkFlash: defaultSparkModel,
    providerOptions: openRouterReasoningProviderOptions,
  },
  fast: {
    studiAgent: defaultAgentModel,
    sparkScene: defaultSparkModel,
    sparkDesmos: defaultSparkModel,
    sparkQuiz: defaultSparkModel,
    sparkFlash: defaultSparkModel,
    providerOptions: openRouterReasoningProviderOptions,
  },
  quality: {
    studiAgent: defaultAgentModel,
    sparkScene: defaultSparkModel,
    sparkDesmos: defaultSparkModel,
    sparkQuiz: defaultSparkModel,
    sparkFlash: defaultSparkModel,
    providerOptions: openRouterReasoningProviderOptions,
  },
};

export const activeModelProfile: ModelProfile = "fast";

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

export function getStudiAgentName(profile: ModelProfile): string {
  return profile === activeModelProfile ? "studi" : `studi-${profile}`;
}
