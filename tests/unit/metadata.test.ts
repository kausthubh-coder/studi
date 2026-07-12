import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("site metadata", () => {
  it("uses the Studi mark instead of the Convex logo", () => {
    const source = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

    expect(source).not.toContain("/convex.svg");
    expect(source).toContain("/studi-paper-airplane-logo-rounded.png");
  });
});
