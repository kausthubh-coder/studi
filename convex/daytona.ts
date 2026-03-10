"use node";

const WORKSPACE_ROOT = "workspace";
const READ_MAX_LINES = 2000;
const READ_MAX_BYTES = 50 * 1024;
const READ_MAX_LINE_LENGTH = 2000;

const toolboxBaseUrlCache = new Map<string, string>();

type RequestMethod = "GET" | "POST" | "DELETE";

type DaytonaRequestErrorContext = {
  status?: number;
  endpoint?: string;
  requestId?: string;
  bodyText?: string;
};

type DaytonaErrorCategory =
  | "auth"
  | "permission"
  | "not_found"
  | "conflict"
  | "timeout"
  | "rate_limit"
  | "sandbox_state"
  | "network"
  | "invalid_request"
  | "unknown";

export type DaytonaToolError = {
  category: DaytonaErrorCategory;
  message: string;
  retriable: boolean;
  httpStatus?: number;
  endpoint?: string;
  requestId?: string;
  hint?: string;
  raw?: string;
};

export type DaytonaSandbox = {
  id: string;
  state?: string;
  recoverable?: boolean;
};

export type DaytonaFileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: string;
};

type DaytonaMatch = {
  file: string;
  line: number;
  content: string;
};

type SessionCommandStreams = {
  stdout?: string;
  stderr?: string;
  output?: string;
};

class DaytonaRequestError extends Error {
  readonly status?: number;
  readonly endpoint?: string;
  readonly requestId?: string;
  readonly bodyText?: string;

