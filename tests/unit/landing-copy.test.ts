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

  it("routes the universal Open chat action through the protected chat page", () => {
    const source = readLandingSource();

    expect(source).toMatch(/<a\s+href="\/chat"[\s\S]*?>\s*Open chat\s*<\/a>/);
    expect(source).not.toContain("SignInButton");
    expect(source).not.toContain('mode="modal"');
  });

  it("keeps the universal Open chat control visible on mobile", () => {
    const source = readLandingSource();
    const openChatAnchor = source.match(
      /<a\s+href="\/chat"[\s\S]*?>\s*Open chat\s*<\/a>/,
    )?.[0];

    expect(openChatAnchor).toBeTruthy();
    expect(openChatAnchor).not.toMatch(/\bhidden\b/);
  });

  it("gives FAQ buttons an identified controlled panel", () => {
    const source = readLandingSource();

    expect(source).toContain("aria-expanded={open}");
    expect(source).toContain("aria-controls={panelId}");
    expect(source).toContain("id={panelId}");
    expect(source).toContain('role="region"');
  });

  it("uses current Free, Starter, and Pro plan language", () => {
    const landingSource = readLandingSource();
    const catalogSource = readFileSync(
      join(rootDir, "lib/billing/plan-catalog.ts"),
      "utf8",
    );

    expect(landingSource).not.toMatch(/introduce a paid plan later/i);
    expect(landingSource).not.toMatch(/free for students/i);
    expect(landingSource).toContain("PRICING_FAQ_ANSWER");
    expect(catalogSource).toMatch(/free guided preview/i);
    expect(catalogSource).toMatch(/Starter/);
    expect(catalogSource).toMatch(/Pro/);
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
