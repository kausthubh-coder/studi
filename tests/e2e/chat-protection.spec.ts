import { expect, test } from "@playwright/test";

const hasRequiredPublicEnv =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) &&
  Boolean(process.env.NEXT_PUBLIC_CONVEX_URL);

test.describe("chat route protection", () => {
  test.skip(
    !hasRequiredPublicEnv,
    "Requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and NEXT_PUBLIC_CONVEX_URL.",
  );

  test("unauthenticated users are sent to Clerk sign in", async ({ page }) => {
    await page.goto("/chat");

    await expect(page).toHaveURL(/sign-in|sign-up|accounts\.|clerk/i);
  });
});
