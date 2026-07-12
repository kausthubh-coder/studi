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

  function readSparksSource() {
    return readFileSync(
      join(rootDir, "components/landing/SparksShowcase.tsx"),
      "utf8",
    );
  }

  function readWaitlistSource() {
    return readFileSync(
      join(rootDir, "components/landing/WaitlistForm.tsx"),
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

  it("keeps the sign in link visible on mobile viewports", () => {
    const source = readLandingSource();

    const signInAnchor = source.match(
      /<a\s+href="\/chat"[\s\S]*?>\s*Sign in\s*<\/a>/,
    )?.[0];
    expect(signInAnchor).toBeTruthy();
    // UX-04: the anchor must not be display:none below the sm breakpoint.
    expect(signInAnchor).not.toMatch(/hidden\s+sm:/);
    expect(signInAnchor).not.toMatch(/\bhidden\b/);
  });

  it("uses a transparent vector paper-airplane mark", () => {
    const source = readLandingSource();

    expect(source).toContain("<Send");
    expect(source).not.toContain("studi-paper-airplane-logo-rounded.png");
    expect(source).not.toContain('from "next/image"');
  });

  it("gives signed-in learners continuation copy instead of waitlist copy", () => {
    const source = readLandingSource();

    expect(source).toContain("Pick up where you left off.");
    expect(source).toContain("Your next aha is waiting.");
    expect(source).not.toContain("You're already in!");
    expect(source).not.toContain("Every study on learning agrees");
  });

  it("keeps the mobile drop-test footer in its own responsive row", () => {
    const source = readLandingSource();

    expect(source).toContain('data-testid="drop-test-footer"');
    expect(source).toMatch(/drop-test-footer[\s\S]*flex-col[\s\S]*sm:flex-row/);
  });

  it("supports reduced motion for landing animations and Spark rotation", () => {
    const landingSource = readLandingSource();
    const sparksSource = readSparksSource();

    expect(landingSource).toContain('reducedMotion="user"');
    expect(landingSource).toContain("useReducedMotion");
    expect(landingSource).toContain("prefers-reduced-motion: reduce");
    expect(sparksSource).toContain("useReducedMotion");
  });

  it("keeps server-rendered landing content visible before motion hydrates", () => {
    const source = readLandingSource();

    expect(source).toContain("hidden: { opacity: 1, y: 24 }");
  });

  it("wires the Spark tabs to an accessible tabpanel", () => {
    const source = readSparksSource();

    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("aria-controls");
    expect(source).toContain("aria-labelledby");
    expect(source).toContain("onKeyDown");
    expect(source).toContain('aria-controls="spark-showcase-panel"');
    expect(source).toContain('id="spark-showcase-panel"');
    expect(source).toContain("onFocusCapture");
  });

  it("keeps primary mobile actions at least 44px tall", () => {
    const landingSource = readLandingSource();
    const waitlistSource = readWaitlistSource();

    expect(landingSource).toMatch(
      /<Link\s+href="\/"\s+aria-label="Studi home"\s+className="[^"]*min-h-11[^"]*"/,
    );
    expect(landingSource).toMatch(
      /href="\/chat"[\s\S]*?inline-flex[\s\S]*?min-h-11[\s\S]*?>\s*Sign in/,
    );
    expect(landingSource).toMatch(
      /onClick=\{scrollToWaitlist\}[\s\S]*?min-h-11/,
    );
    expect(waitlistSource).toMatch(
      /aria-label="Close"[\s\S]*?w-11 h-11|w-11 h-11[\s\S]*?aria-label="Close"/,
    );
    expect(waitlistSource).toMatch(
      /onClick=\{\(\) => setShowModal\(false\)\}[\s\S]*?min-h-11/,
    );
  });
});
