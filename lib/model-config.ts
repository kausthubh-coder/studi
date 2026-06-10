export type ModelProfile = "balanced" | "fast" | "quality";

export type ModelConfig = {
  studiAgent: string;
  sparkScene: string;
  sparkDesmos: string;
  sparkCode: string;
  sparkQuiz: string;
  sparkFlash: string;
};

const defaultAgentModel = "anthropic/claude-sonnet-4.6";
const defaultSparkModel = "anthropic/claude-haiku-4.5";

const modelProfiles: Record<ModelProfile, ModelConfig> = {
  balanced: {
    studiAgent: defaultAgentModel,
    sparkScene: defaultSparkModel,
    sparkDesmos: defaultSparkModel,
    sparkCode: defaultSparkModel,
    sparkQuiz: defaultSparkModel,
    sparkFlash: defaultSparkModel,
  },
  fast: {
    studiAgent: defaultAgentModel,
    sparkScene: defaultSparkModel,
    sparkDesmos: defaultSparkModel,
    sparkCode: defaultSparkModel,
    sparkQuiz: defaultSparkModel,
    sparkFlash: defaultSparkModel,
  },
  quality: {
    studiAgent: defaultAgentModel,
    sparkScene: defaultSparkModel,
    sparkDesmos: defaultSparkModel,
    sparkCode: defaultSparkModel,
    sparkQuiz: defaultSparkModel,
    sparkFlash: defaultSparkModel,
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
