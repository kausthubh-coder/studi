import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  FakeCodeSparkRuntimeProvider,
  getCodeSparkProviderConfig,
} from "@/lib/code-sparks/runtime";
import type { CodeSparkRuntimeFile } from "@/lib/code-sparks/types";

const files: CodeSparkRuntimeFile[] = [
  {
    path: "src/add.ts",
    language: "typescript",
    contents: "export function add(a: number, b: number) { return a + b; }",
    editable: true,
    role: "starter",
  },
  {
    path: "main.py",
    language: "python",
    contents: "print('hello from python')",
    editable: true,
    role: "starter",
  },
];

describe("Code Spark runtime provider boundary", () => {
  it("keeps local_fake available for deterministic non-production tests", async () => {
    const provider = new FakeCodeSparkRuntimeProvider();
    const session = await provider.createSession({
      sessionKey: "thread-message-spark",
      language: "typescript",
      files,
    });

    const result = await provider.runCommand(session.providerSessionId, {
      command: "bun test",
      kind: "test",
      timeoutMs: 10_000,
    });

    expect(result.provider).toBe("local_fake");
    expect(result.status).toBe("passed");
    expect(result.stdout).toContain("visible checks passed");
  });

  it("preserves file edits in the fake runtime", async () => {
    const provider = new FakeCodeSparkRuntimeProvider();
    const session = await provider.createSession({
      sessionKey: "edit-session",
      language: "python",
      files,
    });

    await provider.writeFile(session.providerSessionId, {
      path: "main.py",
      contents: "print('updated')",
      language: "python",
      editable: true,
      role: "starter",
    });

    await expect(provider.readFile(session.providerSessionId, "main.py")).resolves
      .toMatchObject({
        contents: "print('updated')",
      });
  });

  it("fails closed in production instead of silently selecting local_fake", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("CODE_SPARK_PROVIDER", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    vi.stubEnv("VERCEL_TOKEN", "");
    vi.stubEnv("VERCEL_TEAM_ID", "");
    vi.stubEnv("VERCEL_PROJECT_ID", "");

    const config = getCodeSparkProviderConfig();

    expect(config.provider).toBe("unavailable");
    expect(config.reason).toMatch(/CODE_SPARK_PROVIDER/);
  });

  it("prefers Vercel Sandbox when auth env names are present", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("CODE_SPARK_PROVIDER", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "test-token");

    const config = getCodeSparkProviderConfig();

    expect(config.provider).toBe("vercel_sandbox");
  });

  it("keeps Daytona honest as a future adapter", () => {
    vi.stubEnv("CODE_SPARK_PROVIDER", "daytona");
    vi.stubEnv("DAYTONA_API_KEY", "test-key");

    const config = getCodeSparkProviderConfig();

    expect(config.provider).toBe("unavailable");
    expect(config.reason).toMatch(/daytona adapter is not implemented/);
  });

  it("keeps production Vercel lifecycle only in the Convex node runtime", () => {
    const sharedRuntime = readFileSync("lib/code-sparks/runtime.ts", "utf8");
    const convexRuntime = readFileSync("convex/codeSparkRuntime.ts", "utf8");

    expect(sharedRuntime).toContain("deterministic fake/test support");
    expect(sharedRuntime).not.toContain("@vercel/sandbox");
    expect(sharedRuntime).not.toContain("createCodeSparkRuntimeProvider");
    expect(convexRuntime).toContain('"use node"');
    expect(convexRuntime).toContain("createCodeSparkRuntimeProvider");
    expect(convexRuntime).toContain('config.provider === "vercel_sandbox"');
    expect(convexRuntime).toContain("Sandbox.create");
    expect(convexRuntime).toContain("persistent: false");
    expect(convexRuntime).toContain("sandbox.delete");
  });
});
