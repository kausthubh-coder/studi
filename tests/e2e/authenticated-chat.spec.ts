import { expect, test } from "@playwright/test";
import {
  clerkBrowserAuthSkipReason,
  hasClerkBrowserAuthEnv,
  signInToStudi,
} from "./helpers/clerk-auth";

test.describe("authenticated chat", () => {
  test.skip(!hasClerkBrowserAuthEnv(), clerkBrowserAuthSkipReason());

  test("agent can reach the protected chat composer", async ({ page }) => {
    await signInToStudi(page);

    await expect(page.getByRole("button", { name: "New thread" })).toBeVisible();

    const composer = page.locator(
      'textarea[placeholder="What would you like to learn?"], textarea[placeholder="Ask a follow-up..."]',
    );
    await composer.fill("Help me understand derivatives by asking questions.");
    await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  });
});
