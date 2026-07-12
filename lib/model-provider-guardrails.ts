export type ModelFailureKind =
  | "cancelled"
  | "timeout"
  | "provider"
  | "invalid_output"
  | "other";

export type SafeModelFailureMetadata = {
  kind: ModelFailureKind;
  statusCode?: number;
  code?: string;
  requestId?: string;
};

type UnknownRecord = Record<string, unknown>;

const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" ? (value as UnknownRecord) : null;
}

function readSafeToken(value: unknown, maxLength = 128): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.length > maxLength ||
    !SAFE_TOKEN_PATTERN.test(trimmed)
  ) {
    return undefined;
  }
  return trimmed;
}

function readStatusCode(candidate: UnknownRecord | null): number | undefined {
  if (!candidate) return undefined;
  const value = candidate.statusCode ?? candidate.status;
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined;
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (headers instanceof Headers) {
    return readSafeToken(headers.get(name));
  }

  const record = asRecord(headers);
  if (!record) return undefined;
  const matchingKey = Object.keys(record).find(
    (key) => key.toLowerCase() === name.toLowerCase(),
  );
  return matchingKey ? readSafeToken(record[matchingKey]) : undefined;
}

function getErrorName(error: unknown): string {
  const candidate = asRecord(error);
  return typeof candidate?.name === "string" ? candidate.name : "";
}

function getErrorMessage(error: unknown): string {
  const candidate = asRecord(error);
  if (typeof candidate?.message === "string") return candidate.message;
  return typeof error === "string" ? error : "";
}

export function classifyModelFailure(error: unknown): ModelFailureKind {
  const name = getErrorName(error);
  const message = getErrorMessage(error);

  if (
    name === "AbortError" ||
    /\b(?:aborted|cancelled|canceled)\b/i.test(message)
  ) {
    return "cancelled";
  }

  if (/timeout/i.test(name) || /\b(?:timed out|timeout)\b/i.test(message)) {
    return "timeout";
  }

  if (/No(?:Object|Output)Generated|JSONParse|InvalidResponse/i.test(name)) {
    return "invalid_output";
  }

  const candidate = asRecord(error);
  if (
    readStatusCode(candidate) !== undefined ||
    /(?:^|_)(?:APICallError|RetryError|RateLimitError|AuthenticationError)$/i.test(
      name,
    ) ||
    /\b(?:provider returned error|api call failed|status code [45]\d\d|rate limit(?:ed)?|unauthorized|forbidden|payment required|insufficient balance)\b/i.test(
      message,
    )
  ) {
    return "provider";
  }

  return "other";
}

export function getSafeModelFailureMetadata(
  error: unknown,
): SafeModelFailureMetadata {
  const candidate = asRecord(error);
  const requestId =
    readSafeToken(candidate?.requestId) ??
    readSafeToken(candidate?.request_id) ??
    readHeader(
      candidate?.responseHeaders ?? candidate?.headers,
      "x-request-id",
    );
  const code = readSafeToken(candidate?.code, 80);
  const statusCode = readStatusCode(candidate);

  return {
    kind: classifyModelFailure(error),
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(code === undefined ? {} : { code }),
    ...(requestId === undefined ? {} : { requestId }),
  };
}

export function isRetriableModelFailure(error: unknown): boolean {
  const metadata = getSafeModelFailureMetadata(error);
  if (metadata.kind === "timeout" || metadata.kind === "invalid_output") {
    return true;
  }
  if (metadata.kind !== "provider") return false;

  const { statusCode } = metadata;
  return (
    statusCode === undefined ||
    statusCode === 408 ||
    statusCode === 409 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode >= 500
  );
}

export function isCrossProviderFallbackEligible(error: unknown): boolean {
  return isCrossProviderFallbackKind(classifyModelFailure(error));
}

export function isCrossProviderFallbackKind(kind: ModelFailureKind): boolean {
  return kind === "provider" || kind === "timeout" || kind === "invalid_output";
}

export function shouldPublishModelAttemptStream(
  currentProvider: string,
  nextProvider: string | undefined,
): boolean {
  return nextProvider === undefined || nextProvider === currentProvider;
}

export function getPublicSparkFailureMessage(kind: ModelFailureKind): string {
  if (kind === "cancelled") return "Spark generation was cancelled.";
  if (kind === "timeout") {
    return "Spark generation timed out. Please try again.";
  }
  if (kind === "provider") {
    return "The model provider could not generate this Spark. Please try again.";
  }
  if (kind === "invalid_output") {
    return "The model provider returned an unusable Spark. Please try again.";
  }
  return "Studi could not generate this Spark. Please try again.";
}
