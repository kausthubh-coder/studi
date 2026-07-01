import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

describe("landing copy", () => {
  it("does not advertise removed playground Spark surfaces", () => {
    const source = readFileSync(
      join(rootDir, "components/landing/LandingPage.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/Python playground/i);
    expect(source).not.toMatch(/web preview/i);
    expect(source).not.toMatch(/web playground/i);
    expect(source).not.toMatch(/code playground/i);
    expect(source).not.toMatch(/Code Spark/i);
  });
});
