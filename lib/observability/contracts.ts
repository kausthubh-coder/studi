export const telemetrySources = [
  "agent_usage",
  "agent_runtime",
  "spark",
  "lab",
  "voice",
  "track",
  "quota",
] as const;

export type TelemetrySource = (typeof telemetrySources)[number];

export const quotaActions = [
  "spark_create",
  "lab_runtime",
  "voice_session",
  "track_generation",
] as const;

export type QuotaAction = (typeof quotaActions)[number];

export const quotaActionLabels: Record<QuotaAction, string> = {
  spark_create: "Spark generation",
  lab_runtime: "Lab runtime",
  voice_session: "Voice sessions",
  track_generation: "Track generation",
};

export const providerErrorCategories = [
  "auth",
  "rate_limit",
  "quota_exceeded",
  "timeout",
  "cancelled",
  "not_found",
  "validation",
  "provider_error",
  "runtime_error",
  "unknown",
] as const;

export type ProviderErrorCategory = (typeof providerErrorCategories)[number];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    normalized === "authorization" ||
    normalized === "cookie" ||
    normalized === "password" ||
    normalized === "secret" ||
    normalized === "token" ||
    normalized === "apikey" ||
    normalized === "accesstoken" ||
    normalized === "refreshtoken" ||
    normalized === "idtoken" ||
    normalized === "clientsecret" ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("secret")
  );
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function sanitizeStringValue(key: string, value: string): string {
  if (/^(?:bearer|basic)\s+[a-z0-9._~+/-]+=*$/i.test(value.trim())) {
    return "[redacted]";
  }
  if (isSensitiveKey(key)) return "[redacted]";
  return truncate(value, 500);
}

export function sanitizeTelemetryValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return truncate(value, 500);
  if (depth >= 4) return "[truncated]";

  if (Array.isArray(value)) {
    return value
      .slice(0, 24)
      .map((item) => sanitizeTelemetryValue(item, depth + 1));
  }

  if (!isPlainRecord(value)) {
    return String(value).slice(0, 500);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value).slice(0, 40)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = "[redacted]";
    } else if (typeof child === "string") {
      sanitized[key] = sanitizeStringValue(key, child);
    } else {
      sanitized[key] = sanitizeTelemetryValue(child, depth + 1);
    }
  }
  return sanitized;
}

export function toProviderErrorMessage(
  error: unknown,
  maxLength = 500,
): string {
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    error.data &&
    typeof error.data === "object" &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return truncate(error.data.message, maxLength);
  }

  if (error instanceof Error && error.message) {
    try {
      const parsed = JSON.parse(error.message) as { message?: unknown };
      if (typeof parsed.message === "string") {
        return truncate(parsed.message, maxLength);
      }
    } catch {
      // Fall back to the raw Error message below.
    }
    return truncate(error.message, maxLength);
  }
  if (typeof error === "string" && error.trim()) {
    return truncate(error.trim(), maxLength);
  }
  return "Something went wrong.";
}

export function classifyProviderError(error: unknown): {
  category: ProviderErrorCategory;
  retriable: boolean;
  message: string;
} {
  const message = toProviderErrorMessage(error);
  const lower = message.toLowerCase();

  if (lower.includes("quota") || lower.includes("limit exceeded")) {
    return { category: "quota_exceeded", retriable: false, message };
  }
  if (lower.includes("rate")) {
    return { category: "rate_limit", retriable: true, message };
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { category: "timeout", retriable: true, message };
  }
  if (lower.includes("cancel")) {
    return { category: "cancelled", retriable: false, message };
  }
  if (
    lower.includes("auth") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("api key")
  ) {
    return { category: "auth", retriable: false, message };
  }
  if (lower.includes("not found")) {
    return { category: "not_found", retriable: false, message };
  }
  if (lower.includes("invalid") || lower.includes("validation")) {
    return { category: "validation", retriable: false, message };
  }
  if (
    lower.includes("provider") ||
    lower.includes("openrouter") ||
    lower.includes("openai")
  ) {
    return { category: "provider_error", retriable: true, message };
  }
  return { category: "unknown", retriable: true, message };
}
