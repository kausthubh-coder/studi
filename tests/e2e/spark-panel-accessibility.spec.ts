import { expect, test } from "@playwright/test";
import {
  clerkBrowserAuthSkipReason,
  hasClerkBrowserAuthEnv,
  signInToStudi,
} from "./helpers/clerk-auth";

test.describe("expanded Spark accessibility", () => {
  test.skip(!hasClerkBrowserAuthEnv(), clerkBrowserAuthSkipReason());
  test.setTimeout(60_000);

  test("supports keyboard resizing and exposes selected mobile panel state", async ({
    page,
  }, testInfo) => {
    await signInToStudi(page);
    await page.setViewportSize({ width: 1440, height: 900 });

    const threads = page.locator(".sidebar-thread-btn");
    await expect.poll(() => threads.count()).toBeGreaterThan(0);

    const limit = Math.min(await threads.count(), 8);
    let foundExpandableSpark = false;
    for (let index = 0; index < limit; index += 1) {
      await threads.nth(index).click();
      await page.waitForTimeout(600);
      const expand = page.getByRole("button", { name: "Expand spark" });
      if ((await expand.count()) > 0) {
        await expand.click();
        foundExpandableSpark = true;
        break;
      }
    }
    expect(foundExpandableSpark).toBe(true);

    const closePanel = page.getByRole("button", { name: "Close spark panel" });
    await expect(closePanel).toBeFocused();
    await closePanel.click();
    const restoredExpand = page.getByRole("button", { name: "Expand spark" });
    await expect(restoredExpand).toBeFocused();
    await restoredExpand.click();
    await expect(page.getByRole("button", { name: "Close spark panel" })).toBeFocused();

    const separator = page.getByRole("separator", {
      name: "Resize chat and Spark panels",
    });
    await expect(separator).toBeVisible();
    await expect(separator).toHaveAttribute("aria-orientation", "vertical");
    const initialWidth = Number(await separator.getAttribute("aria-valuenow"));
    await separator.press("ArrowRight");
    await expect(separator).toHaveAttribute(
      "aria-valuenow",
      String(initialWidth + 24),
    );
    await page.screenshot({
      path: testInfo.outputPath("spark-panel-desktop.png"),
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    const chatTab = page.getByRole("button", { name: "Chat", exact: true });
    const sparkTab = page.getByRole("button", { name: "Spark", exact: true });
    await expect(chatTab).toHaveAttribute("aria-pressed", "false");
    await expect(sparkTab).toHaveAttribute("aria-pressed", "true");
    await chatTab.click();
    await expect(chatTab).toHaveAttribute("aria-pressed", "true");
    await expect(sparkTab).toHaveAttribute("aria-pressed", "false");
    await page.screenshot({
      path: testInfo.outputPath("spark-panel-mobile.png"),
      fullPage: true,
    });
  });
});
