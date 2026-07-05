import type {
  CodeSparkFileRole,
  CodeSparkLanguage,
  CodeSparkProvider,
} from "../sparks/contracts";

export type CodeSparkRuntimeFile = {
  path: string;
  language: CodeSparkLanguage;
  contents: string;
  editable: boolean;
  role: CodeSparkFileRole;
};

export type CreateCodeSparkSessionInput = {
  sessionKey: string;
  language: CodeSparkLanguage;
  files: CodeSparkRuntimeFile[];
  providerSessionId?: string;
};

export type CodeSparkRuntimeSession = {
  provider: CodeSparkProvider;
  providerSessionId: string;
  status: "ready" | "unavailable";
  reason?: string;
};

export type CodeSparkRuntimeCommand = {
  command: string;
  kind: "run" | "test";
  timeoutMs?: number;
  language?: CodeSparkLanguage;
};

export type CodeSparkRuntimeFilePatch = CodeSparkRuntimeFile;

export type CodeSparkRuntimeRunResult = {
  provider: CodeSparkProvider;
  status: "passed" | "failed" | "timed_out" | "unavailable";
  stdout: string;
  stderr: string;
  exitCode?: number;
  durationMs: number;
  command: string;
  timedOut: boolean;
  reason?: string;
};

export interface CodeSparkRuntimeProvider {
  readonly provider: CodeSparkProvider;
  createSession(input: CreateCodeSparkSessionInput): Promise<CodeSparkRuntimeSession>;
  hydrateSession(input: CreateCodeSparkSessionInput): Promise<CodeSparkRuntimeSession>;
  listFiles(sessionId: string): Promise<CodeSparkRuntimeFile[]>;
  readFile(sessionId: string, path: string): Promise<CodeSparkRuntimeFile>;
  writeFile(
    sessionId: string,
    file: CodeSparkRuntimeFilePatch,
  ): Promise<CodeSparkRuntimeFile>;
  runCommand(
    sessionId: string,
    command: CodeSparkRuntimeCommand,
  ): Promise<CodeSparkRuntimeRunResult>;
  runTests(
    sessionId: string,
    command: CodeSparkRuntimeCommand,
  ): Promise<CodeSparkRuntimeRunResult>;
  snapshot(sessionId: string): Promise<{ providerSnapshotId?: string }>;
  stop(sessionId: string): Promise<void>;
}
