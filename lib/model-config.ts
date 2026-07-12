export type ModelProfile = "balanced" | "fast" | "quality";

export type TextModelProvider = "freemodel_anthropic" | "openrouter";
export type TextModelAttemptRole = "primary" | "fallback";

export type ConfiguredTextModelAttempt = {
  endpoint: TextModelEndpoint;
  role: TextModelAttemptRole;
};

export type OpenRouterReasoningEffort = "low" | "medium" | "high";

export type OpenRouterProviderOptions = {
  openrouter: {
    reasoning: {
      effort: OpenRouterReasoningEffort;
    };
  };
};

export type TextModelEndpoint = {
  provider: TextModelProvider;
  model: string;
  providerOptions?: OpenRouterProviderOptions;
};

export type TextModelRoute = {
  primary: TextModelEndpoint;
  fallback: TextModelEndpoint;
};

export type ModelConfig = {
  studiAgent: TextModelRoute;
  sparkScene: TextModelRoute;
  sparkDesmos: TextModelRoute;
  sparkQuiz: TextModelRoute;
  sparkFlash: TextModelRoute;
};

export const defaultFreeModelAnthropicBaseURL =
  "https://api-cc.freemodel.dev/v1";

const defaultFreeModelAnthropicModel = "claude-opus-4-8";
const defaultOpenRouterModel = "anthropic/claude-opus-4.8";

export const openRouterReasoningProviderOptions: OpenRouterProviderOptions = {
  openrouter: {
    reasoning: {
      effort: "medium",
    },
  },
};

const defaultTextModelRoute: TextModelRoute = {
  primary: {
    provider: "freemodel_anthropic",
    model: defaultFreeModelAnthropicModel,
  },
  fallback: {
    provider: "openrouter",
    model: defaultOpenRouterModel,
    providerOptions: openRouterReasoningProviderOptions,
  },
};

const modelProfiles: Record<ModelProfile, ModelConfig> = {
  balanced: {
    studiAgent: defaultTextModelRoute,
    sparkScene: defaultTextModelRoute,
    sparkDesmos: defaultTextModelRoute,
    sparkQuiz: defaultTextModelRoute,
    sparkFlash: defaultTextModelRoute,
  },
  fast: {
    studiAgent: defaultTextModelRoute,
    sparkScene: defaultTextModelRoute,
    sparkDesmos: defaultTextModelRoute,
    sparkQuiz: defaultTextModelRoute,
    sparkFlash: defaultTextModelRoute,
  },
  quality: {
    studiAgent: defaultTextModelRoute,
    sparkScene: defaultTextModelRoute,
    sparkDesmos: defaultTextModelRoute,
    sparkQuiz: defaultTextModelRoute,
    sparkFlash: defaultTextModelRoute,
  },
};

export const activeModelProfile: ModelProfile = "fast";

type EnvRecord = Record<string, string | undefined>;

function hasValue(value: string | undefined): boolean {
  return Boolean(value && value.trim().length > 0);
}

export function getFreeModelApiKey(
  env: EnvRecord = process.env,
): string | undefined {
  return env.FREEMODEL_ANTHROPIC_API_KEY ?? env.FREEMODEL_API_KEY;
}

export function normalizeFreeModelAnthropicBaseURL(
  value: string | undefined,
): string {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return defaultFreeModelAnthropicBaseURL;
  }
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function isModelEndpointConfigured(
  endpoint: TextModelEndpoint,
  env: EnvRecord = process.env,
): boolean {
  if (endpoint.provider === "freemodel_anthropic") {
    return hasValue(getFreeModelApiKey(env));
  }
  return hasValue(env.OPENROUTER_API_KEY);
}

export function getConfiguredModelEndpointAttempts(
  route: TextModelRoute,
  env: EnvRecord = process.env,
): TextModelEndpoint[] {
  const attempts: TextModelEndpoint[] = [];
  if (isModelEndpointConfigured(route.primary, env)) {
    attempts.push(route.primary);
  }
  if (
    route.fallback.provider !== route.primary.provider &&
    isModelEndpointConfigured(route.fallback, env)
  ) {
    attempts.push(route.fallback);
  }
  return attempts;
}

export function getConfiguredChatModelAttempts(
  route: TextModelRoute,
  env: EnvRecord = process.env,
): ConfiguredTextModelAttempt[] {
  const configured = getConfiguredModelEndpointAttempts(route, env);

  // Preserve the pre-routing chat resilience when only one provider is
  // configured. With both providers present, the fallback is the second try.
  const endpoints =
    configured.length === 1 ? [configured[0], configured[0]] : configured;
  return endpoints.map((endpoint, index) => ({
    endpoint,
    role: index === 0 ? "primary" : "fallback",
  }));
}

export function hasConfiguredTextModelProvider(
  env: EnvRecord = process.env,
): boolean {
  return getConfiguredModelEndpointAttempts(defaultTextModelRoute, env).length > 0;
}

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

export function getStudiAgentName(
  profile: ModelProfile,
  attemptRole: TextModelAttemptRole = "primary",
): string {
  const baseName =
    profile === activeModelProfile ? "studi" : `studi-${profile}`;
  return attemptRole === "primary" ? baseName : `${baseName}-fallback`;
}
