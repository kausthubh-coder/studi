import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCodeSparkRuntimeProvider } from "@/convex/codeSparkRuntime";

const sandboxSdk = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({
  Sandbox: sandboxSdk,
}));

function oidcToken() {
  const payload = Buffer.from(
    JSON.stringify({ owner_id: "team_test", project_id: "project_test" }),
  ).toString("base64url");
  return `header.${payload}.signature`;
}

function runtimeFile() {
  return {
    path: "main.py",
    language: "python" as const,
    contents: "def answer():\n    return None\n",
    editable: true,
    role: "starter" as const,
  };
}

function sandboxHandle(overrides: Record<string, unknown> = {}) {
  return {
    name: "sandbox-owned-by-action",
    writeFiles: vi.fn().mockResolvedValue(undefined),
    runCommand: vi.fn().mockResolvedValue({
      stdout: vi.fn().mockResolvedValue("ok\n"),
      stderr: vi.fn().mockResolvedValue(""),
      exitCode: 0,
    }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("CONVEX_DEPLOYMENT", "dev:test");
  vi.stubEnv("CODE_SPARK_PROVIDER", "vercel_sandbox");
  vi.stubEnv("VERCEL_OIDC_TOKEN", oidcToken());
  vi.stubEnv("VERCEL_TOKEN", "");
  vi.stubEnv("VERCEL_TEAM_ID", "");
  vi.stubEnv("VERCEL_PROJECT_ID", "");
});

afterEach(() => {
  sandboxSdk.create.mockReset();
  sandboxSdk.get.mockReset();
  vi.unstubAllEnvs();
});

describe("Vercel Code Spark ownership cleanup", () => {
  it("recovers and deletes a sandbox when create response delivery is lost", async () => {
    const recoveryHandle = sandboxHandle({ name: "recovered-after-create" });
    sandboxSdk.create.mockRejectedValueOnce(new Error("create response lost"));
    sandboxSdk.get.mockResolvedValueOnce(recoveryHandle);
    const provider = createCodeSparkRuntimeProvider();

    await expect(
      provider.hydrateSession({
        sessionKey: "setup-failure",
        language: "python",
        files: [runtimeFile()],
      }),
    ).rejects.toThrow("create response lost");
    const requestedName = sandboxSdk.create.mock.calls[0]?.[0]?.name;
    expect(requestedName).toEqual(expect.any(String));
    expect(sandboxSdk.get).toHaveBeenCalledWith(
      expect.objectContaining({ name: requestedName }),
    );
    expect(recoveryHandle.delete).toHaveBeenCalledOnce();
  });

  it("reports unavoidable create-response ambiguity when recovery lookup also fails", async () => {
    sandboxSdk.create.mockRejectedValueOnce(new Error("create response lost"));
    sandboxSdk.get.mockRejectedValueOnce(new Error("recovery lookup failed"));
    const provider = createCodeSparkRuntimeProvider();

    await expect(
      provider.hydrateSession({
        sessionKey: "setup-ambiguity",
        language: "python",
        files: [runtimeFile()],
      }),
    ).rejects.toThrow(/creation may have succeeded.*persistent: false/i);
  });

  it("deletes a created sandbox when file bootstrap fails", async () => {
    const handle = sandboxHandle({
      writeFiles: vi.fn().mockRejectedValue(new Error("write failed")),
    });
    sandboxSdk.create.mockResolvedValueOnce(handle);
    const provider = createCodeSparkRuntimeProvider();

    await expect(
      provider.hydrateSession({
        sessionKey: "write-failure",
        language: "python",
        files: [runtimeFile()],
      }),
    ).rejects.toThrow("write failed");
    expect(handle.delete).toHaveBeenCalledOnce();
  });

  it("retries lookup for owned cleanup when write-file lookup fails", async () => {
    const recoveryHandle = sandboxHandle({ name: "write-lookup-failure" });
    sandboxSdk.get
      .mockRejectedValueOnce(new Error("write lookup failed"))
      .mockResolvedValueOnce(recoveryHandle);
    const provider = createCodeSparkRuntimeProvider();

    await expect(
      provider.writeFile("write-lookup-failure", {
        ...runtimeFile(),
        contents: "def answer():\n    return 42\n",
      }),
    ).rejects.toThrow("write lookup failed");
    expect(sandboxSdk.get).toHaveBeenCalledTimes(2);
    expect(recoveryHandle.delete).toHaveBeenCalledOnce();
  });

  it("deletes the owned sandbox when command execution fails", async () => {
    const handle = sandboxHandle({
      runCommand: vi.fn().mockRejectedValue(new Error("execute failed")),
    });
    sandboxSdk.create.mockResolvedValueOnce(handle);
    const provider = createCodeSparkRuntimeProvider();
    const session = await provider.hydrateSession({
      sessionKey: "execute-failure",
      language: "python",
      files: [runtimeFile()],
    });

    const result = await provider.runTests(session.providerSessionId, {
      kind: "test",
      command: "python3 tests/answer.check.py",
      language: "python",
    });

    expect(result).toMatchObject({
      status: "unavailable",
      timedOut: false,
      stderr: "Code Spark runtime provider is unavailable. Try again in a moment.",
      reason: "Code Spark runtime provider is unavailable. Try again in a moment.",
    });
    expect(JSON.stringify(result)).not.toContain("execute failed");
    expect(handle.delete).toHaveBeenCalledOnce();
  });

  it("retries lookup solely for cleanup when the first get fails", async () => {
    const recoveryHandle = sandboxHandle({ name: "external-session" });
    sandboxSdk.get
      .mockRejectedValueOnce(new Error("get failed"))
      .mockResolvedValueOnce(recoveryHandle);
    const provider = createCodeSparkRuntimeProvider();

    const result = await provider.runCommand("external-session", {
      kind: "run",
      command: "python3 main.py",
      language: "python",
    });

    expect(result).toMatchObject({
      status: "unavailable",
      stderr: "Code Spark runtime provider is unavailable. Try again in a moment.",
    });
    expect(JSON.stringify(result)).not.toContain("get failed");
    expect(sandboxSdk.get).toHaveBeenCalledTimes(2);
    expect(recoveryHandle.delete).toHaveBeenCalledOnce();
  });

  it("keeps cleanup diagnostics private after a passing command", async () => {
    const handle = sandboxHandle({
      delete: vi.fn().mockRejectedValue(new Error("delete failed")),
    });
    sandboxSdk.create.mockResolvedValueOnce(handle);
    const provider = createCodeSparkRuntimeProvider();
    const session = await provider.hydrateSession({
      sessionKey: "delete-failure",
      language: "python",
      files: [runtimeFile()],
    });

    const result = await provider.runCommand(session.providerSessionId, {
      kind: "run",
      command: "python3 main.py",
      language: "python",
    });

    expect(result.status).toBe("passed");
    expect(result.stderr).toBe("");
    expect(result.reason).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("delete failed");
  });
});
