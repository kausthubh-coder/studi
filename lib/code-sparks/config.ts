import type { CodeSparkProvider } from "../sparks/contracts";

function normalizeProvider(value: string | undefined): CodeSparkProvider {
  if (
    value === "vercel_sandbox" ||
    value === "daytona" ||
    value === "e2b" ||
    value === "local_fake"
  ) {
    return value;
  }
  return "unavailable";
}

function isProductionRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

function hasVercelSandboxAuth() {
  return Boolean(
    process.env.VERCEL_OIDC_TOKEN ||
      (process.env.VERCEL_TOKEN &&
        process.env.VERCEL_TEAM_ID &&
        process.env.VERCEL_PROJECT_ID),
  );
}

export function getCodeSparkProviderConfig(): {
  provider: CodeSparkProvider;
  reason?: string;
} {
  const requested = normalizeProvider(process.env.CODE_SPARK_PROVIDER);

  if (requested === "vercel_sandbox") {
    return hasVercelSandboxAuth()
      ? { provider: "vercel_sandbox" }
      : {
          provider: "unavailable",
          reason:
            "Vercel Sandbox requires VERCEL_OIDC_TOKEN or VERCEL_TOKEN with VERCEL_TEAM_ID and VERCEL_PROJECT_ID.",
        };
  }

  if (requested === "local_fake") {
    return isProductionRuntime()
      ? {
          provider: "unavailable",
          reason:
            "CODE_SPARK_PROVIDER=local_fake is not allowed in production.",
        }
      : { provider: "local_fake", reason: "Deterministic local/test adapter." };
  }

  if (requested === "daytona" || requested === "e2b") {
    return {
      provider: "unavailable",
      reason: `${requested} adapter is not implemented in this pass.`,
    };
  }

  if (hasVercelSandboxAuth()) {
    return { provider: "vercel_sandbox" };
  }

  if (isProductionRuntime()) {
    return {
      provider: "unavailable",
      reason:
        "Set CODE_SPARK_PROVIDER=vercel_sandbox for production Code Spark execution.",
    };
  }

  return {
    provider: "local_fake",
    reason:
      "CODE_SPARK_PROVIDER is unset; using deterministic local_fake outside production.",
  };
}
