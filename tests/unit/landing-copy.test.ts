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

  it("keeps the signed-out sign in control visible on mobile", () => {
    const source = readLandingSource();
    const signInAnchor = source.match(
      /<a\s+href="\/chat"[\s\S]*?>\s*Sign in\s*<\/a>/,
    )?.[0];

    expect(signInAnchor).toBeTruthy();
    expect(signInAnchor).not.toMatch(/\bhidden\b/);
  });

  it("gives FAQ buttons an identified controlled panel", () => {
    const source = readLandingSource();

    expect(source).toContain("aria-expanded={open}");
    expect(source).toContain("aria-controls={panelId}");
    expect(source).toContain("id={panelId}");
    expect(source).toContain('role="region"');
  });

  it("uses current Free, Starter, and Pro plan language", () => {
    const source = readLandingSource();

    expect(source).not.toMatch(/introduce a paid plan later/i);
    expect(source).not.toMatch(/free for students/i);
    expect(source).toMatch(/free preview/i);
    expect(source).toMatch(/Starter/);
    expect(source).toMatch(/Pro/);
  });

  it("makes the long questionnaire optional after one-step signup", () => {
    const source = readFileSync(
      join(rootDir, "components/landing/WaitlistForm.tsx"),
      "utf8",
    );

    expect(source).toMatch(/one email/i);
    expect(source).toMatch(/optional/i);
    expect(source).toMatch(/8 short steps/i);
    expect(source).not.toContain("setShowModal(true)");
  });

  it("gives the waitlist route a branded return path and defers Tally", () => {
    const source = readFileSync(join(rootDir, "app/waitlist/page.tsx"), "utf8");

    expect(source).toContain('aria-label="Studi home"');
    expect(source).toContain('href="/"');
    expect(source).toMatch(/optional questionnaire/i);
    expect(source).toMatch(/8 short steps/i);
    expect(source).toContain('loading="lazy"');
    expect(source).not.toContain('from "next/script"');
  });
});
