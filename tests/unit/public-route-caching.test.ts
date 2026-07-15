import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public route rendering", () => {
  it("does not force every route to read request-time Clerk state", () => {
    const rootLayout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");

    expect(rootLayout).not.toContain("<ClerkProvider dynamic>");
  });
});
