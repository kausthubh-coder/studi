import { expect, test } from "@playwright/test";
import {
  clerkBrowserAuthSkipReason,
  hasClerkBrowserAuthEnv,
  signInToStudi,
} from "./helpers/clerk-auth";

const billingLockExplanation =
  /^(You've used your free onboarding chats\. Choose a plan to keep going\.|Your paid plan is not active\. Update billing to keep learning\.|You've reached this month's Starter usage limit\. Upgrade to Pro for higher monthly capacity\.|You've reached this month's Pro usage limit\. Contact support if you need a higher cap\.)$/;

type LayoutEntryState =
  | "existing-thread"
  | "entitled-welcome"
  | "locked-welcome"
  | "unresolved";

test.describe("authenticated chat layout", () => {
  test.skip(!hasClerkBrowserAuthEnv(), clerkBrowserAuthSkipReason());

  test("keeps active or billing-locked chat geometry sound at desktop and mobile sizes", async ({
    page,
  }, testInfo) => {
    await signInToStudi(page);

    const threads = page.locator(".sidebar-thread-btn");
    const welcomeComposer = page.getByPlaceholder(
      "What would you like to learn?",
    );
    const sendButton = page.getByRole("button", { name: "Send message" });
    const viewPlansLink = page.getByRole("link", { name: "View plans" });
    await expect(welcomeComposer).toBeEditable();
    await welcomeComposer.fill(
      "Layout smoke: ask one short question about mean and median. Do not create a Spark.",
    );

    const readEntryState = async (): Promise<LayoutEntryState> => {
      if ((await threads.count()) > 0) {
        return "existing-thread";
      }
      if (await viewPlansLink.isVisible()) {
        return "locked-welcome";
      }
      if (await sendButton.isEnabled()) {
        return "entitled-welcome";
      }
      return "unresolved";
    };
    let candidateState: LayoutEntryState = "unresolved";
    let candidateSince = Date.now();

    await expect
      .poll(
        async () => {
          const nextState = await readEntryState();
          if (nextState !== candidateState) {
            candidateState = nextState;
            candidateSince = Date.now();
          }
          return nextState !== "unresolved" && Date.now() - candidateSince >= 2_000
            ? nextState
            : "unresolved";
        },
        {
          message:
            "chat layout should settle with an existing thread or an explicit welcome entitlement state",
          timeout: 20_000,
          intervals: [100, 250, 500],
        },
      )
      .not.toBe("unresolved");

    const entryState = await readEntryState();
    expect(entryState).not.toBe("unresolved");

    if (entryState === "existing-thread") {
      await threads.first().click();
    } else if (entryState === "entitled-welcome") {
      await expect(sendButton).toBeEnabled();
      await sendButton.click();
    } else {
      await expect(sendButton).toBeDisabled();
      await expect(page.getByText(billingLockExplanation)).toBeVisible();
      await expect(viewPlansLink).toHaveAttribute(
        "href",
        "/pricing?entry_point=chat_banner&surface=chat",
      );
      testInfo.annotations.push({
        type: "billing-locked-layout-boundary",
        description:
          "No existing thread was available and billing prevented creating one; verified welcome composer/content geometry instead of active-thread geometry.",
      });
    }

    const hasActiveThread = entryState !== "locked-welcome";
    if (hasActiveThread) {
      await expect(page.getByPlaceholder("Ask a follow-up...")).toBeVisible({
        timeout: 30_000,
      });
    }

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      if (viewport.name === "mobile") {
        const mobileSidebar = page.locator(".studi-thread-sidebar");
        await expect(mobileSidebar).toHaveAttribute(
          "data-mobile-open",
          "false",
        );
        await expect
          .poll(
            async () => {
              const sidebarBox = await mobileSidebar.boundingBox();
              return sidebarBox === null || sidebarBox.x + sidebarBox.width <= 1;
            },
            {
              message:
                "closed mobile sidebar should finish moving fully off the left canvas",
              timeout: 5_000,
              intervals: [50, 100, 200],
            },
          )
          .toBe(true);
      }

      if (hasActiveThread) {
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
      } else {
        const main = page.locator("main");
        const composer = page.locator(".composer-card.is-welcome");
        const welcomeContent = composer.locator(
          "xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' w-full ')][1]",
        );
        await expect(main).toBeVisible();
        await expect(composer).toBeVisible();
        await expect(welcomeContent).toBeVisible();

        const [mainBox, contentBox, composerBox] = await Promise.all([
          main.boundingBox(),
          welcomeContent.boundingBox(),
          composer.boundingBox(),
        ]);
        expect(mainBox).not.toBeNull();
        expect(contentBox).not.toBeNull();
        expect(composerBox).not.toBeNull();
        expect(contentBox!.x).toBeGreaterThanOrEqual(mainBox!.x - 1);
        expect(contentBox!.x + contentBox!.width).toBeLessThanOrEqual(
          mainBox!.x + mainBox!.width + 1,
        );
        expect(contentBox!.y).toBeGreaterThanOrEqual(mainBox!.y - 1);
        expect(contentBox!.y + contentBox!.height).toBeLessThanOrEqual(
          mainBox!.y + mainBox!.height + 1,
        );
        expect(composerBox!.x).toBeGreaterThanOrEqual(contentBox!.x - 1);
        expect(composerBox!.x + composerBox!.width).toBeLessThanOrEqual(
          contentBox!.x + contentBox!.width + 1,
        );
      }

      await page.screenshot({
        path: testInfo.outputPath(
          `chat-layout-${hasActiveThread ? "active" : "welcome-locked"}-${viewport.name}.png`,
        ),
        fullPage: true,
      });
    }
  });
});
