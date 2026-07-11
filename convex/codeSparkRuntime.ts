"use node";

import type { CodeSparkLanguage } from "../lib/sparks/contracts";
import {
  getCodeSparkProviderConfig,
  requiresExplicitVercelSandboxAuth,
} from "../lib/code-sparks/config";
import type {
  CodeSparkRuntimeCommand,
  CodeSparkRuntimeFile,
  CodeSparkRuntimeFilePatch,
  CodeSparkRuntimeProvider,
  CodeSparkRuntimeRunResult,
  CodeSparkRuntimeSession,
  CreateCodeSparkSessionInput,
} from "../lib/code-sparks/types";

type VercelSandboxConstructor = (typeof import("@vercel/sandbox"))["Sandbox"];
type VercelSandboxHandle = Awaited<
  ReturnType<VercelSandboxConstructor["get"]>
>;

const outputCap = 12_000;
const minTimeoutMs = 10_000;
const maxTimeoutMs = 45_000;
const sandboxTimeoutMs = 2 * 60_000;
const providerUnavailableMessage =
  "Code Spark runtime provider is unavailable. Try again in a moment.";
const providerTimeoutMessage =
  "Code Spark runtime timed out. Try a smaller change.";
let sandboxNameSequence = 0;

function now() {
  return Date.now();
}

function sessionKeyHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function nextSandboxName(sessionKey: string): string {
  sandboxNameSequence = (sandboxNameSequence + 1) % 1_000_000;
  return [
    "studi-code-spark",
    sessionKeyHash(sessionKey),
    now().toString(36),
    sandboxNameSequence.toString(36),
  ].join("-");
}

