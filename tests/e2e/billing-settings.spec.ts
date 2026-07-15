import { expect, test } from "@playwright/test";
import {
  clerkBrowserAuthSkipReason,
  hasClerkBrowserAuthEnv,
  signInToStudi,
} from "./helpers/clerk-auth";

test.describe("billing settings truth", () => {
  test.skip(!hasClerkBrowserAuthEnv(), clerkBrowserAuthSkipReason());

  test("separates monthly AI capacity from chat prompt count", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await signInToStudi(page);
    await page.goto("/settings", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("Current plan")).toBeVisible();
    const promptVolumeMeter = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Prompt volume" }),
    });
    const monthlyAiCapacityMeter = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Monthly AI capacity" }),
    });

    await expect(monthlyAiCapacityMeter).toHaveCount(1);
    await expect(
      monthlyAiCapacityMeter.getByRole("progressbar", {
        name: /monthly AI capacity used/i,
      }),
    ).toBeVisible();
    const promptVolumeCount = promptVolumeMeter.getByText(
      /chat prompts? sent/i,
    );
    const monthlyCapacityPromptCount = monthlyAiCapacityMeter.getByText(
      /chat prompts? sent/i,
    );
    await expect(monthlyCapacityPromptCount).toBeVisible();
    await expect(
      monthlyAiCapacityMeter.getByText(/counted separately/i),
    ).toBeVisible();

    const isFreePreview = await page
      .getByRole("heading", {
        name: "Guided preview",
        exact: true,
        level: 2,
      })
      .isVisible();
    await expect(promptVolumeMeter).toHaveCount(isFreePreview ? 0 : 1);
    if (!isFreePreview) {
      await expect(
        promptVolumeMeter.getByRole("progressbar", { name: /remaining/i }),
      ).toBeVisible();
      await expect(promptVolumeCount).toBeVisible();
      await expect(promptVolumeCount).toHaveText(
        await monthlyCapacityPromptCount.innerText(),
      );
    }

    const usageTab = page.getByRole("tab", { name: /Usage/ });
    const billingTab = page.getByRole("tab", { name: /Billing/ });
    for (const tab of await page.getByRole("tab").all()) {
      const controlledId = await tab.getAttribute("aria-controls");
      expect(controlledId).toBeTruthy();
      await expect(page.locator(`#${controlledId}`)).toHaveCount(1);
    }
    await expect(usageTab).toHaveAttribute("aria-selected", "true");
    await expect(billingTab).toHaveAttribute("aria-selected", "false");
    await usageTab.focus();
    await usageTab.press("ArrowRight");
    await expect(billingTab).toBeFocused();
    await expect(billingTab).toHaveAttribute("aria-selected", "true");
    const panel = page.getByRole("tabpanel");
    await expect(panel).toHaveAttribute(
      "aria-labelledby",
      await billingTab.getAttribute("id") ?? "",
    );
    await expect(
      page.getByRole("heading", { name: "Choose by how often you learn" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Current prices and availability" }),
    ).toBeVisible();
  });
});
