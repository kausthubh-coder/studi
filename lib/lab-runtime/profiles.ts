export type LabRuntimeInput = {
  language?: string;
  framework?: string;
};

export type LabRuntimeSelection = {
  language: string;
  framework?: string;
  runtimeProfileId: string;
  inferredFromFramework: boolean;
};

const frameworkLanguageMap: Record<string, string> = {
  nextjs: "typescript",
  react: "typescript",
  vite: "typescript",
  sveltekit: "typescript",
  angular: "typescript",
  express: "typescript",
  nest: "typescript",
  fastify: "typescript",
  deno: "typescript",
  fastapi: "python",
  django: "python",
  flask: "python",
  streamlit: "python",
  numpy: "python",
  pandas: "python",
  ruby_on_rails: "ruby",
  rails: "ruby",
  sinatra: "ruby",
  laravel: "php",
  symfony: "php",
  phoenix: "elixir",
  spring: "java",
  springboot: "java",
  quarkus: "java",
  gin: "go",
  fiber: "go",
  actix: "rust",
  rocket: "rust",
  dotnet: "csharp",
  aspnet: "csharp",
};

const languageAliases: Record<string, string> = {
  ts: "typescript",
  typescript: "typescript",
  js: "javascript",
  javascript: "javascript",
  node: "javascript",
  nodejs: "javascript",
  py: "python",
  python: "python",
  go: "go",
  golang: "go",
  rust: "rust",
  ruby: "ruby",
  php: "php",
  java: "java",
  csharp: "csharp",
  "c#": "csharp",
  dotnet: "csharp",
  elixir: "elixir",
};

function normalize(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.toLowerCase();
}

function normalizeLanguage(value?: string): string | undefined {
  const normalized = normalize(value);
  if (!normalized) {
    return undefined;
  }

  return languageAliases[normalized] ?? normalized;
}

export function resolveLabRuntime(input: LabRuntimeInput): LabRuntimeSelection {
  const normalizedFramework = normalize(input.framework);
  const explicitLanguage = normalizeLanguage(input.language);

  if (explicitLanguage) {
    return {
      language: explicitLanguage,
      framework: normalizedFramework,
      runtimeProfileId: `${explicitLanguage}:${normalizedFramework ?? "base"}`,
      inferredFromFramework: false,
    };
  }

  const inferredLanguage = normalizedFramework
    ? frameworkLanguageMap[normalizedFramework]
    : undefined;
  const language = inferredLanguage ?? "typescript";

  return {
    language,
    framework: normalizedFramework,
    runtimeProfileId: `${language}:${normalizedFramework ?? "base"}`,
    inferredFromFramework: Boolean(inferredLanguage),
  };
}

