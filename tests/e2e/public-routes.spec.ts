import { expect, test } from "@playwright/test";

test.describe("public routes", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  async function waitForLandingHydration(page: import("@playwright/test").Page) {
    await expect(
      page.locator('[data-studi-landing-hydrated="true"]'),
    ).toBeVisible({ timeout: 30_000 });
  }

  test("landing, pricing, and waitlist return page responses", async ({
    page,
  }) => {
    for (const path of ["/", "/pricing", "/waitlist"]) {
      const response = await page.goto(path, {
        waitUntil: "domcontentloaded",
      });

      expect(response?.ok(), `${path} should return a successful page`).toBe(
        true,
      );
    }
  });

  test("waitlist forwards query params to Tally", async ({ page }) => {
    const response = await page.goto(
      "/waitlist?email=student%40example.com&source=studi",
      { waitUntil: "domcontentloaded" },
    );

    expect(response?.ok()).toBe(true);

    await expect(page.getByRole("link", { name: "Studi home" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Optional questionnaire" }),
    ).toBeVisible();

    const iframe = page.locator(
      "iframe[title='Optional Studi learner questionnaire']",
    );
    await expect(iframe).toHaveAttribute("loading", "lazy");
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

  test("mobile landing keeps sign in visible and exposes FAQ state", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForLandingHydration(page);

    const signIn = page.getByRole("link", { name: "Sign in" }).first();
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute("href", "/chat");

    const faq = page.getByRole("button", { name: "Is it free?" });
    await expect(faq).toHaveAttribute("aria-expanded", "false");
    const panelId = await faq.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();

    await faq.click();
    await expect(faq).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`[id="${panelId}"]`)).toBeVisible();
  });

  test("Spark selection stays put after manual input", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForLandingHydration(page);

    const graphTab = page.getByRole("tab", { name: /Desmos Graph/ });
    await graphTab.click();
    await expect(graphTab).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(5_000);
    await expect(graphTab).toHaveAttribute("aria-selected", "true");
  });

  test("reduced motion prevents Spark auto-advance", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForLandingHydration(page);

    const sceneTab = page.getByRole("tab", { name: /Interactive Scene/ });
    await expect(sceneTab).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(5_000);
    await expect(sceneTab).toHaveAttribute("aria-selected", "true");
  });
});
