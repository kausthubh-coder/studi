import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

function readSource(relativePath: string) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

describe("landing copy", () => {
  it("does not advertise removed playground Spark surfaces", () => {
    const source = readSource("components/landing/LandingPage.tsx");

    expect(source).not.toMatch(/Python playground/i);
    expect(source).not.toMatch(/web preview/i);
    expect(source).not.toMatch(/web playground/i);
    expect(source).not.toMatch(/code playground/i);
    expect(source).not.toMatch(/Code Spark/i);
  });

  it("routes the universal Open chat action through the protected chat page", () => {
    const source = readSource("components/landing/LandingPage.tsx");

    expect(source).toMatch(/<a\s+href="\/chat"[\s\S]*?>\s*Open chat\s*<\/a>/);
    expect(source).not.toContain("SignInButton");
    expect(source).not.toContain('mode="modal"');
  });

  it("keeps the universal Open chat control visible on mobile", () => {
    const source = readSource("components/landing/LandingPage.tsx");
    const openChatAnchor = source.match(
      /<a\s+href="\/chat"[\s\S]*?>\s*Open chat\s*<\/a>/,
    )?.[0];

    expect(openChatAnchor).toBeTruthy();
    expect(openChatAnchor).not.toMatch(/hidden\s+sm:/);
    expect(openChatAnchor).not.toMatch(/\bhidden\b/);
  });

  it("uses a transparent vector paper-airplane mark", () => {
    const source = readSource("components/landing/LandingPage.tsx");

    expect(source).toContain("<Send");
    expect(source).not.toContain("studi-paper-airplane-logo-rounded.png");
    expect(source).not.toContain('from "next/image"');
  });

  it("keeps the mobile drop-test footer in its own responsive row", () => {
    const source = readSource("components/landing/LandingPage.tsx");

    expect(source).toContain('data-testid="drop-test-footer"');
    expect(source).toMatch(/drop-test-footer[\s\S]*flex-col[\s\S]*sm:flex-row/);
  });

  it("supports reduced motion for landing and Spark animations", () => {
    const landingSource = readSource("components/landing/LandingPage.tsx");
    const sparksSource = readSource("components/landing/SparksShowcase.tsx");

    expect(landingSource).toContain('reducedMotion="user"');
    expect(landingSource).toContain("useReducedMotion");
    expect(landingSource).toContain("prefers-reduced-motion: reduce");
    expect(sparksSource).toContain("useReducedMotion");
    expect(sparksSource).toContain("motion-reduce:animate-none");
  });

  it("keeps server-rendered landing content visible before motion hydrates", () => {
    const source = readSource("components/landing/LandingPage.tsx");

    expect(source).toContain("hidden: { opacity: 1, y: 24 }");
  });

  it("wires uniquely identified Spark tabs to their tabpanel", () => {
    const source = readSource("components/landing/SparksShowcase.tsx");

    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("aria-controls={panelId}");
    expect(source).toContain("aria-labelledby={tabId(activeSpark.id)}");
    expect(source).toContain("id={tabId(spark.id)}");
    expect(source).toContain("onKeyDown");
    expect(source).toContain("onFocusCapture");
    expect(source).toContain("onPointerEnter");
  });

  it("gives FAQ buttons an identified controlled panel", () => {
    const source = readSource("components/landing/LandingPage.tsx");

    expect(source).toContain("aria-expanded={open}");
    expect(source).toContain("aria-controls={panelId}");
    expect(source).toContain("id={panelId}");
    expect(source).toContain('role="region"');
  });

  it("uses current Free, Starter, and Pro plan language", () => {
    const landingSource = readSource("components/landing/LandingPage.tsx");
    const catalogSource = readSource("lib/billing/plan-catalog.ts");

    expect(landingSource).not.toMatch(/introduce a paid plan later/i);
    expect(landingSource).not.toMatch(/free for students/i);
    expect(landingSource).toContain("PRICING_FAQ_ANSWER");
    expect(catalogSource).toMatch(/free guided preview/i);
    expect(catalogSource).toMatch(/Starter/);
    expect(catalogSource).toMatch(/Pro/);
  });

  it("makes the long questionnaire optional after one-step signup", () => {
    const source = readSource("components/landing/WaitlistForm.tsx");

    expect(source).toMatch(/one email/i);
    expect(source).toMatch(/optional/i);
    expect(source).toMatch(/8 short steps/i);
    expect(source).toContain('href="/waitlist?source=landing"');
    expect(source).not.toContain("setShowModal");
    expect(source).not.toContain("TALLY_FORM_URL");
  });

  it("gives the waitlist route a branded return path and defers Tally", () => {
    const source = readSource("app/waitlist/page.tsx");

    expect(source).toContain('aria-label="Studi home"');
    expect(source).toContain('href="/"');
    expect(source).toMatch(/optional questionnaire/i);
    expect(source).toMatch(/8 short steps/i);
    expect(source).toContain('loading="lazy"');
    expect(source).not.toContain('from "next/script"');
  });

  it("keeps primary mobile actions at least 44px tall", () => {
    const landingSource = readSource("components/landing/LandingPage.tsx");
    const waitlistSource = readSource("components/landing/WaitlistForm.tsx");

    expect(landingSource).toMatch(
      /<Link\s+href="\/"\s+aria-label="Studi home"\s+className="[^"]*min-h-11[^"]*"/,
    );
    expect(landingSource).toMatch(
      /href="\/chat"[\s\S]*?inline-flex[\s\S]*?min-h-11[\s\S]*?>\s*Open chat/,
    );
    expect(landingSource).toMatch(
      /onClick=\{scrollToWaitlist\}[\s\S]*?min-h-11/,
    );
    expect(waitlistSource).toMatch(/<input[\s\S]*?min-h-11/);
    expect(waitlistSource).toMatch(
      /href="\/waitlist\?source=landing"[\s\S]*?min-h-11/,
    );
    expect(waitlistSource).toMatch(/type="submit"[\s\S]*?min-h-11/);
  });
});
