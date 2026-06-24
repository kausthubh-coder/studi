export type LabRuntimeProviderName = "daytona";

export type LabLanguage = "python" | "javascript" | "typescript";

export type LabSessionStatus = "starting" | "ready" | "error" | "archived";

export type LabRuntimeFileEntry = {
  path: string;
  name: string;
  type: "file" | "directory";
  size?: number;
  modifiedAt?: number;
};

export type LabRuntimeSearchMatch = {
  path: string;
  line?: number;
  content?: string;
};

export type LabRuntimeCommandResult = {
  command: string;
  cwd?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  output?: string;
};

export type LabRuntimePreview = {
  port: number;
  url: string;
  token?: string;
};

export type LabRuntimeSession = {
  provider: LabRuntimeProviderName;
  sandboxId: string;
  workspacePath: string;
  status: LabSessionStatus;
  previewUrls?: LabRuntimePreview[];
};

export type LabRuntimeCreateInput = {
  title?: string;
  language?: LabLanguage;
  labels?: Record<string, string>;
};

export type LabRuntimeProvider = {
  create(input: LabRuntimeCreateInput): Promise<LabRuntimeSession>;
  resume(input: { sandboxId: string }): Promise<LabRuntimeSession>;
  list(input: { sandboxId: string; path: string }): Promise<LabRuntimeFileEntry[]>;
  read(input: { sandboxId: string; path: string }): Promise<string>;
  write(input: {
    sandboxId: string;
    path: string;
    content: string;
  }): Promise<void>;
  createFile(input: {
    sandboxId: string;
    path: string;
    content?: string;
  }): Promise<void>;
  rename(input: {
    sandboxId: string;
    oldPath: string;
    newPath: string;
  }): Promise<void>;
  delete(input: {
    sandboxId: string;
    path: string;
    recursive?: boolean;
  }): Promise<void>;
  search(input: {
    sandboxId: string;
    path: string;
    query: string;
  }): Promise<LabRuntimeSearchMatch[]>;
  runCommand(input: {
    sandboxId: string;
    command: string;
    cwd?: string;
    timeoutSec?: number;
  }): Promise<LabRuntimeCommandResult>;
  createSession(input: {
    sandboxId: string;
    sessionId: string;
  }): Promise<{ sessionId: string }>;
  runSessionCommand(input: {
    sandboxId: string;
    sessionId: string;
    command: string;
    timeoutSec?: number;
  }): Promise<LabRuntimeCommandResult & { commandId?: string }>;
  createPty(input: {
    sandboxId: string;
    ptyId: string;
    cwd?: string;
    cols?: number;
    rows?: number;
  }): Promise<{ ptyId: string; initialOutput?: string }>;
  getPreview(input: {
    sandboxId: string;
    port: number;
    signed?: boolean;
  }): Promise<LabRuntimePreview>;
  archive(input: { sandboxId: string }): Promise<void>;
};

export function normalizeLabPath(path: string | undefined, fallback = ".") {
  const trimmed = path?.trim();
  if (!trimmed) return fallback;

  const normalized = trimmed.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    throw new Error("Lab paths must be workspace-relative");
  }

  const parts = normalized
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
  if (parts.some((part) => part === "..")) {
    throw new Error("Lab paths must stay within the workspace");
  }

  return parts.join("/") || fallback;
}

export function makeLabSessionName(title: string | undefined) {
  const stem = title?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "lab";
  return `studi-${stem.slice(0, 42).replace(/^-|-$/g, "")}-${Date.now()}`;
}
