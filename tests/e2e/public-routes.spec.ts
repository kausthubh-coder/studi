import { expect, test } from "@playwright/test";
import axe from "axe-core";

type AxeColorContrastFailure = {
  target: string[];
  summary: string | undefined;
};

test.describe("public routes", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  async function waitForLandingHydration(page: import("@playwright/test").Page) {
    await expect(
      page.locator('[data-studi-landing-hydrated="true"]'),
    ).toBeVisible({ timeout: 30_000 });
  }

  async function revealScrollTriggeredContent(
    page: import("@playwright/test").Page,
  ) {
    const pageHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );

    for (let y = 0; y < pageHeight; y += 500) {
      await page.evaluate((scrollTop) => window.scrollTo(0, scrollTop), y);
      await page.waitForTimeout(50);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(700);
  }

  async function getColorContrastFailures(
    page: import("@playwright/test").Page,
  ): Promise<AxeColorContrastFailure[]> {
    await page.addScriptTag({ content: axe.source });

    return page.evaluate(async () => {
      const axeApi = Reflect.get(window, "axe") as {
        run: (
          context: Document,
          options: { runOnly: { type: "rule"; values: string[] } },
        ) => Promise<{
          violations: Array<{
            nodes: Array<{ target: string[]; failureSummary?: string }>;
          }>;
        }>;
      };
      const results = await axeApi.run(document, {
        runOnly: { type: "rule", values: ["color-contrast"] },
      });

      return results.violations.flatMap((violation) =>
        violation.nodes.map((node) => ({
          target: node.target,
          summary: node.failureSummary,
        })),
      );
    });
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

  test("landing and waitlist owned UI meet WCAG AA color contrast", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const path of ["/", "/waitlist"]) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      if (path === "/") {
        await waitForLandingHydration(page);
        await revealScrollTriggeredContent(page);
      }

      expect(
        await getColorContrastFailures(page),
        `${path} should not have color-contrast violations`,
      ).toEqual([]);
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

  test("mobile landing keeps Open chat visible and exposes FAQ state", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForLandingHydration(page);

    const openChat = page.getByRole("link", { name: "Open chat" }).first();
    await expect(openChat).toBeVisible();
    await expect(openChat).toHaveAttribute("href", "/chat");

    const faq = page.getByRole("button", { name: "Is it free?" });
    await expect(faq).toHaveAttribute("aria-expanded", "false");
    const panelId = await faq.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();

    await faq.click();
    await expect(faq).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(`[id="${panelId}"]`)).toBeVisible();
  });

  test("landing primary content remains visible without JavaScript", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const heading = page.getByRole("heading", {
        name: /Learn it like you invented it/i,
      });
      await expect(heading).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Open chat" }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("textbox", { name: "Email address" }).first(),
      ).toBeVisible();
      await expect(heading).not.toHaveCSS("opacity", "0");
    } finally {
      await context.close();
    }
  });

  test("Spark selection stays put after manual input", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForLandingHydration(page);

    const graphTab = page.getByRole("tab", { name: /Live Graph/ });
    await graphTab.click();
    await expect(graphTab).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(5_000);
    await expect(graphTab).toHaveAttribute("aria-selected", "true");
  });

  test("reduced motion prevents Spark auto-advance", async ({ page }) => {
    const hydrationWarnings: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("server rendered HTML didn't match")
      ) {
        hydrationWarnings.push(message.text());
      }
    });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await waitForLandingHydration(page);

    const sceneTab = page.getByRole("tab", { name: /Interactive Scene/ });
    await expect(sceneTab).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(5_000);
    await expect(sceneTab).toHaveAttribute("aria-selected", "true");
    expect(hydrationWarnings).toEqual([]);
  });
});
