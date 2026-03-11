"use node";

const WORKSPACE_ROOT_FALLBACK = "/project/sandbox";

export type LabRuntimeErrorCategory =
  | "auth"
  | "permission"
  | "not_found"
  | "conflict"
  | "timeout"
  | "rate_limit"
  | "sandbox_state"
  | "network"
  | "invalid_request"
  | "command_failed"
  | "unknown";

export type LabRuntimeError = {
  category: LabRuntimeErrorCategory;
  message: string;
  retriable: boolean;
  httpStatus?: number;
  endpoint?: string;
  requestId?: string;
  hint?: string;
  raw?: string;
  exitCode?: number;
};

export type LabRuntimeFileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: string;
};

export type LabRuntimeMatch = {
  file: string;
  line: number;
  content: string;
};

type RuntimeLikeError = {
  name?: unknown;
  category?: unknown;
  status?: unknown;
  statusCode?: unknown;
  endpoint?: unknown;
  requestId?: unknown;
  hint?: unknown;
  raw?: unknown;
  body?: unknown;
  responseBody?: unknown;
  response?: { status?: unknown } | undefined;
  exitCode?: unknown;
  retriable?: unknown;
  output?: unknown;
  message?: unknown;
};

function normalizePosixPath(input: string) {
  const source = input.replace(/\\/g, "/");
  const isAbsolute = source.startsWith("/");
  const segments = source.split("/");
  const normalized: string[] = [];

  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }

    if (segment === "..") {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== "..") {
        normalized.pop();
      } else if (!isAbsolute) {
        normalized.push("..");
      }
      continue;
    }

    normalized.push(segment);
  }

  if (isAbsolute) {
    return normalized.length > 0 ? `/${normalized.join("/")}` : "/";
  }

  return normalized.length > 0 ? normalized.join("/") : ".";
}

function joinPosixPath(...parts: string[]) {
  return normalizePosixPath(parts.join("/"));
}

function ensureAbsoluteWorkspacePath(workspacePath?: string) {
  const raw = workspacePath?.trim();
  if (!raw) {
    return WORKSPACE_ROOT_FALLBACK;
  }

  const normalized = normalizePosixPath(raw);
  if (!normalized.startsWith("/")) {
    throw new Error("workspacePath must be an absolute sandbox path.");
  }

  return normalized.replace(/\/+$/, "") || "/";
}

export function normalizeLabPath(
  input: string | undefined,
  workspacePath: string,
) {
  const root = ensureAbsoluteWorkspacePath(workspacePath);
  const raw = (input ?? "").trim();
  if (!raw || raw === "." || raw === "/") {
    return root;
  }

  const slashPath = raw.replace(/\\/g, "/");
  const normalized = slashPath.startsWith("/")
    ? normalizePosixPath(slashPath)
    : normalizePosixPath(joinPosixPath(root, slashPath));

  if (normalized === root || normalized.startsWith(`${root}/`)) {
    return normalized;
  }

  throw new Error("Path must stay inside the lab workspace.");
}

export function toRelativeLabPath(absolutePath: string, workspacePath: string) {
  const root = ensureAbsoluteWorkspacePath(workspacePath);
  const normalized = normalizePosixPath(absolutePath);

  if (normalized === root) {
    return ".";
  }

  if (normalized.startsWith(`${root}/`)) {
    return normalized.slice(root.length + 1);
  }

  throw new Error("Path must stay inside the lab workspace.");
}

