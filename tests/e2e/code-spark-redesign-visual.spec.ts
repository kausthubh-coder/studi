import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  missingClerkBrowserAuthEnv,
  signInToStudi,
} from "./helpers/clerk-auth";
import {
  evaluateRealCodeSparkGate,
  realCodeSparkOptInEnv,
  realCodeSparkProviderEnv,
} from "./helpers/code-spark-real-chat-gate";

const outDir = path.resolve(".artifacts/claude/redesign-live");

async function shot(page: import("@playwright/test").Page, name: string) {
  await mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, name), fullPage: false });
}

async function expectStatus(
  root: import("@playwright/test").Locator,
  regionName: "Terminal" | "Test results",
  expected: "Passed" | "Failed" | "Changes not run",
) {
  const region = root.getByRole("region", { name: regionName });
  const status = region.locator(
    regionName === "Terminal"
      ? ".code-spark-terminal-status"
      : ".code-spark-test-results-status",
  );
  await expect
    .poll(async () => (await status.innerText()).trim(), { timeout: 120_000 })
    .toBe(expected);
  return region;
}

const liveGate = evaluateRealCodeSparkGate({
  optIn: process.env[realCodeSparkOptInEnv],
  expectedProvider: process.env[realCodeSparkProviderEnv],
  missingAuthEnv: missingClerkBrowserAuthEnv(),
});

