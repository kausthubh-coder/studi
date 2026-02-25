export type ModelProfile = "balanced" | "fast" | "quality";

export type ModelConfig = {
  studiAgent: string;
  codiAgent: string;
  sparkScene: string;
  sparkDesmos: string;
  sparkCode: string;
  sparkQuiz: string;
  sparkFlash: string;
};

const modelProfiles: Record<ModelProfile, ModelConfig> = {
  balanced: {
    studiAgent: "anthropic/claude-sonnet-4.6",
    codiAgent: "anthropic/claude-sonnet-4.6",
    sparkScene: "google/gemini-3-flash-preview",
    sparkDesmos: "google/gemini-3-flash-preview",
    sparkCode: "google/gemini-3-flash-preview",
    sparkQuiz: "google/gemini-3-flash-preview",
    sparkFlash: "google/gemini-3-flash-preview",
  },
  fast: {
    studiAgent: "openai/gpt-4o-mini",
    codiAgent: "openai/gpt-4o-mini",
    sparkScene: "openai/gpt-4o-mini",
    sparkDesmos: "openai/gpt-4o-mini",
    sparkCode: "openai/gpt-4o-mini",
    sparkQuiz: "openai/gpt-4o-mini",
    sparkFlash: "openai/gpt-4o-mini",
  },
  quality: {
    studiAgent: "x-ai/grok-4.1-fast",
    codiAgent: "x-ai/grok-4.1-fast",
    sparkScene: "google/gemini-3-flash-preview",
    sparkDesmos: "google/gemini-3-flash-preview",
    sparkCode: "google/gemini-3-flash-preview",
    sparkQuiz: "google/gemini-3-flash-preview",
    sparkFlash: "google/gemini-3-flash-preview",
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