function capOutput(value: string): string {
  return value.length <= outputCap
    ? value
    : `${value.slice(0, outputCap - 80)}\n[output truncated at ${outputCap} characters]`;
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

class FakeCodeSparkRuntimeProvider implements CodeSparkRuntimeProvider {
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

class UnavailableCodeSparkRuntimeProvider implements CodeSparkRuntimeProvider {
  readonly provider = "unavailable" as const;

  constructor(private readonly reason: string) {}

  async createSession(): Promise<CodeSparkRuntimeSession> {
    return {
      provider: this.provider,
      providerSessionId: "unavailable",
      status: "unavailable",
      reason: this.reason,
    };
  }

  async hydrateSession(
    input: CreateCodeSparkSessionInput,
  ): Promise<CodeSparkRuntimeSession> {
    return {
      provider: this.provider,
      providerSessionId: input.providerSessionId ?? "unavailable",
      status: "unavailable",
      reason: this.reason,
    };
  }

  async listFiles(): Promise<CodeSparkRuntimeFile[]> {
    return [];
  }

  async readFile(): Promise<CodeSparkRuntimeFile> {
    throw new Error(this.reason);
  }

  async writeFile(): Promise<CodeSparkRuntimeFile> {
    throw new Error(this.reason);
  }

  async runCommand(
    _sessionId: string,
    command: CodeSparkRuntimeCommand,
  ): Promise<CodeSparkRuntimeRunResult> {
    return {
      provider: this.provider,
      status: "unavailable",
      stdout: "",
      stderr: this.reason,
      durationMs: 0,
      command: command.command,
      timedOut: false,
      reason: this.reason,
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

function commandForLanguage(
  language: CodeSparkLanguage,
  command: string,
): { cmd: string; args: string[] } {
  const trimmed = command.trim();
  const allowed =
    language === "python"
      ? ["python3", "python", "pytest"]
      : ["bun", "node", "npm"];
  const [cmd = "", ...args] = trimmed.split(/\s+/);
  if (!allowed.includes(cmd)) {
    throw new Error(`Command is not allowed for ${language}: ${cmd}`);
  }
  return { cmd, args };
}

function vercelCredentialsFromEnv() {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && teamId && projectId) {
    return { token, teamId, projectId };
  }

  if (requiresExplicitVercelSandboxAuth()) {
    throw new Error(
      "Vercel Sandbox production outside Vercel requires VERCEL_TOKEN with VERCEL_TEAM_ID and VERCEL_PROJECT_ID.",
    );
  }

  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (!oidcToken) {
    return {};
  }

  const [, encodedPayload] = oidcToken.split(".");
  if (!encodedPayload) {
    throw new Error("Invalid VERCEL_OIDC_TOKEN: missing payload.");
  }

  const payload = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  ) as { owner_id?: unknown; project_id?: unknown };
  if (
    typeof payload.owner_id !== "string" ||
    typeof payload.project_id !== "string"
  ) {
    throw new Error("Invalid VERCEL_OIDC_TOKEN: missing owner or project.");
  }

  return {
    token: oidcToken,
    teamId: payload.owner_id,
    projectId: payload.project_id,
  };
}

class VercelSandboxCodeSparkRuntimeProvider implements CodeSparkRuntimeProvider {
  readonly provider = "vercel_sandbox" as const;
  private readonly ownedSandboxes = new Map<string, VercelSandboxHandle>();

  private async getSandbox(sessionKey: string, language: CodeSparkLanguage) {
    const { Sandbox } = await import("@vercel/sandbox");
    const requestedName = nextSandboxName(sessionKey);
    let sandbox: VercelSandboxHandle;
    try {
      sandbox = await Sandbox.create({
        ...vercelCredentialsFromEnv(),
        name: requestedName,
        runtime: language === "python" ? "python3.13" : "node24",
        timeout: sandboxTimeoutMs,
        persistent: false,
        networkPolicy: "deny-all",
        tags: {
          surface: "code_spark",
          language,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const recoveryError = await this.deleteSandbox(requestedName);
      if (recoveryError) {
        throw new Error(
          `${message}\nSandbox creation may have succeeded, but recovery lookup/delete failed: ${recoveryError}. persistent: false and the provider timeout remain the final safety net.`,
        );
      }
      throw new Error(
        `${message}\nSandbox creation response failed; recovery lookup and delete completed.`,
      );
    }
    this.ownedSandboxes.set(sandbox.name, sandbox);
    return sandbox;
  }

  private async findSandbox(sessionId: string) {
    const owned = this.ownedSandboxes.get(sessionId);
    if (owned) return owned;
    const { Sandbox } = await import("@vercel/sandbox");
    return await Sandbox.get({
      ...vercelCredentialsFromEnv(),
      name: sessionId,
    });
  }

  private async deleteSandbox(
    sessionId: string,
    knownSandbox?: VercelSandboxHandle,
  ): Promise<string | undefined> {
    try {
      let sandbox = knownSandbox ?? this.ownedSandboxes.get(sessionId);
      if (sandbox === undefined) {
        const { Sandbox } = await import("@vercel/sandbox");
        sandbox = await Sandbox.get({
          ...vercelCredentialsFromEnv(),
          name: sessionId,
        });
      }
      await sandbox.delete();
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    } finally {
      this.ownedSandboxes.delete(sessionId);
    }
  }

  async createSession(
    input: CreateCodeSparkSessionInput,
  ): Promise<CodeSparkRuntimeSession> {
    const sandbox = await this.getSandbox(input.sessionKey, input.language);
    try {
      await sandbox.writeFiles(
        input.files.map((file) => ({
          path: file.path,
          content: Buffer.from(file.contents),
        })),
      );
    } catch (error) {
      const cleanupError = await this.deleteSandbox(sandbox.name, sandbox);
      if (cleanupError) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${message}\nSandbox cleanup warning: ${cleanupError}`,
        );
      }
      throw error;
    }
    return {
      provider: this.provider,
      providerSessionId: sandbox.name,
      status: "ready",
    };
  }

  async hydrateSession(
    input: CreateCodeSparkSessionInput,
  ): Promise<CodeSparkRuntimeSession> {
    return this.createSession(input);
  }

  async listFiles(): Promise<CodeSparkRuntimeFile[]> {
    throw new Error("Vercel file listing is persisted through Convex state.");
  }

  async readFile(): Promise<CodeSparkRuntimeFile> {
    throw new Error("Read files from persisted Convex state.");
  }

  async writeFile(
    sessionId: string,
    file: CodeSparkRuntimeFilePatch,
  ): Promise<CodeSparkRuntimeFile> {
    let sandbox: VercelSandboxHandle | undefined;
    try {
      sandbox = await this.findSandbox(sessionId);
      await sandbox.writeFiles([
        { path: file.path, content: Buffer.from(file.contents) },
      ]);
    } catch (error) {
      const cleanupError = await this.deleteSandbox(sessionId, sandbox);
      if (cleanupError) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${message}\nSandbox cleanup warning: ${cleanupError}`,
        );
      }
      throw error;
    }
    return cloneFile(file);
  }

  async runCommand(
    sessionId: string,
    command: CodeSparkRuntimeCommand & { language?: CodeSparkLanguage },
  ): Promise<CodeSparkRuntimeRunResult> {
    const startedAt = now();
    const language = command.language ?? "typescript";
    let sandbox: VercelSandboxHandle | undefined;
    let resultRecord: CodeSparkRuntimeRunResult = {
      provider: this.provider,
      status: "failed",
      stdout: "",
      stderr: "Code Spark execution did not start.",
      durationMs: 0,
      command: command.command,
      timedOut: false,
    };

    try {
      const { cmd, args } = commandForLanguage(language, command.command);
      sandbox = await this.findSandbox(sessionId);
      const result = await sandbox.runCommand(cmd, args, {
        timeoutMs: clampTimeout(command.timeoutMs),
      });
      const stdout = capOutput(await result.stdout());
      const stderr = capOutput(await result.stderr());
      const exitCode = result.exitCode;
      resultRecord = {
        provider: this.provider,
        status: exitCode === 0 ? "passed" : "failed",
        stdout,
        stderr,
        exitCode,
        durationMs: Math.max(1, now() - startedAt),
        command: command.command,
        timedOut: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const timedOut = /timeout|timed out/i.test(message);
      const learnerMessage = timedOut
        ? providerTimeoutMessage
        : providerUnavailableMessage;
      resultRecord = {
        provider: this.provider,
        status: timedOut ? "timed_out" : "unavailable",
        stdout: "",
        stderr: learnerMessage,
        durationMs: Math.max(1, now() - startedAt),
        command: command.command,
        timedOut,
        reason: learnerMessage,
      };
    } finally {
      const cleanupError = await this.deleteSandbox(sessionId, sandbox);
      if (cleanupError) {
        // Provider diagnostics stay server-side. Learners should not see SDK
        // paths, identifiers, or cleanup internals in persisted run output.
        void cleanupError;
      }
    }

    return resultRecord;
  }

  async runTests(
    sessionId: string,
    command: CodeSparkRuntimeCommand & { language?: CodeSparkLanguage },
  ): Promise<CodeSparkRuntimeRunResult> {
    return this.runCommand(sessionId, { ...command, kind: "test" });
  }

  async snapshot(sessionId: string): Promise<{ providerSnapshotId?: string }> {
    const { Sandbox } = await import("@vercel/sandbox");
    const sandbox = await Sandbox.get({
      ...vercelCredentialsFromEnv(),
      name: sessionId,
    });
    const snapshot = await sandbox.snapshot({ expiration: 24 * 60 * 60 * 1000 });
    return { providerSnapshotId: snapshot.snapshotId };
  }

  async stop(sessionId: string): Promise<void> {
    const cleanupError = await this.deleteSandbox(sessionId);
    if (cleanupError) {
      throw new Error(cleanupError);
    }
  }
}

export function createCodeSparkRuntimeProvider(): CodeSparkRuntimeProvider {
  const config = getCodeSparkProviderConfig();
  if (config.provider === "vercel_sandbox") {
    return new VercelSandboxCodeSparkRuntimeProvider();
  }
  if (config.provider === "local_fake") {
    return new FakeCodeSparkRuntimeProvider();
  }
  return new UnavailableCodeSparkRuntimeProvider(
    config.reason ?? "Code Spark runtime provider is unavailable.",
  );
}
