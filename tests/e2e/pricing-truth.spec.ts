import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __studiPricingCls?: number;
  }
}

const viewports = [
  { name: "mobile", width: 390, height: 844, minimumReserve: 400 },
  { name: "desktop", width: 1_440, height: 900, minimumReserve: 240 },
] as const;

for (const viewport of viewports) {
  test(`pricing stays truthful and stable on ${viewport.name}`, async ({
    page,
  }) => {
    const protectedChatPrefetches: string[] = [];
    const corsErrors: string[] = [];

    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      window.__studiPricingCls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number;
            hadRecentInput: boolean;
          };
          if (!shift.hadRecentInput) {
            window.__studiPricingCls =
              (window.__studiPricingCls ?? 0) + shift.value;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname === "/chat" && url.searchParams.has("_rsc")) {
        protectedChatPrefetches.push(request.url());
      }
    });
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        /cors|access-control/i.test(message.text())
      ) {
        corsErrors.push(message.text());
      }
    });

    const response = await page.goto("/pricing", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.ok()).toBe(true);

    await expect(
      page.getByRole("heading", {
        name: "Pick the plan that matches your pace",
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Starter" })).toBeVisible();
    await expect(
      page.getByText(/Clerk supplies the live prices/i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Subscribe" })).toHaveCount(
      2,
    );

    const shell = page.getByTestId("clerk-pricing-table-shell");
    await expect(shell).toHaveAttribute("data-layout-reserve", "responsive");
    const minimumHeight = await shell.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).minHeight),
    );
    expect(minimumHeight).toBeGreaterThanOrEqual(viewport.minimumReserve);

    await page.waitForTimeout(4_000);

    expect(protectedChatPrefetches).toEqual([]);
    expect(corsErrors).toEqual([]);
    const cls = await page.evaluate(() => window.__studiPricingCls ?? 0);
    expect(cls).toBeLessThan(0.05);
    console.log(
      `pricing ${viewport.name}: reserve=${minimumHeight}px cls=${cls.toFixed(4)} protected-prefetches=${protectedChatPrefetches.length} cors-errors=${corsErrors.length}`,
    );
  });
}
