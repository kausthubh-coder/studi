import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("site metadata", () => {
  it("uses the centralized Studi mark instead of the Convex logo", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    const metadata = readFileSync(
      join(process.cwd(), "lib/site-metadata.ts"),
      "utf8",
    );

    expect(layout).toContain("siteMetadata");
    expect(`${layout}\n${metadata}`).not.toContain("/convex.svg");
    expect(metadata).toContain('url: "/icon.svg"');
  });
});
