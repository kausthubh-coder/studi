"use node";

import { v } from "convex/values";
import type {
  CodeSandbox as CodeSandboxClient,
  Sandbox,
  SandboxClient,
} from "@codesandbox/sdk";
import { internalAction } from "./_generated/server";
import {
  deserializeHostToken,
  serializeHostToken,
  serializeSandboxSession,
  type SerializedHostToken,
} from "../lib/lab/clientSession";
import {
  getLabTemplateDefinition,
  type LabTemplateKey,
} from "../lib/lab-runtime/profiles";

// Convex only accepts the SDK here through its CommonJS export path.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const codeSandboxSdk = require("@codesandbox/sdk") as typeof import("@codesandbox/sdk");
const { CodeSandbox, CommandError } = codeSandboxSdk;

const WORKSPACE_ROOT_FALLBACK = "/project/workspace";
const READ_MAX_LINES = 2000;
const READ_MAX_BYTES = 50 * 1024;
const READ_MAX_LINE_LENGTH = 2000;
const DEFAULT_HIBERNATION_TIMEOUT_SECONDS = 1800;
const DEFAULT_HOST_TOKEN_TTL_SECONDS = 15 * 60;
const DELETE_CONFIRM_TIMEOUT_MS = 30_000;
const DEFAULT_COMMAND_TIMEOUT_SECONDS = 90;
const RIPGREP_MAX_MATCHES = 300;

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

type LabRuntimeMatch = {
  file: string;
  line: number;
  content: string;
};

type LabRuntimeErrorContext = {
  category?: LabRuntimeErrorCategory;
  status?: number;
  endpoint?: string;
  requestId?: string;
  hint?: string;
  raw?: string;
  exitCode?: number;
  retriable?: boolean;
};

class LabRuntimeRequestError extends Error {
  readonly category?: LabRuntimeErrorCategory;
  readonly status?: number;
  readonly endpoint?: string;
  readonly requestId?: string;
  readonly hint?: string;
  readonly raw?: string;
  readonly exitCode?: number;
  readonly retriable?: boolean;

  constructor(message: string, context: LabRuntimeErrorContext = {}) {
    super(message);
    this.name = "LabRuntimeRequestError";
    this.category = context.category;
    this.status = context.status;
    this.endpoint = context.endpoint;
    this.requestId = context.requestId;
    this.hint = context.hint;
    this.raw = context.raw;
    this.exitCode = context.exitCode;
    this.retriable = context.retriable;
  }
}

let codeSandboxClient: CodeSandboxClient | null = null;
let codeSandboxClientApiKey: string | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCodeSandboxClient() {
  const apiKey = process.env.CSB_API_KEY?.trim();
  if (!apiKey) {
    throw new LabRuntimeRequestError(
      "CSB_API_KEY is missing in Convex environment variables.",
      {
        category: "auth",
        endpoint: "env:CSB_API_KEY",
        hint: "Configure CSB_API_KEY before using labs.",
      },
    );
  }

  if (codeSandboxClient && codeSandboxClientApiKey === apiKey) {
    return codeSandboxClient;
  }

  codeSandboxClient = new CodeSandbox(apiKey);
  codeSandboxClientApiKey = apiKey;
  return codeSandboxClient;
}

function getTemplateId(templateKey: LabTemplateKey) {
  const template = getLabTemplateDefinition(templateKey);
  const overrideTemplateId = process.env[template.envVarName]?.trim();
  if (overrideTemplateId) {
    return overrideTemplateId;
  }

  return template.officialTemplateId;
}

