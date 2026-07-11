import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("public provider boundaries", () => {
  it("keeps authenticated providers off the root and scopes them by route", () => {
    const root = read("app/layout.tsx");
    const chat = read("app/chat/layout.tsx");
    const settings = read("app/settings/layout.tsx");
    const pricing = read("app/pricing/layout.tsx");
    const home = read("app/page.tsx");

    expect(root).not.toContain("ClerkProvider");
    expect(root).not.toContain("ConvexClientProvider");
    expect(chat).toContain("<ClerkProvider>");
    expect(chat).toContain("<ConvexClientProvider>");
    expect(settings).toContain("<ClerkProvider>");
    expect(settings).toContain("<ConvexClientProvider>");
    expect(pricing).toContain("<ClerkProvider>");
    expect(pricing).not.toContain("ConvexClientProvider");
    expect(home).toContain("<PublicConvexClientProvider>");
  });

  it("renders primary landing actions without Clerk hydration", () => {
    const landing = read("components/landing/LandingPage.tsx");

    expect(landing).not.toContain("SignedIn");
    expect(landing).not.toContain("SignedOut");
    expect(landing).toContain('href="/chat"');
    expect(landing).toContain("Get Early Access");
    expect(landing).toContain("<WaitlistForm");
  });
});
