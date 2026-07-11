import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("mobile chat overlay safety", () => {
  it("keeps a closed off-canvas sidebar from intercepting the workspace", () => {
    const styles = read("app/globals.css");

    expect(styles).toMatch(
      /\.studi-thread-sidebar\s*\{[^}]*pointer-events:\s*none/,
    );
    expect(styles).toMatch(
      /\.studi-thread-sidebar\[data-mobile-open="true"\]\s*\{[^}]*pointer-events:\s*auto/,
    );
  });

  it("places runtime banners below mobile workspace controls", () => {
    const chat = read("components/StudiChat.tsx");

    expect(chat).toContain('isMobile ? "top-14" : "top-3"');
    expect(chat).not.toContain(
      'expandedSpark && isMobile ? "top-14" : "top-3"',
    );
  });
});
