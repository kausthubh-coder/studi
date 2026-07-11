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
    await expect(
      page.getByRole("heading", { name: "Monthly AI capacity" }),
    ).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: /monthly AI capacity used/i }),
    ).toBeVisible();
    await expect(page.getByText(/chat prompts? sent/i)).toBeVisible();
    await expect(page.getByText(/counted separately/i)).toBeVisible();

    await page.getByRole("button", { name: /Billing/ }).click();
    await expect(
      page.getByRole("heading", { name: "Choose by how often you learn" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Current prices and availability" }),
    ).toBeVisible();
  });
});
