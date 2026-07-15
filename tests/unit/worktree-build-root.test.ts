import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Next workspace root", () => {
  it("keeps Turbopack inside the active checkout or worktree", () => {
    const source = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");

    expect(source).toContain("turbopack:");
    expect(source).toContain("root: process.cwd()");
  });
});
