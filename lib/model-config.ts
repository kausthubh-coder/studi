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
    studiAgent: "x-ai/grok-code-fast-1",
    codiAgent: "x-ai/grok-code-fast-1",
    sparkScene: "google/gemini-2.5-flash",
    sparkDesmos: "google/gemini-2.5-flash",
    sparkCode: "google/gemini-2.5-flash",
    sparkQuiz: "google/gemini-2.5-flash",
    sparkFlash: "google/gemini-2.5-flash",
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

export function getStudiAgentName(profile: ModelProfile): string {
  return profile === activeModelProfile ? "studi" : `studi-${profile}`;
}

export function getCodiAgentName(profile: ModelProfile): string {
  return profile === activeModelProfile ? "codi" : `codi-${profile}`;
}
