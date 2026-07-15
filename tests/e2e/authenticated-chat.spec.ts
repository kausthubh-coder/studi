import { expect, test } from "@playwright/test";
import {
  clerkBrowserAuthSkipReason,
  hasClerkBrowserAuthEnv,
  signInToStudi,
} from "./helpers/clerk-auth";

test.describe("authenticated chat", () => {
  test.skip(!hasClerkBrowserAuthEnv(), clerkBrowserAuthSkipReason());

  test("agent can reach and use the protected chat composer", async ({ page }) => {
    await signInToStudi(page);

    await expect(page.getByRole("button", { name: "New thread" })).toBeVisible();

    const composer = page.locator(
      'textarea[placeholder="What would you like to learn?"], textarea[placeholder="Ask a follow-up..."]',
    );
    const prompt = "Help me understand derivatives by asking questions.";
    await expect(composer).toBeEditable();
    await composer.fill(prompt);
    await expect(composer).toHaveValue(prompt);

    const sendButton = page.getByRole("button", { name: "Send message" });
    const viewPlansLink = page.getByRole("link", { name: "View plans" });
    let candidateState: "entitled" | "locked" | "unresolved" = "unresolved";
    let candidateSince = Date.now();

    await expect
      .poll(
        async () => {
          const nextState = (await viewPlansLink.isVisible())
            ? "locked"
            : (await sendButton.isEnabled())
              ? "entitled"
              : "unresolved";
          if (nextState !== candidateState) {
            candidateState = nextState;
            candidateSince = Date.now();
          }

          return nextState !== "unresolved" && Date.now() - candidateSince >= 1_500
            ? nextState
            : "unresolved";
        },
        {
          message:
            "composer should settle as entitled or expose a specific billing lock",
          timeout: 15_000,
          intervals: [100, 250, 500],
        },
      )
      .not.toBe("unresolved");

    const settledState: "entitled" | "locked" | "unresolved" =
      (await viewPlansLink.isVisible())
        ? "locked"
        : (await sendButton.isEnabled())
          ? "entitled"
          : "unresolved";
    expect(settledState).not.toBe("unresolved");

    if (settledState === "entitled") {
      await expect(sendButton).toBeEnabled();
      await expect(viewPlansLink).toHaveCount(0);
      return;
    }

    await expect(sendButton).toBeDisabled();
    await expect(
      page.getByText(
        /^(You've used your free onboarding chats\. Choose a plan to keep going\.|Your paid plan is not active\. Update billing to keep learning\.|You've reached this month's Starter usage limit\. Upgrade to Pro for higher monthly capacity\.|You've reached this month's Pro usage limit\. Contact support if you need a higher cap\.)$/,
      ),
    ).toBeVisible();
    await expect(viewPlansLink).toHaveAttribute(
      "href",
      "/pricing?entry_point=chat_banner&surface=chat",
    );
    await viewPlansLink.click();
    await expect(page).toHaveURL(
      /\/pricing\?entry_point=chat_banner&surface=chat$/,
    );
    await expect(
      page.getByRole("heading", {
        name: "Pick the plan that matches your pace",
      }),
    ).toBeVisible();
  });
});
