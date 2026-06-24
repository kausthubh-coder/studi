import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const scriptPath = path.join(process.cwd(), "scripts/secrets-check.ts");
const bunExecutable = process.execPath.includes("bun") ? process.execPath : "bun";

function runInTempRepo(files: Record<string, string>) {
  const repoDir = mkdtempSync(path.join(tmpdir(), "studi-secrets-check-"));

  try {
    spawnSync("git", ["init"], { cwd: repoDir, encoding: "utf8" });

    for (const [filePath, contents] of Object.entries(files)) {
      writeFileSync(path.join(repoDir, filePath), contents);
    }

    return spawnSync(bunExecutable, [scriptPath], {
      cwd: repoDir,
      encoding: "utf8",
    });
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
}

describe("secrets-check", () => {
  it("ignores local env files excluded by gitignore", () => {
    const secret = "sk-" + "a".repeat(24);
    const result = runInTempRepo({
      ".gitignore": ".env*\n!.env.example\n",
      ".env.local": `OPENAI_API_KEY=${secret}\n`,
      ".env.example": "OPENAI_API_KEY=sk-placeholder\n",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Secret hygiene check passed.");
  });

  it("fails when a non-ignored file contains a secret-looking value", () => {
    const secret = "sk-or-v1-" + "b".repeat(24);
    const result = runInTempRepo({
      ".gitignore": ".env*\n!.env.example\n",
      "notes.md": `temporary key: ${secret}\n`,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("notes.md:1 OpenAI/OpenRouter-style secret key");
  });
});