test.describe(
  "code spark redesign visual pass @redesign-visual @live-code-spark-provider",
  () => {
    if (liveGate.skip) {
      test.skip(true, liveGate.reason);
    }

    test("creates and verifies inline, expanded, and mobile Code Spark states", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      await signInToStudi(page);
      await shot(page, "01-chat.png");

      const newThread = page.getByRole("button", { name: "New thread" });
      if (await newThread.isVisible().catch(() => false)) {
        await newThread.click();
      }

      const composer = page.locator(
        'textarea[placeholder="What would you like to learn?"], textarea[placeholder="Ask a follow-up..."]',
      );
      await expect(composer).toBeVisible();
      await composer.fill(
        [
          "Create a tiny TypeScript Code Spark challenge, not a scene, quiz, or flashcard.",
          "The learner should repair add(a, b).",
          "Start with return 0 and log add(2, 3), so Run finishes successfully but the one visible Test fails.",
          "Do not reveal the solution in your response.",
        ].join(" "),
      );
      await page.getByRole("button", { name: "Send message" }).click();

      const inline = page.locator(".code-spark-inline").first();
      const quota = page.getByText("You've used your free onboarding chats", {
        exact: false,
      });
      const sparkFailure = page.locator(".spark-fail");
      const outcome = await Promise.race([
        inline
          .waitFor({ state: "visible", timeout: 180_000 })
          .then(() => "code-spark"),
        quota.waitFor({ state: "visible", timeout: 180_000 }).then(() => "quota"),
        sparkFailure
          .waitFor({ state: "visible", timeout: 180_000 })
          .then(() => "spark-failure"),
      ]);
      expect(outcome, "fresh visual Code Spark generation outcome").toBe(
        "code-spark",
      );
      await expect(
        inline
          .locator(
            'textarea[aria-label="Code editor"], [role="textbox"][aria-label="Editor content"], .monaco-editor textarea',
          )
          .first(),
      ).toBeVisible();
      await expect(inline).not.toContainText("Loading...");
      await expect(inline).toHaveAttribute("data-runtime-hydrated", "true");
      await expect(inline).toHaveAttribute(
        "data-runtime-provider",
        "vercel_sandbox",
      );

      const card = page.locator('section.spark-card[data-spark-kind="spark_code"]').first();
      const headerText = await card.locator(".spark-card-header").innerText();
      expect(headerText).not.toMatch(
        /return\s+(?:a\s*\+\s*b|b\s*\+\s*a)|(?:prints?|returns?|equals?)\s+5|expected\s+(?:value|output)?\s*(?:is|:)?\s*5/i,
      );
      await card.scrollIntoViewIfNeeded();
      await shot(page, "02-inline-spark.png");
      await card.screenshot({ path: path.join(outDir, "02b-inline-card.png") });

      const expandButton = card.locator(".spark-card-expand");
      const expandBox = await expandButton.boundingBox();
      expect(Math.round(expandBox?.height ?? 0)).toBeGreaterThanOrEqual(44);
      expect(Math.round(expandBox?.width ?? 0)).toBeGreaterThanOrEqual(44);
      await expandButton.click();
      const panel = page.locator(".spark-panel");
      await expect(panel).toBeVisible();
      expect(await panel.evaluate((node) => getComputedStyle(node).animationName)).toBe(
        "none",
      );
      const closeButton = panel.getByRole("button", {
        name: "Close spark panel",
      });
      const closeBox = await closeButton.boundingBox();
      expect(Math.round(closeBox?.height ?? 0)).toBeGreaterThanOrEqual(44);
      expect(Math.round(closeBox?.width ?? 0)).toBeGreaterThanOrEqual(44);
      await expect(panel.locator(".code-spark-shell")).toHaveAttribute(
        "data-runtime-hydrated",
        "true",
      );
      await expect(panel.locator(".code-spark-shell")).toHaveAttribute(
        "data-runtime-provider",
        "vercel_sandbox",
      );
      await shot(page, "03-expanded.png");

      const runButton = panel.getByRole("button", { name: "Run", exact: true });
      const testButton = panel.getByRole("button", {
        name: "Test",
        exact: true,
      });
      await expect(runButton).toBeEnabled();
      await expect(testButton).toBeEnabled();

      await runButton.click();
      const terminal = await expectStatus(panel, "Terminal", "Passed");
      await expect(panel.locator(".code-spark-shell")).toHaveAttribute(
        "data-runtime-provider",
        "vercel_sandbox",
      );
      await expect(panel.locator(".code-spark-shell")).toHaveAttribute(
        "data-runtime-execution-provider",
        "vercel_sandbox",
      );
      await expect(panel.locator(".code-spark-shell")).toHaveAttribute(
        "data-runtime-execution-kind",
        "run",
      );
      await expect(terminal.locator("pre")).toContainText("0");
      await shot(page, "04-expanded-after-run.png");

      await testButton.click();
      const testResults = await expectStatus(panel, "Test results", "Failed");
      await expect(panel.locator(".code-spark-shell")).toHaveAttribute(
        "data-runtime-execution-kind",
        "test",
      );
      await expectStatus(panel, "Terminal", "Passed");
      await terminal.screenshot({ path: path.join(outDir, "04b-terminal.png") });
      await testResults.screenshot({
        path: path.join(outDir, "04c-test-results.png"),
      });
      await shot(page, "04d-expanded-feedback-in-view.png");

      const editor = panel.locator(".monaco-editor").first();
      const visibleCode = panel.locator(".monaco-editor .view-lines");
      await editor.click({ position: { x: 220, y: 90 } });
      await page.keyboard.press("Control+A");
      await page.keyboard.press("Backspace");
      if ((await visibleCode.innerText()).trim().length > 0) {
        await page.keyboard.press("Meta+A");
        await page.keyboard.press("Backspace");
      }
      await expect.poll(async () => (await visibleCode.innerText()).trim()).toBe("");
      await page.keyboard.insertText(
        [
          "export const add = (a: number, b: number): number => a + b;",
          "",
          "console.log(add(2, 3));",
          "",
        ].join("\n"),
      );
      await expect(visibleCode).toContainText("=> a + b;");
      await expect(visibleCode).not.toContainText("return 0;");
      const normalizedVisibleCode = (await visibleCode.innerText()).replace(
        /\u00a0/g,
        " ",
      );
      expect(normalizedVisibleCode.match(/export const add/g)).toHaveLength(1);
      await expect(panel).toContainText(/unsaved edits/i);
      await expectStatus(panel, "Terminal", "Changes not run");
      await expect(terminal.locator("pre")).not.toContainText("0");
      await testButton.click();
      await expectStatus(panel, "Test results", "Passed");
      await expectStatus(panel, "Terminal", "Changes not run");
      await expect(panel.locator(".code-spark-shell")).toHaveAttribute(
        "data-runtime-hydrated",
        "true",
      );
      await expect(panel.locator(".code-spark-shell")).toHaveAttribute(
        "data-runtime-provider",
        "vercel_sandbox",
      );
      await expect(panel.locator(".code-spark-shell")).toHaveAttribute(
        "data-runtime-execution-provider",
        "vercel_sandbox",
      );
      await expect(panel.locator(".code-spark-shell")).toHaveAttribute(
        "data-runtime-execution-kind",
        "test",
      );
      await shot(page, "04e-expanded-after-repair.png");

      await page.setViewportSize({ width: 390, height: 844 });
      const sidebar = page.locator(".studi-thread-sidebar");
      const closeSidebar = page.getByRole("button", { name: "Close sidebar" });
      if ((await sidebar.getAttribute("data-mobile-open")) === "true") {
        await closeSidebar.click();
      }
      await page.waitForTimeout(300);
      await expect(panel).toBeVisible();
      const chatViewButton = page.getByRole("button", { name: "Chat", exact: true });
      const sparkViewButton = page.getByRole("button", { name: "Spark", exact: true });
      await expect(chatViewButton).toHaveAttribute("aria-pressed", "false");
      await expect(sparkViewButton).toHaveAttribute("aria-pressed", "true");
      for (const button of [chatViewButton, sparkViewButton]) {
        const box = await button.boundingBox();
        expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
      }
      await expect(runButton).toBeVisible();
      await expect(testButton).toBeVisible();
      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      for (const button of [runButton, testButton]) {
        const box = await button.boundingBox();
        expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);
      }
      await shot(page, "05-expanded-mobile.png");
      expect(pageErrors).toEqual([]);
    });
  },
);