  constructor(message: string, context: DaytonaRequestErrorContext = {}) {
    super(message);
    this.name = "DaytonaRequestError";
    this.status = context.status;
    this.endpoint = context.endpoint;
    this.requestId = context.requestId;
    this.bodyText = context.bodyText;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isStateChangeInProgressError(error: unknown): boolean {
  if (!(error instanceof DaytonaRequestError)) {
    return false;
  }

  const message = `${error.message}\n${error.bodyText ?? ""}`.toLowerCase();
  return message.includes("state change in progress");
}

function getApiBaseUrl(): string {
  return process.env.DAYTONA_API_URL ?? "https://app.daytona.io/api";
}

function getApiKey(): string {
  const value = process.env.DAYTONA_API_KEY;
  if (!value) {
    throw new DaytonaRequestError(
      "DAYTONA_API_KEY is missing in Convex environment variables.",
      {
        endpoint: "env:DAYTONA_API_KEY",
      },
    );
  }
  return value;
}

function getOptionalOrganizationId(): string | undefined {
  const value = process.env.DAYTONA_ORGANIZATION_ID;
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function buildDaytonaHeaders(json: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getApiKey()}`,
  };

  if (json) {
    headers["Content-Type"] = "application/json";
  }

  const organizationId = getOptionalOrganizationId();
  if (organizationId) {
    headers["X-Daytona-Organization-ID"] = organizationId;
  }

  return headers;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function parseFailureBody(response: Response): Promise<{
  bodyText?: string;
  requestId?: string;
  message?: string;
}> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  const bodyText = await response.text();
  const parsed = safeJsonParse(bodyText);
  const record = asObject(parsed);

  const messageCandidate =
    typeof record?.message === "string"
      ? record.message
      : typeof record?.error === "string"
        ? record.error
        : undefined;

  return {
    bodyText: bodyText || undefined,
    requestId,
    message: messageCandidate,
  };
}

async function daytonaRequest<T>(params: {
  path: string;
  method?: RequestMethod;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}): Promise<T> {
  const apiBase = getApiBaseUrl();
  const endpoint = makeToolboxUrl(
    apiBase.endsWith("/") ? apiBase : `${apiBase}/`,
    params.path,
    params.query,
  );

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: params.method ?? "GET",
      headers: buildDaytonaHeaders(true),
      body: params.body === undefined ? undefined : JSON.stringify(params.body),
    });
  } catch (error) {
    throw new DaytonaRequestError(
      `Network request to Daytona API failed: ${error instanceof Error ? error.message : String(error)}`,
      { endpoint },
    );
  }

  if (!response.ok) {
    const failure = await parseFailureBody(response);
    throw new DaytonaRequestError(
      failure.message ??
        `Daytona API request failed with status ${response.status}.`,
      {
        status: response.status,
        endpoint,
        requestId: failure.requestId,
        bodyText: failure.bodyText,
      },
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return JSON.parse(text) as T;
  }
  return text as T;
}

function makeToolboxUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const url = new URL(path.replace(/^\/+/, ""), baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export function normalizeWorkspacePath(input?: string): string {
  const raw = (input ?? "").trim();
  if (!raw || raw === "." || raw === "/") {
    return WORKSPACE_ROOT;
  }

  const slashPath = raw.replace(/\\/g, "/");
  const isAbsolute = slashPath.startsWith("/");
  const relativePath = slashPath.replace(/^\/+/, "");
  if (!relativePath || relativePath === ".") {
    return WORKSPACE_ROOT;
  }
  const segments = relativePath.split("/");
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") {
      continue;
    }
    if (segment === "..") {
      throw new DaytonaRequestError("Path must stay inside workspace.", {
        endpoint: "path-normalization",
      });
    }
    normalized.push(segment);
  }

  const relative = normalized.join("/");
  if (!relative) {
    return WORKSPACE_ROOT;
  }

  if (isAbsolute) {
    if (relative === WORKSPACE_ROOT) {
      return WORKSPACE_ROOT;
    }
    if (relative.startsWith(`${WORKSPACE_ROOT}/`)) {
      return relative;
    }
    throw new DaytonaRequestError("Path must stay inside workspace.", {
      endpoint: "path-normalization",
    });
  }

  if (
    relative === WORKSPACE_ROOT ||
    relative.startsWith(`${WORKSPACE_ROOT}/`)
  ) {
    return relative;
  }

  return `${WORKSPACE_ROOT}/${relative}`;
}

function buildWorkspacePathCandidates(path?: string): string[] {
  const normalized = normalizeWorkspacePath(path);
  if (normalized === WORKSPACE_ROOT) {
    return [WORKSPACE_ROOT, "/workspace"];
  }
  return [normalized, `/${normalized}`];
}

function buildToolboxPathCandidates(path: string): string[] {
  const normalized = path.replace(/^\/+/, "");
  const candidates = [normalized];
  if (!normalized.startsWith("toolbox/")) {
    candidates.push(`toolbox/${normalized}`);
  }
  return Array.from(new Set(candidates));
}

function pickString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function pickNumber(
  record: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function mergeCommandRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const command = asObject(record.command);
  if (!command) {
    return record;
  }
  return { ...record, ...command };
}

function extractStreams(value: unknown): SessionCommandStreams {
  if (typeof value === "string") {
    return {
      stdout: value,
      output: value,
    };
  }

  const record = asObject(value);
  if (!record) {
    return {};
  }

  const merged = mergeCommandRecord(record);
  const logs = asObject(merged.logs);

  const stdout =
    pickString(merged, ["stdout"]) ?? pickString(logs ?? {}, ["stdout"]);
  const stderr =
    pickString(merged, ["stderr"]) ?? pickString(logs ?? {}, ["stderr"]);

  const output =
    pickString(merged, ["output", "result"]) ??
    pickString(logs ?? {}, ["output"]) ??
    pickString(merged, ["logs"]) ??
    (stdout || stderr
      ? [stdout ?? "", stderr ?? ""].filter(Boolean).join("\n")
      : undefined);

  return {
    stdout,
    stderr,
    output,
  };
}

function extractCommandId(value: unknown): string | undefined {
  const record = asObject(value);
  if (!record) {
    return undefined;
  }
  const merged = mergeCommandRecord(record);
  return pickString(merged, ["cmdId", "commandId", "id"]);
}

function extractExitCode(value: unknown): number | undefined {
  const record = asObject(value);
  if (!record) {
    return undefined;
  }
  const merged = mergeCommandRecord(record);
  return pickNumber(merged, ["exitCode", "code"]);
}

function isBinary(bytes: Buffer): boolean {
  for (const value of bytes) {
    if (value === 0) {
      return true;
    }
  }
  return false;
}

function formatReadOutput(
  text: string,
  offset: number,
  limit: number,
  format: "numbered" | "raw",
): { output: string; truncated: boolean } {
  const lines = text.split(/\r?\n/);
  const start = Math.max(1, offset);
  const end = Math.min(lines.length, start - 1 + limit);
  const selected = lines.slice(start - 1, end);

  let bytesUsed = 0;
  const output: string[] = [];
  for (let index = 0; index < selected.length; index += 1) {
    const rawLine = selected[index] ?? "";
    const lineNumber = start + index;
    const line =
      format === "numbered"
        ? `${lineNumber}: ${
            rawLine.length > READ_MAX_LINE_LENGTH
              ? `${rawLine.slice(0, READ_MAX_LINE_LENGTH)}...`
              : rawLine
          }`
        : rawLine;
    const lineBytes = Buffer.byteLength(line, "utf8");

    if (bytesUsed + lineBytes > READ_MAX_BYTES) {
      break;
    }

    bytesUsed += lineBytes;
    output.push(line);
  }

  const truncated = end < lines.length || output.length < selected.length;
  return {
    output: output.join("\n"),
    truncated,
  };
}

function buildSandboxToolboxBaseUrl(
  proxyUrl: string,
  sandboxId: string,
): string {
  const normalizedProxy = proxyUrl.endsWith("/") ? proxyUrl : `${proxyUrl}/`;

  if (normalizedProxy.includes(`/${sandboxId}/`)) {
    return normalizedProxy;
  }

  return `${normalizedProxy}${sandboxId}/`;
}

async function getToolboxBaseUrl(sandboxId: string): Promise<string> {
  const cached = toolboxBaseUrlCache.get(sandboxId);
  if (cached) {
    return cached;
  }

  const response = await daytonaRequest<{ url: string }>({
    path: `/sandbox/${encodeURIComponent(sandboxId)}/toolbox-proxy-url`,
  });

  const url = buildSandboxToolboxBaseUrl(response.url, sandboxId);
  toolboxBaseUrlCache.set(sandboxId, url);
  return url;
}

async function toolboxJson<T>(params: {
  sandboxId: string;
  path: string;
  method?: RequestMethod;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}): Promise<T> {
  const baseUrl = await getToolboxBaseUrl(params.sandboxId);
  const pathCandidates = buildToolboxPathCandidates(params.path);
  let lastError: DaytonaRequestError | undefined;

  for (const candidate of pathCandidates) {
    const endpoint = makeToolboxUrl(baseUrl, candidate, params.query);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: params.method ?? "GET",
        headers: buildDaytonaHeaders(true),
        body:
          params.body === undefined ? undefined : JSON.stringify(params.body),
      });
    } catch (error) {
      throw new DaytonaRequestError(
        `Network request to Daytona toolbox failed: ${error instanceof Error ? error.message : String(error)}`,
        { endpoint },
      );
    }

    if (!response.ok) {
      const failure = await parseFailureBody(response);
      const requestError = new DaytonaRequestError(
        failure.message ??
          `Daytona toolbox request failed with status ${response.status}.`,
        {
          status: response.status,
          endpoint,
          requestId: failure.requestId,
          bodyText: failure.bodyText,
        },
      );

      if (response.status === 404) {
        lastError = requestError;
        continue;
      }

      throw requestError;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return JSON.parse(text) as T;
    }
    return text as T;
  }

  throw (
    lastError ??
    new DaytonaRequestError("Daytona toolbox request failed.", {
      endpoint: `${baseUrl}${params.path}`,
    })
  );
}

async function toolboxDownloadFile(
  sandboxId: string,
  filePath: string,
): Promise<Buffer> {
  const baseUrl = await getToolboxBaseUrl(sandboxId);
  const pathCandidates = buildToolboxPathCandidates("files/download");
  let lastError: DaytonaRequestError | undefined;

  for (const candidate of pathCandidates) {
    const endpoint = makeToolboxUrl(baseUrl, candidate, {
      path: filePath,
    });

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "GET",
        headers: buildDaytonaHeaders(false),
      });
    } catch (error) {
      throw new DaytonaRequestError(
        `Network request to Daytona toolbox failed: ${error instanceof Error ? error.message : String(error)}`,
        { endpoint },
      );
    }

    if (!response.ok) {
      const failure = await parseFailureBody(response);
      const requestError = new DaytonaRequestError(
        failure.message ??
          `Daytona toolbox request failed with status ${response.status}.`,
        {
          status: response.status,
          endpoint,
          requestId: failure.requestId,
          bodyText: failure.bodyText,
        },
      );
      if (response.status === 404) {
        lastError = requestError;
        continue;
      }
      throw requestError;
    }

    const data = await response.arrayBuffer();
    return Buffer.from(data);
  }

  throw (
    lastError ??
    new DaytonaRequestError("Daytona toolbox file download failed.", {
      endpoint: `${baseUrl}files/download`,
    })
  );
}

async function toolboxUploadFile(
  sandboxId: string,
  filePath: string,
  bytes: Buffer,
): Promise<void> {
  const baseUrl = await getToolboxBaseUrl(sandboxId);
  const pathCandidates = buildToolboxPathCandidates("files/upload");
  let lastError: DaytonaRequestError | undefined;

  for (const candidate of pathCandidates) {
    const endpoint = makeToolboxUrl(baseUrl, candidate, { path: filePath });
    const formData = new FormData();
    formData.append("file", new Blob([new Uint8Array(bytes)]), "file");

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: buildDaytonaHeaders(false),
        body: formData,
      });
    } catch (error) {
      throw new DaytonaRequestError(
        `Network request to Daytona toolbox failed: ${error instanceof Error ? error.message : String(error)}`,
        { endpoint },
      );
    }

    if (!response.ok) {
      const failure = await parseFailureBody(response);
      const requestError = new DaytonaRequestError(
        failure.message ??
          `Daytona toolbox request failed with status ${response.status}.`,
        {
          status: response.status,
          endpoint,
          requestId: failure.requestId,
          bodyText: failure.bodyText,
        },
      );
      if (response.status === 404) {
        lastError = requestError;
        continue;
      }
      throw requestError;
    }

    return;
  }

  throw (
    lastError ??
    new DaytonaRequestError("Daytona toolbox file upload failed.", {
      endpoint: `${baseUrl}files/upload`,
    })
  );
}

async function ensureParentFolders(
  sandboxId: string,
  filePath: string,
): Promise<void> {
  const parts = filePath.split("/");
  parts.pop();
  if (parts.length === 0) {
    return;
  }

  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    try {
      await toolboxJson<void>({
        sandboxId,
        path: "files/folder",
        method: "POST",
        query: {
          path: current,
          mode: "755",
        },
      });
    } catch {}
  }
}

export async function createSandbox(params?: {
  language?: string;
  labels?: Record<string, string | undefined>;
  autoDeleteInterval?: number;
}): Promise<{ sandboxId: string }> {
  const normalizedLabels = Object.fromEntries(
    Object.entries(params?.labels ?? {}).filter(
      ([, value]) => typeof value === "string" && value.length > 0,
    ),
  );

  const created = await daytonaRequest<{ id: string }>({
    path: "/sandbox",
    method: "POST",
    body: {
      language: params?.language ?? "typescript",
      autoDeleteInterval: params?.autoDeleteInterval ?? -1,
      user: process.env.DAYTONA_SANDBOX_USER?.trim() || "root",
      labels: {
        app: "studi",
        scope: "lab",
        ...normalizedLabels,
      },
    },
  });

  return { sandboxId: created.id };
}

export async function getSandbox(sandboxId: string): Promise<DaytonaSandbox> {
  return await daytonaRequest<DaytonaSandbox>({
    path: `/sandbox/${encodeURIComponent(sandboxId)}`,
  });
}

export async function startSandbox(sandboxId: string): Promise<void> {
  await daytonaRequest({
    path: `/sandbox/${encodeURIComponent(sandboxId)}/start`,
    method: "POST",
  });
}

export async function stopSandbox(sandboxId: string): Promise<void> {
  await daytonaRequest({
    path: `/sandbox/${encodeURIComponent(sandboxId)}/stop`,
    method: "POST",
  });
}

export async function deleteSandbox(sandboxId: string): Promise<void> {
  await daytonaRequest({
    path: `/sandbox/${encodeURIComponent(sandboxId)}`,
    method: "DELETE",
  });
}

export async function recoverSandbox(sandboxId: string): Promise<void> {
  await daytonaRequest({
    path: `/sandbox/${encodeURIComponent(sandboxId)}/recover`,
    method: "POST",
  });
}

async function waitForSandboxStarted(sandboxId: string): Promise<void> {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const sandbox = await getSandbox(sandboxId);
    if (sandbox.state === "started") {
      console.info("[daytona] sandbox started", {
        sandboxId,
      });
      return;
    }

    if (sandbox.state === "error") {
      throw new DaytonaRequestError(
        `Sandbox ${sandboxId} entered error state while starting.`,
        {
          endpoint: `/sandbox/${encodeURIComponent(sandboxId)}`,
        },
      );
    }

    await sleep(250);
  }

  throw new DaytonaRequestError(
    `Sandbox ${sandboxId} did not reach started state within 60 seconds.`,
    {
      endpoint: `/sandbox/${encodeURIComponent(sandboxId)}`,
    },
  );
}

export async function markSandboxActivity(sandboxId: string): Promise<void> {
  try {
    await daytonaRequest({
      path: `/sandbox/${encodeURIComponent(sandboxId)}/last-activity`,
      method: "POST",
    });
  } catch {}
}

export async function ensureSandboxStarted(sandboxId: string): Promise<void> {
  const sandbox = await getSandbox(sandboxId);
  console.info("[daytona] ensureSandboxStarted", {
    sandboxId,
    state: sandbox.state,
    recoverable: sandbox.recoverable,
  });
  if (sandbox.state === "error" && sandbox.recoverable) {
    try {
      await recoverSandbox(sandboxId);
    } catch (error) {
      if (!isStateChangeInProgressError(error)) {
        throw error;
      }
      console.warn("[daytona] sandbox recover already in progress", {
        sandboxId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await waitForSandboxStarted(sandboxId);
  }

  if (sandbox.state !== "started") {
    try {
      await startSandbox(sandboxId);
    } catch (error) {
      if (!isStateChangeInProgressError(error)) {
        throw error;
      }
      console.warn("[daytona] sandbox start already in progress", {
        sandboxId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await waitForSandboxStarted(sandboxId);
  }

  await markSandboxActivity(sandboxId);
}

export async function listFiles(params: {
  sandboxId: string;
  path?: string;
}): Promise<{
  path: string;
  entries: DaytonaFileEntry[];
}> {
  const pathCandidates = Array.from(new Set(buildWorkspacePathCandidates(params.path)));

  let lastError: unknown;
  for (const candidate of pathCandidates) {
    try {
      const files = await toolboxJson<
        Array<{ name: string; isDir: boolean; size: number; modTime: string }>
      >({
        sandboxId: params.sandboxId,
        path: "files",
        query: { path: candidate },
      });

      const normalizedBasePath = candidate.replace(/^\/+/, "").replace(/\/+$/, "");
      const entries = files.map((entry) => ({
        name: entry.name,
        path: `${normalizedBasePath}/${entry.name}`,
        isDir: entry.isDir,
        size: entry.size,
        modTime: entry.modTime,
      }));

      return {
        path: normalizedBasePath,
        entries,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to list files in sandbox.");
}

export async function readFile(params: {
  sandboxId: string;
  path: string;
  offset?: number;
  limit?: number;
  format?: "numbered" | "raw";
}): Promise<{
  path: string;
  content: string;
  truncated: boolean;
  isBinary: boolean;
}> {
  const filePath = normalizeWorkspacePath(params.path);
  const buffer = await toolboxDownloadFile(params.sandboxId, filePath);
  if (isBinary(buffer)) {
    return {
      path: filePath,
      content: "[binary file]",
      truncated: false,
      isBinary: true,
    };
  }

  const output = formatReadOutput(
    buffer.toString("utf8"),
    params.offset ?? 1,
    params.limit ?? READ_MAX_LINES,
    params.format ?? "numbered",
  );

  return {
    path: filePath,
    content: output.output,
    truncated: output.truncated,
    isBinary: false,
  };
}

export async function writeFile(params: {
  sandboxId: string;
  path: string;
  content: string;
}): Promise<{
  path: string;
  bytes: number;
}> {
  const filePath = normalizeWorkspacePath(params.path);
  await ensureParentFolders(params.sandboxId, filePath);
  const bytes = Buffer.from(params.content, "utf8");
  await toolboxUploadFile(params.sandboxId, filePath, bytes);

  return {
    path: filePath,
    bytes: bytes.byteLength,
  };
}

export async function editFile(params: {
  sandboxId: string;
  path: string;
  oldText: string;
  newText: string;
  replaceAll?: boolean;
}): Promise<{
  path: string;
  replacements: number;
}> {
  const filePath = normalizeWorkspacePath(params.path);
  const original = await toolboxDownloadFile(params.sandboxId, filePath);
  if (isBinary(original)) {
    throw new DaytonaRequestError("Target file is binary.", {
      endpoint: `toolbox:files/download?path=${encodeURIComponent(filePath)}`,
    });
  }

  const source = original.toString("utf8");
  if (!source.includes(params.oldText)) {
    throw new DaytonaRequestError("oldText was not found in file.", {
      endpoint: `workspace:${filePath}`,
    });
  }

  const replacements = params.replaceAll
    ? source.split(params.oldText).length - 1
    : 1;
  const next = params.replaceAll
    ? source.split(params.oldText).join(params.newText)
    : source.replace(params.oldText, params.newText);

  await toolboxUploadFile(
    params.sandboxId,
    filePath,
    Buffer.from(next, "utf8"),
  );

  return {
    path: filePath,
    replacements,
  };
}

export async function grepFiles(params: {
  sandboxId: string;
  pattern: string;
  path?: string;
  limit?: number;
}): Promise<{
  path: string;
  total: number;
  matches: DaytonaMatch[];
}> {
  const searchPath = normalizeWorkspacePath(params.path);
  const rawMatches = await toolboxJson<DaytonaMatch[] | null>({
    sandboxId: params.sandboxId,
    path: "files/find",
    query: {
      path: searchPath,
      pattern: params.pattern,
    },
  });
  const matches = Array.isArray(rawMatches) ? rawMatches : [];

  return {
    path: searchPath,
    total: matches.length,
    matches: matches.slice(0, params.limit ?? 100),
  };
}

export async function globFiles(params: {
  sandboxId: string;
  pattern: string;
  path?: string;
  limit?: number;
}): Promise<{
  path: string;
  total: number;
  files: string[];
}> {
  const searchPath = normalizeWorkspacePath(params.path);
  const response = await toolboxJson<{ files?: string[] | null } | null>({
    sandboxId: params.sandboxId,
    path: "files/search",
    query: {
      path: searchPath,
      pattern: params.pattern,
    },
  });
  const files = Array.isArray(response?.files) ? response.files : [];

  return {
    path: searchPath,
    total: files.length,
    files: files.slice(0, params.limit ?? 200),
  };
}

export async function runCommand(params: {
  sandboxId: string;
  command: string;
  cwd?: string;
  timeoutSeconds?: number;
}): Promise<{
  cwd: string;
  exitCode?: number;
  output: string;
}> {
  const cwd = normalizeWorkspacePath(params.cwd);
  const result = await toolboxJson<{ exitCode?: number; result: string }>({
    sandboxId: params.sandboxId,
    path: "process/execute",
    method: "POST",
    body: {
      command: params.command,
      cwd,
      timeout: params.timeoutSeconds ?? 90,
    },
  });

  return {
    cwd,
    exitCode: result.exitCode,
    output: result.result,
  };
}

export async function createProcessSession(params: {
  sandboxId: string;
  sessionId: string;
}): Promise<void> {
  await toolboxJson<void>({
    sandboxId: params.sandboxId,
    path: "process/session",
    method: "POST",
    body: {
      sessionId: params.sessionId,
    },
  });
}

export async function getProcessSession(params: {
  sandboxId: string;
  sessionId: string;
}): Promise<Record<string, unknown>> {
  const result = await toolboxJson<Record<string, unknown> | null>({
    sandboxId: params.sandboxId,
    path: `process/session/${encodeURIComponent(params.sessionId)}`,
  });
  return asObject(result) ?? {};
}

export async function deleteProcessSession(params: {
  sandboxId: string;
  sessionId: string;
}): Promise<void> {
  await toolboxJson<void>({
    sandboxId: params.sandboxId,
    path: `process/session/${encodeURIComponent(params.sessionId)}`,
    method: "DELETE",
  });
}

export async function executeSessionCommand(params: {
  sandboxId: string;
  sessionId: string;
  command: string;
  runAsync?: boolean;
  suppressInputEcho?: boolean;
}): Promise<{
  commandId: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  output?: string;
}> {
  const payload = await toolboxJson<Record<string, unknown> | null>({
    sandboxId: params.sandboxId,
    path: `process/session/${encodeURIComponent(params.sessionId)}/exec`,
    method: "POST",
    body: {
      command: params.command,
      runAsync: params.runAsync ?? true,
      suppressInputEcho: params.suppressInputEcho ?? false,
    },
  });

  const commandId = extractCommandId(payload);
  if (!commandId) {
    throw new DaytonaRequestError(
      "Session command started but command identifier is missing.",
      {
        endpoint: `toolbox:process/session/${params.sessionId}/exec`,
      },
    );
  }

  const streams = extractStreams(payload);
  return {
    commandId,
    exitCode: extractExitCode(payload),
    stdout: streams.stdout,
    stderr: streams.stderr,
    output: streams.output,
  };
}

export async function getSessionCommand(params: {
  sandboxId: string;
  sessionId: string;
  commandId: string;
}): Promise<{
  commandId?: string;
  exitCode?: number;
  running: boolean;
}> {
  const payload = await toolboxJson<Record<string, unknown> | null>({
    sandboxId: params.sandboxId,
    path: `process/session/${encodeURIComponent(
      params.sessionId,
    )}/command/${encodeURIComponent(params.commandId)}`,
  });
  const record = asObject(payload) ?? {};
  const merged = mergeCommandRecord(record);
  const state = pickString(merged, ["state", "status"])?.toLowerCase();
  const exitCode = extractExitCode(merged);
  const explicitRunning = merged.running;
  const running =
    typeof explicitRunning === "boolean"
      ? explicitRunning
      : exitCode === undefined &&
        state !== "done" &&
        state !== "completed" &&
        state !== "finished" &&
        state !== "failed" &&
        state !== "error" &&
        state !== "canceled" &&
        state !== "cancelled";

  return {
    commandId: extractCommandId(merged),
    exitCode,
    running,
  };
}

export async function getSessionCommandLogs(params: {
  sandboxId: string;
  sessionId: string;
  commandId: string;
}): Promise<SessionCommandStreams> {
  const payload = await toolboxJson<unknown>({
    sandboxId: params.sandboxId,
    path: `process/session/${encodeURIComponent(
      params.sessionId,
    )}/command/${encodeURIComponent(params.commandId)}/logs`,
  });
  return extractStreams(payload);
}

export async function sendSessionCommandInput(params: {
  sandboxId: string;
  sessionId: string;
  commandId: string;
  data: string;
}): Promise<void> {
  await toolboxJson<void>({
    sandboxId: params.sandboxId,
    path: `process/session/${encodeURIComponent(
      params.sessionId,
    )}/command/${encodeURIComponent(params.commandId)}/input`,
    method: "POST",
    body: {
      data: params.data,
    },
  });
}

type PreviewLinkResponse = {
  url: string;
  token?: string;
};

export async function getPreviewLink(params: {
  sandboxId: string;
  port: number;
}): Promise<PreviewLinkResponse> {
  const candidates = [
    `/sandbox/${encodeURIComponent(params.sandboxId)}/ports/${params.port}/preview-url`,
    `/workspace/${encodeURIComponent(params.sandboxId)}/ports/${params.port}/preview-url`,
  ];

  let lastError: unknown;
  for (const path of candidates) {
    try {
      return await daytonaRequest<PreviewLinkResponse>({
        path,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to create preview URL.");
}

export async function getSignedPreviewLink(params: {
  sandboxId: string;
  port: number;
  expiresInSeconds?: number;
}): Promise<PreviewLinkResponse> {
  const candidates: Array<{
    path: string;
    method?: RequestMethod;
    body?: unknown;
    query?: Record<string, string | number | undefined>;
  }> = [
    {
      path: `/sandbox/${encodeURIComponent(params.sandboxId)}/ports/${params.port}/signed-preview-url`,
      method: "GET",
      query: { expiresInSeconds: params.expiresInSeconds ?? 3600 },
    },
    {
      path: `/sandbox/${encodeURIComponent(params.sandboxId)}/ports/${params.port}/preview-url`,
      method: "GET",
    },
    {
      path: `/workspace/${encodeURIComponent(params.sandboxId)}/ports/${params.port}/preview-url`,
      method: "GET",
    },
  ];

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await daytonaRequest<PreviewLinkResponse>({
        path: candidate.path,
        method: candidate.method,
        body: candidate.body,
        query: candidate.query,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to create signed preview URL.");
}

export async function getTerminalLink(params: {
  sandboxId: string;
  expiresInSeconds?: number;
}): Promise<PreviewLinkResponse> {
  const terminalPort = 22222;
  try {
    return await getSignedPreviewLink({
      sandboxId: params.sandboxId,
      port: terminalPort,
      expiresInSeconds: params.expiresInSeconds ?? 3600,
    });
  } catch {
    return await getPreviewLink({
      sandboxId: params.sandboxId,
      port: terminalPort,
    });
  }
}

export function classifyDaytonaError(error: unknown): DaytonaToolError {
  if (error instanceof DaytonaRequestError) {
    const status = error.status;

    if (status === 401) {
      return {
        category: "auth",
        message: error.message,
        retriable: false,
        httpStatus: status,
        endpoint: error.endpoint,
        requestId: error.requestId,
        hint: "Check DAYTONA_API_KEY and organization scope.",
        raw: error.bodyText,
      };
    }

    if (status === 403) {
      return {
        category: "permission",
        message: error.message,
        retriable: false,
        httpStatus: status,
        endpoint: error.endpoint,
        requestId: error.requestId,
        hint: "Verify the API key has sandbox/toolbox permissions for this org.",
        raw: error.bodyText,
      };
    }

    if (status === 404) {
      return {
        category: "not_found",
        message: error.message,
        retriable: false,
        httpStatus: status,
        endpoint: error.endpoint,
        requestId: error.requestId,
        hint: "Sandbox or path may not exist.",
        raw: error.bodyText,
      };
    }

    if (status === 409) {
      return {
        category: "conflict",
        message: error.message,
        retriable: true,
        httpStatus: status,
        endpoint: error.endpoint,
        requestId: error.requestId,
        hint: "Sandbox may still be starting; retry shortly.",
        raw: error.bodyText,
      };
    }

    if (status === 408 || status === 504) {
      return {
        category: "timeout",
        message: error.message,
        retriable: true,
        httpStatus: status,
        endpoint: error.endpoint,
        requestId: error.requestId,
        hint: "Retry with a shorter command or a longer timeout.",
        raw: error.bodyText,
      };
    }

    if (status === 429) {
      return {
        category: "rate_limit",
        message: error.message,
        retriable: true,
        httpStatus: status,
        endpoint: error.endpoint,
        requestId: error.requestId,
        hint: "Retry after a short delay.",
        raw: error.bodyText,
      };
    }

    if (status === 400 || status === 422) {
      if (isStateChangeInProgressError(error)) {
        return {
          category: "sandbox_state",
          message: error.message,
          retriable: true,
          httpStatus: status,
          endpoint: error.endpoint,
          requestId: error.requestId,
          hint: "Sandbox is still transitioning state. Retry after it finishes starting or recovering.",
          raw: error.bodyText,
        };
      }

      return {
        category: "invalid_request",
        message: error.message,
        retriable: false,
        httpStatus: status,
        endpoint: error.endpoint,
        requestId: error.requestId,
        raw: error.bodyText,
      };
    }

    return {
      category: "unknown",
      message: error.message,
      retriable: status !== undefined && status >= 500,
      httpStatus: status,
      endpoint: error.endpoint,
      requestId: error.requestId,
      raw: error.bodyText,
    };
  }

  if (error instanceof Error) {
    const normalized = error.message.toLowerCase();
    if (
      normalized.includes("/usr/bin/zsh") &&
      normalized.includes("no such file or directory")
    ) {
      return {
        category: "sandbox_state",
        message: error.message,
        retriable: false,
        hint:
          "The sandbox user's login shell is set to /usr/bin/zsh, but that binary is missing. Recreate the sandbox with a valid shell or set DAYTONA_SANDBOX_USER for new labs.",
      };
    }

    if (normalized.includes("did not reach started state within")) {
      return {
        category: "sandbox_state",
        message: error.message,
        retriable: true,
        hint:
          "Sandbox startup is still in progress or stalled. Retry after it finishes starting.",
      };
    }

    if (normalized.includes("network") || normalized.includes("fetch")) {
      return {
        category: "network",
        message: error.message,
        retriable: true,
      };
    }

    return {
      category: "unknown",
      message: error.message,
      retriable: false,
    };
  }

  return {
    category: "unknown",
    message: String(error),
    retriable: false,
  };
}

export function formatErrorSummary(operation: string, error: unknown): string {
  const detail = classifyDaytonaError(error);
  const statusLabel = detail.httpStatus ? ` (${detail.httpStatus})` : "";
  return `${operation} failed${statusLabel}: ${detail.message}`;
}

export function truncateOutput(value: string, maxLength = 12_000): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}