function getHibernationTimeoutSeconds() {
  const raw = process.env.CSB_HIBERNATION_TIMEOUT_SECONDS?.trim();
  if (!raw) {
    return DEFAULT_HIBERNATION_TIMEOUT_SECONDS;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_HIBERNATION_TIMEOUT_SECONDS;
  }

  return parsed;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

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

function dirnamePosixPath(input: string) {
  const normalized = normalizePosixPath(input);
  if (normalized === "/") {
    return "/";
  }

  const trimmed =
    normalized.length > 1 && normalized.endsWith("/")
      ? normalized.slice(0, -1)
      : normalized;
  const lastSlash = trimmed.lastIndexOf("/");

  if (lastSlash < 0) {
    return ".";
  }

  if (lastSlash === 0) {
    return "/";
  }

  return trimmed.slice(0, lastSlash);
}

function ensureAbsoluteWorkspacePath(workspacePath?: string) {
  const raw = workspacePath?.trim();
  if (!raw) {
    return WORKSPACE_ROOT_FALLBACK;
  }

  const normalized = normalizePosixPath(raw);
  if (!normalized.startsWith("/")) {
    throw new LabRuntimeRequestError(
      "workspacePath must be an absolute sandbox path.",
      {
        category: "invalid_request",
        endpoint: "path-normalization",
      },
    );
  }

  return normalized.replace(/\/+$/, "") || "/";
}

export function normalizeLabPath(input: string | undefined, workspacePath: string) {
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

  throw new LabRuntimeRequestError("Path must stay inside the lab workspace.", {
    category: "invalid_request",
    endpoint: "path-normalization",
    hint: "Use paths inside the sandbox workspace only.",
  });
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

  throw new LabRuntimeRequestError("Path must stay inside the lab workspace.", {
    category: "invalid_request",
    endpoint: "path-normalization",
  });
}

function getCommandTarget(absolutePath: string, workspacePath: string) {
  const relative = toRelativeLabPath(absolutePath, workspacePath);
  return relative === "." ? "." : relative;
}

function isBinary(bytes: Uint8Array) {
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
) {
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

  return {
    output: output.join("\n"),
    truncated: end < lines.length || output.length < selected.length,
  };
}

async function withSandboxClient<T>(
  sandboxId: string,
  handler: (sandbox: Sandbox, client: SandboxClient) => Promise<T>,
) {
  const sdk = getCodeSandboxClient();
  const sandbox = await sdk.sandboxes.resume(sandboxId);
  const client = await sandbox.connect({
    permission: "write",
  });

  try {
    return await handler(sandbox, client);
  } finally {
    await client.disconnect().catch(() => undefined);
    client.dispose();
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Promise<void>,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          void onTimeout()
            .catch(() => undefined)
            .finally(() => {
              reject(
                new LabRuntimeRequestError(
                  `Command timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`,
                  {
                    category: "timeout",
                    retriable: true,
                  },
                ),
              );
            });
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function runBackgroundCommand(params: {
  sandboxId: string;
  workspacePath: string;
  cwd?: string;
  command: string;
  timeoutSeconds?: number;
}) {
  const workspacePath = ensureAbsoluteWorkspacePath(params.workspacePath);
  const cwd = normalizeLabPath(params.cwd, workspacePath);

  return await withSandboxClient(params.sandboxId, async (_sandbox, client) => {
    const command = await client.commands.runBackground(params.command, {
      cwd,
      asGlobalSession: true,
    });

    try {
      const output = await withTimeout(
        command.waitUntilComplete(),
        Math.max(1, params.timeoutSeconds ?? DEFAULT_COMMAND_TIMEOUT_SECONDS) *
          1000,
        async () => {
          await command.kill().catch(() => undefined);
        },
      );

      return {
        cwd,
        exitCode: 0,
        output,
      };
    } catch (error) {
      if (error instanceof CommandError) {
        return {
          cwd,
          exitCode: error.exitCode,
          output: error.output,
        };
      }

      throw error;
    }
  });
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

function parseRipgrepFiles(output: string, limit: number) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function readStatusCandidate(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidates = [
    (error as { status?: unknown }).status,
    (error as { statusCode?: unknown }).statusCode,
    (error as { response?: { status?: unknown } }).response?.status,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function readStringCandidate(
  error: unknown,
  read: (value: Record<string, unknown>) => unknown,
) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const value = read(error as Record<string, unknown>);
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

export async function createSandbox(params: {
  templateKey: LabTemplateKey;
  runtimeProfileId?: string;
  title?: string;
}) {
  const sdk = getCodeSandboxClient();
  const sandbox = await sdk.sandboxes.create({
    id: getTemplateId(params.templateKey),
    privacy: "private",
    title: params.title ?? "Studi Lab",
    tags: [
      "app=studi",
      "scope=lab",
      `templateKey=${params.templateKey}`,
      `runtimeProfileId=${params.runtimeProfileId ?? "default"}`,
    ],
    hibernationTimeoutSeconds: getHibernationTimeoutSeconds(),
  });

  const session = await sandbox.createSession({
    permission: "write",
  });

  return {
    sandboxId: sandbox.id,
    workspacePath: ensureAbsoluteWorkspacePath(session.workspacePath),
    templateKey: params.templateKey,
  };
}

export async function resumeSandbox(sandboxId: string) {
  return await getCodeSandboxClient().sandboxes.resume(sandboxId);
}

export async function hibernateSandbox(sandboxId: string) {
  await getCodeSandboxClient().sandboxes.hibernate(sandboxId);
}

export async function deleteSandboxAndConfirm(sandboxId: string) {
  const sdk = getCodeSandboxClient();

  try {
    await sdk.sandboxes.delete(sandboxId);
  } catch (error) {
    const detail = classifyLabRuntimeError(error);
    if (detail.category === "not_found") {
      return;
    }
    throw error;
  }

  const deadline = Date.now() + DELETE_CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await sdk.sandboxes.get(sandboxId);
      await sleep(250);
    } catch (error) {
      const detail = classifyLabRuntimeError(error);
      if (detail.category === "not_found") {
        return;
      }
      throw error;
    }
  }

  throw new LabRuntimeRequestError(
    `Sandbox ${sandboxId} was not confirmed deleted within ${DELETE_CONFIRM_TIMEOUT_MS / 1000} seconds.`,
    {
      category: "timeout",
      retriable: true,
    },
  );
}

export async function createHostToken(params: {
  sandboxId: string;
  expiresInSeconds?: number;
}) {
  const hostToken = await getCodeSandboxClient().hosts.createToken(
    params.sandboxId,
    {
      expiresAt: new Date(
        Date.now() +
          (params.expiresInSeconds ?? DEFAULT_HOST_TOKEN_TTL_SECONDS) * 1000,
      ),
    },
  );
  return serializeHostToken(hostToken);
}

export async function createBrowserSession(params: {
  sandboxId: string;
  sessionId?: string;
  hostToken?: SerializedHostToken;
}) {
  const sandbox = await resumeSandbox(params.sandboxId);
  const session = await sandbox.createSession({
    id: params.sessionId,
    permission: "write",
    hostToken: params.hostToken
      ? deserializeHostToken(params.hostToken)
      : undefined,
  });
  return serializeSandboxSession(session);
}

export async function listFiles(params: {
  sandboxId: string;
  workspacePath: string;
  path?: string;
}) {
  const workspacePath = ensureAbsoluteWorkspacePath(params.workspacePath);
  const directoryPath = normalizeLabPath(params.path, workspacePath);

  return await withSandboxClient(params.sandboxId, async (_sandbox, client) => {
    const entries = await client.fs.readdir(directoryPath);
    const detailedEntries = await Promise.all(
      entries.map(async (entry) => {
        const absoluteEntryPath = joinPosixPath(directoryPath, entry.name);
        const stat = await client.fs.stat(absoluteEntryPath);
        return {
          name: entry.name,
          path: toRelativeLabPath(absoluteEntryPath, workspacePath),
          isDir: entry.type === "directory",
          size: stat.size,
          modTime: new Date(stat.mtime).toISOString(),
        } satisfies LabRuntimeFileEntry;
      }),
    );

    return {
      path: toRelativeLabPath(directoryPath, workspacePath),
      entries: detailedEntries,
    };
  });
}

export async function readFile(params: {
  sandboxId: string;
  workspacePath: string;
  path: string;
  offset?: number;
  limit?: number;
  format?: "numbered" | "raw";
}) {
  const workspacePath = ensureAbsoluteWorkspacePath(params.workspacePath);
  const filePath = normalizeLabPath(params.path, workspacePath);

  return await withSandboxClient(params.sandboxId, async (_sandbox, client) => {
    const bytes = await client.fs.readFile(filePath);
    if (isBinary(bytes)) {
      return {
        path: toRelativeLabPath(filePath, workspacePath),
        content: "[binary file]",
        truncated: false,
        isBinary: true,
      };
    }

    const output = formatReadOutput(
      Buffer.from(bytes).toString("utf8"),
      params.offset ?? 1,
      params.limit ?? READ_MAX_LINES,
      params.format ?? "numbered",
    );

    return {
      path: toRelativeLabPath(filePath, workspacePath),
      content: output.output,
      truncated: output.truncated,
      isBinary: false,
    };
  });
}

async function ensureParentDirectories(
  client: SandboxClient,
  filePath: string,
  workspacePath: string,
) {
  const parent = dirnamePosixPath(filePath);
  if (parent === workspacePath || parent === "." || parent === "/") {
    return;
  }

  const relativeParent = toRelativeLabPath(parent, workspacePath);
  const segments = relativeParent === "." ? [] : relativeParent.split("/");
  let current = workspacePath;
  for (const segment of segments) {
    current = joinPosixPath(current, segment);
    await client.fs.mkdir(current, true).catch(() => undefined);
  }
}

export async function writeFile(params: {
  sandboxId: string;
  workspacePath: string;
  path: string;
  content: string;
}) {
  const workspacePath = ensureAbsoluteWorkspacePath(params.workspacePath);
  const filePath = normalizeLabPath(params.path, workspacePath);

  return await withSandboxClient(params.sandboxId, async (_sandbox, client) => {
    await ensureParentDirectories(client, filePath, workspacePath);
    await client.fs.writeTextFile(filePath, params.content, {
      create: true,
      overwrite: true,
    });

    return {
      path: toRelativeLabPath(filePath, workspacePath),
      bytes: Buffer.byteLength(params.content, "utf8"),
    };
  });
}

export async function editFile(params: {
  sandboxId: string;
  workspacePath: string;
  path: string;
  oldText: string;
  newText: string;
  replaceAll?: boolean;
}) {
  const workspacePath = ensureAbsoluteWorkspacePath(params.workspacePath);
  const filePath = normalizeLabPath(params.path, workspacePath);

  return await withSandboxClient(params.sandboxId, async (_sandbox, client) => {
    const source = await client.fs.readTextFile(filePath);
    if (!source.includes(params.oldText)) {
      throw new LabRuntimeRequestError("oldText was not found in file.", {
        category: "invalid_request",
        endpoint: filePath,
      });
    }

    const replacements = params.replaceAll
      ? source.split(params.oldText).length - 1
      : 1;
    const next = params.replaceAll
      ? source.split(params.oldText).join(params.newText)
      : source.replace(params.oldText, params.newText);

    await client.fs.writeTextFile(filePath, next, {
      create: false,
      overwrite: true,
    });

    return {
      path: toRelativeLabPath(filePath, workspacePath),
      replacements,
    };
  });
}

export async function grepFiles(params: {
  sandboxId: string;
  workspacePath: string;
  pattern: string;
  path?: string;
  limit?: number;
}) {
  const workspacePath = ensureAbsoluteWorkspacePath(params.workspacePath);
  const searchPath = normalizeLabPath(params.path, workspacePath);
  const limit = Math.max(1, Math.min(params.limit ?? RIPGREP_MAX_MATCHES, RIPGREP_MAX_MATCHES));
  const target = getCommandTarget(searchPath, workspacePath);
  const command =
    `bash -lc ${shellQuote(
      `set +e; rg -n --no-heading --hidden --color never -e ${shellQuote(
        params.pattern,
      )} ${shellQuote(target)}; status=$?; if [ "$status" -le 1 ]; then exit 0; fi; exit "$status"`,
    )}`;

  const result = await runBackgroundCommand({
    sandboxId: params.sandboxId,
    workspacePath,
    cwd: ".",
    command,
    timeoutSeconds: 30,
  });

  const matches = parseRipgrepMatches(result.output, limit);
  return {
    path: toRelativeLabPath(searchPath, workspacePath),
    total: matches.length,
    matches,
  };
}

export async function globFiles(params: {
  sandboxId: string;
  workspacePath: string;
  pattern: string;
  path?: string;
  limit?: number;
}) {
  const workspacePath = ensureAbsoluteWorkspacePath(params.workspacePath);
  const searchPath = normalizeLabPath(params.path, workspacePath);
  const limit = Math.max(1, Math.min(params.limit ?? RIPGREP_MAX_MATCHES, RIPGREP_MAX_MATCHES));
  const target = getCommandTarget(searchPath, workspacePath);
  const command =
    `bash -lc ${shellQuote(
      `set +e; rg --files --hidden -g ${shellQuote(
        params.pattern,
      )} ${shellQuote(target)}; status=$?; if [ "$status" -le 1 ]; then exit 0; fi; exit "$status"`,
    )}`;

  const result = await runBackgroundCommand({
    sandboxId: params.sandboxId,
    workspacePath,
    cwd: ".",
    command,
    timeoutSeconds: 30,
  });

  const files = parseRipgrepFiles(result.output, limit);
  return {
    path: toRelativeLabPath(searchPath, workspacePath),
    total: files.length,
    files,
  };
}

export async function runCommand(params: {
  sandboxId: string;
  workspacePath: string;
  command: string;
  cwd?: string;
  timeoutSeconds?: number;
}) {
  const workspacePath = ensureAbsoluteWorkspacePath(params.workspacePath);
  const result = await runBackgroundCommand({
    sandboxId: params.sandboxId,
    workspacePath,
    cwd: params.cwd,
    command: params.command,
    timeoutSeconds: params.timeoutSeconds,
  });

  return {
    cwd: toRelativeLabPath(result.cwd, workspacePath),
    exitCode: result.exitCode,
    output: result.output,
  };
}

export async function waitForPort(params: {
  sandboxId: string;
  port: number;
  timeoutSeconds?: number;
}) {
  return await withSandboxClient(params.sandboxId, async (_sandbox, client) => {
    return await client.ports.waitForPort(params.port, {
      timeoutMs: Math.max(1, params.timeoutSeconds ?? 60) * 1000,
    });
  });
}

export function classifyLabRuntimeError(error: unknown): LabRuntimeError {
  if (error instanceof LabRuntimeRequestError) {
    const httpStatus = error.status;
    if (error.category) {
      return {
        category: error.category,
        message: error.message,
        retriable: error.retriable ?? error.category === "timeout",
        httpStatus,
        endpoint: error.endpoint,
        requestId: error.requestId,
        hint: error.hint,
        raw: error.raw,
        exitCode: error.exitCode,
      };
    }
  }

  if (error instanceof CommandError) {
    return {
      category: "command_failed",
      message: error.message,
      retriable: false,
      exitCode: error.exitCode,
      raw: error.output,
    };
  }

  const status = readStatusCandidate(error);
  const endpoint = readStringCandidate(error, (value) => value.endpoint);
  const requestId = readStringCandidate(error, (value) => value.requestId);
  const raw = readStringCandidate(error, (value) => value.body)
    ?? readStringCandidate(error, (value) => value.raw)
    ?? readStringCandidate(error, (value) => value.responseBody);
  const message =
    (error instanceof Error ? error.message : undefined)
    ?? readStringCandidate(error, (value) => value.message)
    ?? String(error);

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

  const normalized = message.toLowerCase();
  if (normalized.includes("timeout")) {
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
    normalized.includes("network") ||
    normalized.includes("fetch") ||
    normalized.includes("socket")
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

export const execute = internalAction({
  args: {
    operation: v.union(
      v.literal("createSandbox"),
      v.literal("resumeSandbox"),
      v.literal("hibernateSandbox"),
      v.literal("deleteSandboxAndConfirm"),
      v.literal("createHostToken"),
      v.literal("createBrowserSession"),
      v.literal("listFiles"),
      v.literal("readFile"),
      v.literal("writeFile"),
      v.literal("editFile"),
      v.literal("grepFiles"),
      v.literal("globFiles"),
      v.literal("runCommand"),
      v.literal("waitForPort"),
    ),
    payload: v.any(),
  },
  returns: v.any(),
  handler: async (_ctx, args) => {
    switch (args.operation) {
      case "createSandbox":
        return await createSandbox(args.payload);
      case "resumeSandbox":
        await resumeSandbox((args.payload as { sandboxId: string }).sandboxId);
        return null;
      case "hibernateSandbox":
        await hibernateSandbox((args.payload as { sandboxId: string }).sandboxId);
        return null;
      case "deleteSandboxAndConfirm":
        await deleteSandboxAndConfirm(
          (args.payload as { sandboxId: string }).sandboxId,
        );
        return null;
      case "createHostToken":
        return await createHostToken(args.payload);
      case "createBrowserSession":
        return await createBrowserSession(args.payload);
      case "listFiles":
        return await listFiles(args.payload);
      case "readFile":
        return await readFile(args.payload);
      case "writeFile":
        return await writeFile(args.payload);
      case "editFile":
        return await editFile(args.payload);
      case "grepFiles":
        return await grepFiles(args.payload);
      case "globFiles":
        return await globFiles(args.payload);
      case "runCommand":
        return await runCommand(args.payload);
      case "waitForPort":
        return await waitForPort(args.payload);
      default:
        throw new Error(`Unsupported lab runtime operation: ${args.operation}`);
    }
  },
});
