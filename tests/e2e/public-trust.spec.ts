import { expect, test } from "@playwright/test";
import axe from "axe-core";

test.describe("public trust surfaces", () => {
  test("public responses include the security policy", async ({ request }) => {
    const response = await request.get("/");

    expect(response.ok()).toBe(true);
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(response.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
  });

  test("metadata routes and branded 404 are reachable", async ({ page }) => {
    test.slow();

    for (const path of [
      "/favicon.ico",
      "/apple-icon.png",
      "/opengraph-image.png",
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
    ]) {
      const response = await page.request.get(path);
      expect(response.ok(), `${path} should be reachable`).toBe(true);
    }

    const response = await page.goto("/definitely-not-a-studi-page", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("heading", { name: /page wandered off/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /back to home/i })).toBeVisible();
  });

  test("indexed routes publish distinct titles and canonicals", async ({ page }) => {
    test.slow();

    for (const expected of [
      {
        path: "/",
        title: /learn by figuring it out/i,
        canonical: "https://www.getstudi.com",
      },
      {
        path: "/pricing",
        title: /pricing.*studi/i,
        canonical: "https://www.getstudi.com/pricing",
      },
      {
        path: "/waitlist",
        title: /join the waitlist.*studi/i,
        canonical: "https://www.getstudi.com/waitlist",
      },
    ]) {
      const response = await page.goto(expected.path, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.ok(), `${expected.path} should render`).toBe(true);
      await expect(page).toHaveTitle(expected.title);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        expected.canonical,
      );
    }
  });

  test("branded 404 meets WCAG A and AA", async ({ page }) => {
    await page.goto("/definitely-missing");
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const axeApi = Reflect.get(window, "axe") as {
        run: (
          context: Document,
          options: { runOnly: { type: "tag"; values: string[] } },
        ) => Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }>;
      };
      const results = await axeApi.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
      });
      return results.violations.map((violation) => ({
        id: violation.id,
        nodeCount: violation.nodes.length,
      }));
    });

    expect(violations).toEqual([]);
  });
});
