export type ModelProfile = "balanced" | "fast" | "quality";

export type ModelConfig = {
  studiAgent: string;
  codiAgent: string;
  shruAgent: string;
  sparkScene: string;
  sparkDesmos: string;
  sparkCode: string;
  sparkQuiz: string;
  sparkFlash: string;
};

const universalModel = "xiaomi/mimo-v2-flash";

const modelProfiles: Record<ModelProfile, ModelConfig> = {
  balanced: {
    studiAgent: universalModel,
    codiAgent: universalModel,
    shruAgent: universalModel,
    sparkScene: universalModel,
    sparkDesmos: universalModel,
    sparkCode: universalModel,
    sparkQuiz: universalModel,
    sparkFlash: universalModel,
  },
  fast: {
    studiAgent: universalModel,
    codiAgent: universalModel,
    shruAgent: universalModel,
    sparkScene: universalModel,
    sparkDesmos: universalModel,
    sparkCode: universalModel,
    sparkQuiz: universalModel,
    sparkFlash: universalModel,
  },
  quality: {
    studiAgent: universalModel,
    codiAgent: universalModel,
    shruAgent: universalModel,
    sparkScene: universalModel,
    sparkDesmos: universalModel,
    sparkCode: universalModel,
    sparkQuiz: universalModel,
    sparkFlash: universalModel,
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

export function getCodiAgentName(profile: ModelProfile): string {
  return profile === activeModelProfile ? "codi" : `codi-${profile}`;
}

export function getShruAgentName(profile: ModelProfile): string {
  return profile === activeModelProfile ? "shru" : `shru-${profile}`;
}