export function parseRipgrepMatches(
  output: string,
  limit: number,
): LabRuntimeMatch[] {
  const matches: LabRuntimeMatch[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const match = /^(.*?):(\d+):(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    matches.push({
      file: match[1] ?? "",
      line: Number.parseInt(match[2] ?? "0", 10),
      content: match[3] ?? "",
    });

    if (matches.length >= limit) {
      break;
    }
  }

  return matches;
}

function readStatusCandidate(error: RuntimeLikeError) {
  const candidates = [
    error.status,
    error.statusCode,
    error.response?.status,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function readStringCandidate(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export function classifyLabRuntimeError(error: unknown): LabRuntimeError {
  const runtimeError =
    error && typeof error === "object" ? (error as RuntimeLikeError) : undefined;

  const status = runtimeError ? readStatusCandidate(runtimeError) : undefined;
  const endpoint = runtimeError ? readStringCandidate(runtimeError.endpoint) : undefined;
  const requestId = runtimeError ? readStringCandidate(runtimeError.requestId) : undefined;
  const raw = runtimeError
    ? readStringCandidate(runtimeError.body) ??
      readStringCandidate(runtimeError.raw) ??
      readStringCandidate(runtimeError.responseBody)
    : undefined;
  const message =
    (error instanceof Error ? error.message : undefined) ??
    (runtimeError ? readStringCandidate(runtimeError.message) : undefined) ??
    String(error);

  if (
    runtimeError?.name === "LabRuntimeRequestError" &&
    typeof runtimeError.category === "string"
  ) {
    return {
      category: runtimeError.category as LabRuntimeErrorCategory,
      message,
      retriable:
        typeof runtimeError.retriable === "boolean"
          ? runtimeError.retriable
          : runtimeError.category === "timeout",
      httpStatus: status,
      endpoint,
      requestId,
      hint: readStringCandidate(runtimeError.hint),
      raw,
      exitCode:
        typeof runtimeError.exitCode === "number" ? runtimeError.exitCode : undefined,
    };
  }

  if (runtimeError?.name === "CommandError") {
    return {
      category: "command_failed",
      message,
      retriable: false,
      exitCode:
        typeof runtimeError.exitCode === "number" ? runtimeError.exitCode : undefined,
      raw:
        readStringCandidate(runtimeError.output) ??
        raw,
    };
  }

  if (status === 401) {
    return {
      category: "auth",
      message,
      retriable: false,
      httpStatus: status,
      endpoint,
      requestId,
      raw,
      hint: "Check CSB_API_KEY and workspace permissions.",
    };
  }

  if (status === 403) {
    return {
      category: "permission",
      message,
      retriable: false,
      httpStatus: status,
      endpoint,
      requestId,
      raw,
      hint: "Verify the API token can access the CodeSandbox workspace.",
    };
  }

  if (status === 404) {
    return {
      category: "not_found",
      message,
      retriable: false,
      httpStatus: status,
      endpoint,
      requestId,
      raw,
    };
  }

  if (status === 409) {
    return {
      category: "conflict",
      message,
      retriable: true,
      httpStatus: status,
      endpoint,
      requestId,
      raw,
    };
  }

  if (status === 408 || status === 504) {
    return {
      category: "timeout",
      message,
      retriable: true,
      httpStatus: status,
      endpoint,
      requestId,
      raw,
    };
  }

  if (status === 429) {
    return {
      category: "rate_limit",
      message,
      retriable: true,
      httpStatus: status,
      endpoint,
      requestId,
      raw,
    };
  }

  if (status === 400 || status === 422) {
    return {
      category: "invalid_request",
      message,
      retriable: false,
      httpStatus: status,
      endpoint,
      requestId,
      raw,
    };
  }

  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("timeout")) {
    return {
      category: "timeout",
      message,
      retriable: true,
      endpoint,
      requestId,
      raw,
    };
  }

  if (
    normalizedMessage.includes("network") ||
    normalizedMessage.includes("fetch") ||
    normalizedMessage.includes("socket")
  ) {
    return {
      category: "network",
      message,
      retriable: true,
      endpoint,
      requestId,
      raw,
    };
  }

  return {
    category: "unknown",
    message,
    retriable: false,
    httpStatus: status,
    endpoint,
    requestId,
    raw,
  };
}

export function formatErrorSummary(operation: string, error: unknown) {
  const detail = classifyLabRuntimeError(error);
  const statusLabel = detail.httpStatus ? ` (${detail.httpStatus})` : "";
  return `${operation} failed${statusLabel}: ${detail.message}`;
}

export function truncateOutput(value: string, maxLength = 12_000) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}
