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

const outDir = path.resolve(
  ".artifacts/thread-browser/20260709-real-chat-codespark",
);
const obviousSolutionLeak =
  /return\s+(?:a\s*\+\s*b|b\s*\+\s*a)|(?:use|write|replace[^.]*with)\s+[`'" ]*a\s*\+\s*b|(?:prints?|returns?|equals?|evaluates?\s+to)\s+(?:5|five)|(?:correct|expected)\s+(?:result|value|output)\s*(?:is|equals?|:)?\s*(?:5|five)|(?:sum\s+(?:is|should\s+be|equals?))\s+(?:5|five)|add\(\s*2\s*,\s*3\s*\)\s+(?:returns?|equals?|evaluates?)(?:\s+to)?\s+(?:5|five)/i;

async function screenshot(page: import("@playwright/test").Page, name: string) {
  await mkdir(outDir, { recursive: true });
  await page.screenshot({ path: path.join(outDir, name), fullPage: true });
}

async function waitForCompletedRun(
  root: import("@playwright/test").Locator,
  regionName: "Terminal" | "Test results",
) {
  const region = root.getByRole("region", { name: regionName });
  const status = region.locator(
    regionName === "Terminal"
      ? ".code-spark-terminal-status"
      : ".code-spark-test-results-status",
  );
  await expect
    .poll(
      async () => (await status.innerText()).trim(),
      { timeout: 90_000 },
    )
    .toMatch(/^(Passed|Failed)$/);
  return region;
}

async function expectProviderBackedResult(
  root: import("@playwright/test").Locator,
  regionName: "Terminal" | "Test results",
) {
  await expect(root).not.toContainText("Development-only checks");
  await expect(root).not.toContainText("Runtime unavailable");

  const region = await waitForCompletedRun(root, regionName);
  await expect(region).toBeVisible();
  if (regionName === "Terminal") {
    await expect(region.locator("pre")).not.toContainText(
      "Run your code to see output.",
    );
  }

  const visibleText = await root.innerText();
  expect(visibleText).not.toMatch(/local_fake|Local test runner/i);
  expect(visibleText).not.toMatch(
    /Provider unavailable|Provider unconfigured/i,
  );
  expect(visibleText).not.toMatch(/Vercel Sandbox requires/i);
  return region;
}

async function expectFeedbackHeaderAboveComposer(
  page: import("@playwright/test").Page,
  region: import("@playwright/test").Locator,
  headerSelector: string,
) {
  const composer = page.locator(".composer-card").last();
  await expect
    .poll(async () => {
      const [headerBox, composerBox] = await Promise.all([
        region.locator(headerSelector).boundingBox(),
        composer.boundingBox(),
      ]);
      if (!headerBox || !composerBox) return false;
      return headerBox.y + headerBox.height <= composerBox.y + 1;
    })
    .toBe(true);
}

const liveGate = evaluateRealCodeSparkGate({
  optIn: process.env[realCodeSparkOptInEnv],
  expectedProvider: process.env[realCodeSparkProviderEnv],
  missingAuthEnv: missingClerkBrowserAuthEnv(),
});

test.describe("real chat-created Code Spark @live-code-spark-provider", () => {
  if (liveGate.skip) {
    test.skip(true, liveGate.reason);
  }

  test.setTimeout(240_000);

  test("signs in, creates a Code Spark, and clicks Run/Test", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await signInToStudi(page);
    await screenshot(page, "01-authenticated-chat.png");

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
        "Create a tiny Code Spark challenge, not a scene, quiz, or flashcard.",
        "Use TypeScript only.",
        "The learner should fix an add(a, b) function.",
        "Make it runnable with one visible check and keep it very small.",
      ].join(" "),
    );

    await page.getByRole("button", { name: "Send message" }).click();
    await screenshot(page, "02-prompt-sent.png");

    const quota = page.getByText("You've used your free onboarding chats", {
      exact: false,
    });
    const sparkFailure = page.locator(".spark-fail");
    const codeSpark = page
      .locator(
        '.spark-card[data-spark-kind="spark_code"], .code-spark-inline, .code-spark-shell',
      )
      .first();

    const outcome = await Promise.race([
      codeSpark
        .waitFor({ state: "visible", timeout: 180_000 })
        .then(() => "code-spark"),
      quota.waitFor({ state: "visible", timeout: 180_000 }).then(() => "quota"),
      sparkFailure
        .waitFor({ state: "visible", timeout: 180_000 })
        .then(() => "spark-failure"),
    ]).catch(
      (error) =>
        `timeout:${error instanceof Error ? error.message : String(error)}`,
    );

    await screenshot(page, "03-after-generation.png");
    expect(outcome, "Code Spark generation outcome").toBe("code-spark");

    const root = page.locator(".code-spark-inline, .code-spark-shell").first();
    await expect(root).toBeVisible();
    await expect(root).toHaveAttribute("data-runtime-hydrated", "true");
    await expect(root).toHaveAttribute(
      "data-runtime-provider",
      "vercel_sandbox",
    );
    const sparkHeaderText = await page
      .locator('section.spark-card[data-spark-kind="spark_code"] .spark-card-header')
      .first()
      .innerText();
    expect(sparkHeaderText).not.toMatch(obviousSolutionLeak);
    const latestAssistantTextWithoutSpark = await page
      .locator(".article-prose")
      .last()
      .evaluate((node) => {
        const clone = node.cloneNode(true) as HTMLElement;
        clone
          .querySelectorAll(".spark-card, .code-spark-inline, .code-spark-shell")
          .forEach((element) => element.remove());
        return clone.innerText;
      });
    expect(latestAssistantTextWithoutSpark).not.toMatch(obviousSolutionLeak);
    await expect(
      root
        .locator(
          'textarea[aria-label="Code editor"], [role="textbox"][aria-label="Editor content"], .monaco-editor textarea',
        )
        .first(),
    ).toBeVisible();

    const actions = root.locator(".code-spark-actions").first();
    const run = actions.getByRole("button", { name: "Run", exact: true });
    const testButton = actions.getByRole("button", {
      name: "Test",
      exact: true,
    });
    await expect(run).toBeVisible();
    await expect(testButton).toBeVisible();
    await expect(root).not.toContainText("Development-only checks");

    await run.scrollIntoViewIfNeeded();
    await run.click();
    const terminal = await expectProviderBackedResult(root, "Terminal");
    await expect(root).toHaveAttribute("data-runtime-hydrated", "true");
    await expect(root).toHaveAttribute(
      "data-runtime-provider",
      "vercel_sandbox",
    );
    await expect(root).toHaveAttribute(
      "data-runtime-execution-provider",
      "vercel_sandbox",
    );
    await expect(root).toHaveAttribute("data-runtime-execution-kind", "run");
    await expectFeedbackHeaderAboveComposer(
      page,
      terminal,
      ".code-spark-terminal-head",
    );
    await screenshot(page, "04-after-run.png");

    await testButton.scrollIntoViewIfNeeded();
    await testButton.click();
    const testResults = await expectProviderBackedResult(root, "Test results");
    await expect(root).toHaveAttribute("data-runtime-hydrated", "true");
    await expect(root).toHaveAttribute(
      "data-runtime-provider",
      "vercel_sandbox",
    );
    await expect(root).toHaveAttribute(
      "data-runtime-execution-provider",
      "vercel_sandbox",
    );
    await expect(root).toHaveAttribute("data-runtime-execution-kind", "test");
    await expectFeedbackHeaderAboveComposer(
      page,
      testResults,
      ".code-spark-test-results-head",
    );
    await expect(root.getByRole("region", { name: "Terminal" })).toBeVisible();
    await screenshot(page, "05-after-test.png");

    const visibleText = await root.innerText();
    expect(visibleText).not.toMatch(/Code Spark run limit reached/i);
    expect(visibleText).not.toMatch(/tests\/.*\.check\.(ts|js|mjs|cjs|py)/i);
    expect(visibleText).not.toMatch(/\b(?:bunx?|node|python3?)\s+tests\//i);
    expect(pageErrors).toEqual([]);
    expect(
      consoleErrors.filter((text) =>
        /Code Spark run limit reached|CONVEX/i.test(text),
      ),
    ).toEqual([]);
  });
});
