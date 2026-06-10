import { expect, test } from "@playwright/test";

test.describe("public routes", () => {
  test("landing, pricing, and waitlist return page responses", async ({
    page,
  }) => {
    for (const path of ["/", "/pricing", "/waitlist"]) {
      const response = await page.goto(path);

      expect(response?.ok(), `${path} should return a successful page`).toBe(
        true,
      );
    }
  });

  test("waitlist forwards query params to Tally", async ({ page }) => {
    const response = await page.goto(
      "/waitlist?email=student%40example.com&source=studi",
    );

    expect(response?.ok()).toBe(true);

    const iframe = page.locator("iframe[title='Join the waitlist']");
    await expect(iframe).toHaveAttribute(
      "src",
      /email=student%40example\.com/,
    );
    await expect(iframe).toHaveAttribute("src", /source=studi/);
    await expect(iframe).toHaveAttribute(
      "src",
      /formEventsForwarding=1/,
    );
  });
});
