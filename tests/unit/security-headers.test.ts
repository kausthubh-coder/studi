import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

async function getGlobalHeaders() {
  if (!nextConfig.headers) {
    throw new Error("next.config.ts must define security headers.");
  }

  const rules = await nextConfig.headers();
  const globalRule = rules.find((rule) => rule.source === "/(.*)");
  if (!globalRule) {
    throw new Error("Missing global /(.*) security header rule.");
  }

  return new Map(globalRule.headers.map(({ key, value }) => [key, value]));
}

describe("public response security headers", () => {
  it("allows only the loopback hostname used by local browser tests in non-production", () => {
    expect(nextConfig.allowedDevOrigins).toEqual(["127.0.0.1"]);
  });

  it("denies framing and common content-sniffing/browser-policy risks", async () => {
    const headers = await getGlobalHeaders();

    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe(
      "same-origin-allow-popups",
    );
    expect(headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });

  it("ships a CSP that preserves known Studi integrations without allowing framing", async () => {
    const headers = await getGlobalHeaders();
    const policy = headers.get("Content-Security-Policy") ?? "";

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toMatch(/connect-src[^;]*https:\/\/\*\.convex\.cloud/);
    expect(policy).toMatch(/frame-src[^;]*https:\/\/tally\.so/);
    expect(policy).toMatch(/script-src[^;]*https:\/\/www\.desmos\.com/);
    expect(policy).toMatch(/script-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
    expect(policy).toMatch(/connect-src[^;]*https:\/\/api\.stripe\.com/);
    expect(policy).toMatch(/connect-src[^;]*https:\/\/img\.clerk\.com/);
    expect(policy).toMatch(/connect-src[^;]*https:\/\/\*\.accounts\.dev/);
    expect(policy).toMatch(
      /connect-src[^;]*https:\/\/images\.clerkstage\.dev/,
    );
    expect(policy).toMatch(/script-src[^;]*https:\/\/\*\.js\.stripe\.com/);
    expect(policy).toMatch(/frame-src[^;]*https:\/\/hooks\.stripe\.com/);

    expect(headers.get("Permissions-Policy")).toContain(
      'payment=(self "https://*.js.stripe.com" "https://js.stripe.com" "https://hooks.stripe.com")',
    );
  });
});
