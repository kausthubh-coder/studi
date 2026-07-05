import type {
  CodeSparkRuntimeCommand,
  CodeSparkRuntimeFile,
  CodeSparkRuntimeFilePatch,
  CodeSparkRuntimeProvider,
  CodeSparkRuntimeRunResult,
  CodeSparkRuntimeSession,
  CreateCodeSparkSessionInput,
} from "./types";

// Production provider selection lives in convex/codeSparkRuntime.ts because
// Vercel Sandbox must be bundled in Convex's Node runtime. This module is
// deterministic fake/test support plus the bundle-safe config re-export only.
export { getCodeSparkProviderConfig } from "./config";

const minTimeoutMs = 10_000;
const maxTimeoutMs = 45_000;

function now() {
  return Date.now();
}

function clampTimeout(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 15_000;
  }
  return Math.min(maxTimeoutMs, Math.max(minTimeoutMs, value));
}

function cloneFile(file: CodeSparkRuntimeFile): CodeSparkRuntimeFile {
  return { ...file };
}

export class FakeCodeSparkRuntimeProvider implements CodeSparkRuntimeProvider {
  readonly provider = "local_fake" as const;
  private sessions = new Map<string, CodeSparkRuntimeFile[]>();

  async createSession(
    input: CreateCodeSparkSessionInput,
  ): Promise<CodeSparkRuntimeSession> {
    this.sessions.set(input.sessionKey, input.files.map(cloneFile));
    return {
      provider: this.provider,
      providerSessionId: input.sessionKey,
      status: "ready",
    };
  }

  async hydrateSession(
    input: CreateCodeSparkSessionInput,
  ): Promise<CodeSparkRuntimeSession> {
    if (!this.sessions.has(input.sessionKey)) {
      this.sessions.set(input.sessionKey, input.files.map(cloneFile));
    }
    return {
      provider: this.provider,
      providerSessionId: input.sessionKey,
      status: "ready",
    };
  }

  async listFiles(sessionId: string): Promise<CodeSparkRuntimeFile[]> {
    return (this.sessions.get(sessionId) ?? []).map(cloneFile);
  }

  async readFile(
    sessionId: string,
    path: string,
  ): Promise<CodeSparkRuntimeFile> {
    const file = this.sessions.get(sessionId)?.find((item) => item.path === path);
    if (!file) {
      throw new Error(`Code Spark file not found: ${path}`);
    }
    return cloneFile(file);
  }

  async writeFile(
    sessionId: string,
    file: CodeSparkRuntimeFilePatch,
  ): Promise<CodeSparkRuntimeFile> {
    const files = this.sessions.get(sessionId) ?? [];
    const existingIndex = files.findIndex((item) => item.path === file.path);
    const nextFile = cloneFile(file);
    if (existingIndex >= 0) {
      files[existingIndex] = nextFile;
    } else {
      files.push(nextFile);
    }
    this.sessions.set(sessionId, files);
    return cloneFile(nextFile);
  }

  async runCommand(
    sessionId: string,
    command: CodeSparkRuntimeCommand,
  ): Promise<CodeSparkRuntimeRunResult> {
    const startedAt = now();
    const files = this.sessions.get(sessionId) ?? [];
    const joined = files.map((file) => file.contents).join("\n");
    const timedOut = command.command.includes("sleep") || command.timeoutMs === 1;
    const passed =
      !timedOut &&
      (joined.includes("return a + b") ||
        joined.includes("print('updated')") ||
        joined.includes('print("updated")') ||
        command.kind === "run");

    return {
      provider: this.provider,
      status: timedOut ? "timed_out" : passed ? "passed" : "failed",
      stdout: timedOut
        ? ""
        : passed
          ? "local_fake: visible checks passed\n"
          : "local_fake: visible checks failed\n",
      stderr: timedOut ? "Command timed out in local_fake.\n" : "",
      exitCode: timedOut ? undefined : passed ? 0 : 1,
      durationMs: Math.max(1, now() - startedAt),
      command: command.command,
      timedOut,
      reason: timedOut
        ? `Command exceeded ${clampTimeout(command.timeoutMs)}ms timeout.`
        : undefined,
    };
  }

  async runTests(
    sessionId: string,
    command: CodeSparkRuntimeCommand,
  ): Promise<CodeSparkRuntimeRunResult> {
    return this.runCommand(sessionId, { ...command, kind: "test" });
  }

  async snapshot(): Promise<{ providerSnapshotId?: string }> {
    return {};
  }

  async stop(): Promise<void> {}
}
