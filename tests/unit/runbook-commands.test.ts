import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runbook = readFileSync(
  join(process.cwd(), "docs/agent-browser-testing.md"),
  "utf8",
);

describe("Convex worktree isolation runbook", () => {
  it("uses commands supported by the installed Convex CLI", () => {
    expect(runbook).not.toContain("convex deployment create");
    expect(runbook).not.toContain("convex deployment token create");
    expect(runbook).not.toContain("convex env set --from-file");

    expect(runbook).not.toContain("convex dev --once --configure existing");
    expect(runbook).toContain("convex dev --configure existing");
    expect(runbook).toContain("--dev-deployment local");
    expect(runbook).toContain(".convex/local/default");
  });

  it("keeps the local backend alive while deployment commands run", () => {
    expect(runbook).toContain("Keep this terminal running");
    expect(runbook).toContain("In a second terminal");
    expect(runbook).toContain("convex env set CLERK_JWT_ISSUER_DOMAIN");
  });

  it("keeps signed-out, Clerk testing, and Agent Task evidence distinct", () => {
    expect(runbook).toContain("infinite redirect loop");
    expect(runbook).toContain("@clerk/testing");
    expect(runbook).toContain("Agent Task");
    expect(runbook).toContain("does not prove an authenticated Studi session");
  });
});
