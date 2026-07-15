import { expect, test } from "@playwright/test";

const hasRequiredPublicEnv =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

test.describe("chat route protection", () => {
  test.skip(
    !hasRequiredPublicEnv,
    "Requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and NEXT_PUBLIC_CONVEX_URL.",
  );

  test("unauthenticated users reach a usable Clerk sign-in surface", async ({
    page,
  }) => {
    const response = await page.goto("/chat", {
      waitUntil: "domcontentloaded",
    });

    expect(response?.status(), "Clerk sign-in must not end on an HTTP error").toBeLessThan(
      400,
    );
    await expect(page).toHaveURL(/sign-in|sign-up|accounts\.|clerk/i);
    await expect(page).not.toHaveTitle(/just a moment|attention required/i);
    await expect(
      page.getByText(/performing security verification|verify you are human/i),
    ).toHaveCount(0);

    const identifier = page
      .locator(
        'input[name="identifier"], input[type="email"], input[type="tel"]',
      )
      .first();
    await expect(
      identifier,
      "Clerk must expose an operable identifier field, not only a redirect URL",
    ).toBeVisible({ timeout: 15_000 });
    await expect(identifier).toBeEditable();

    const submit = page
      .getByRole("button", { name: /continue|sign in/i })
      .first();
    await expect(submit).toBeVisible();
    await expect(submit).toBeEnabled();
  });
});
