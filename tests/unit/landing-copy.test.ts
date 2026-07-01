import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

describe("landing copy", () => {
  function readLandingSource() {
    return readFileSync(
      join(rootDir, "components/landing/LandingPage.tsx"),
      "utf8",
    );
  }

  it("does not advertise removed playground Spark surfaces", () => {
    const source = readLandingSource();

    expect(source).not.toMatch(/Python playground/i);
    expect(source).not.toMatch(/web preview/i);
    expect(source).not.toMatch(/web playground/i);
    expect(source).not.toMatch(/code playground/i);
    expect(source).not.toMatch(/Code Spark/i);
  });

  it("routes signed-out sign in through the protected chat page", () => {
    const source = readLandingSource();

    expect(source).toMatch(/<a\s+href="\/chat"[\s\S]*?>\s*Sign in\s*<\/a>/);
    expect(source).not.toContain("SignInButton");
    expect(source).not.toContain('mode="modal"');
  });
});
