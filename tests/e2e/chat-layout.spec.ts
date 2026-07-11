import { expect, test } from "@playwright/test";
import {
  clerkBrowserAuthSkipReason,
  hasClerkBrowserAuthEnv,
  signInToStudi,
} from "./helpers/clerk-auth";

test.describe("authenticated chat layout", () => {
  test.skip(!hasClerkBrowserAuthEnv(), clerkBrowserAuthSkipReason());

  test("keeps the message viewport above the composer at desktop and mobile sizes", async ({
    page,
  }, testInfo) => {
    await signInToStudi(page);

    const threads = page.locator(".sidebar-thread-btn");
    if ((await threads.count()) === 0) {
      const welcomeComposer = page.getByPlaceholder(
        "What would you like to learn?",
      );
      await welcomeComposer.fill(
        "Layout smoke: ask one short question about mean and median. Do not create a Spark.",
      );
      await page.getByRole("button", { name: "Send message" }).click();
    } else {
      await threads.first().click();
    }

    await expect(page.getByPlaceholder("Ask a follow-up...")).toBeVisible({
      timeout: 30_000,
    });

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      if (viewport.name === "mobile") {
        await expect(page.locator(".studi-thread-sidebar")).toHaveAttribute(
          "data-mobile-open",
          "false",
        );
        await page.waitForTimeout(300);
      }

      const messageViewport = page.getByTestId("message-scroll");
      const composer = page.getByTestId("chat-composer");
      await expect(messageViewport).toBeVisible();
      await expect(composer).toBeVisible();

      const [messageBox, composerBox] = await Promise.all([
        messageViewport.boundingBox(),
        composer.boundingBox(),
      ]);
      expect(messageBox).not.toBeNull();
      expect(composerBox).not.toBeNull();
      expect(messageBox!.y + messageBox!.height).toBeLessThanOrEqual(
        composerBox!.y + 1,
      );

      await page.screenshot({
        path: testInfo.outputPath(`chat-layout-${viewport.name}.png`),
        fullPage: true,
      });
    }
  });
});
