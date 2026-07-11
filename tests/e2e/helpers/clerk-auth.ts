import { createClerkClient } from "@clerk/backend";
import { clerk } from "@clerk/testing/playwright";
import { expect, type Page } from "@playwright/test";

type AuthMode = "clerk-testing" | "agent-task";

const agentTaskSessionSeconds = 30 * 60;

function baseUrl(): string {
  const port = process.env.PORT ?? "3000";
  return process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;
}

function authMode(): AuthMode {
  return process.env.E2E_CLERK_AUTH_MODE === "agent-task"
    ? "agent-task"
    : "clerk-testing";
}

function testUserEmail(): string | undefined {
  return process.env.E2E_CLERK_USER_EMAIL;
}

function testUserId(): string | undefined {
  return process.env.E2E_CLERK_USER_ID;
}

export function missingClerkBrowserAuthEnv(): string[] {
  const missing: string[] = [];

  if (!process.env.CLERK_SECRET_KEY) {
    missing.push("CLERK_SECRET_KEY");
  }

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    missing.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  }

  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    missing.push("NEXT_PUBLIC_CONVEX_URL");
  }

  if (authMode() === "agent-task" && !testUserEmail() && !testUserId()) {
    missing.push("E2E_CLERK_USER_EMAIL or E2E_CLERK_USER_ID");
  } else if (authMode() === "clerk-testing" && !testUserEmail()) {
    missing.push("E2E_CLERK_USER_EMAIL");
  }

  return missing;
}

export function hasClerkBrowserAuthEnv(): boolean {
  return missingClerkBrowserAuthEnv().length === 0;
}

export function clerkBrowserAuthSkipReason(): string {
  return `Requires ${missingClerkBrowserAuthEnv().join(", ")} for authenticated Clerk browser tests.`;
}

export async function signInToStudi(page: Page): Promise<void> {
  if (authMode() === "agent-task") {
    await signInWithAgentTask(page);
  } else {
    await signInWithClerkTesting(page);
  }

  await expect(page).toHaveURL(/\/chat(?:[/?#]|$)/);
  await expect(
    page.locator(
      'textarea[placeholder="What would you like to learn?"], textarea[placeholder="Ask a follow-up..."]',
    ),
  ).toBeVisible();
}

async function signInWithClerkTesting(page: Page): Promise<void> {
  const email = testUserEmail();
  if (!email) {
    throw new Error("E2E_CLERK_USER_EMAIL is required for @clerk/testing.");
  }

  // Public landing intentionally omits Clerk to keep acquisition static and
  // resilient. Pricing mounts Clerk for its live billing table, so it is the
  // lightweight public bootstrap surface for @clerk/testing.
  await page.goto("/pricing");
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/chat");
}

async function signInWithAgentTask(page: Page): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("CLERK_SECRET_KEY is required for Clerk Agent Tasks.");
  }

  const userId = testUserId();
  const email = testUserEmail();
  if (!userId && !email) {
    throw new Error(
      "E2E_CLERK_USER_ID or E2E_CLERK_USER_EMAIL is required for Clerk Agent Tasks.",
    );
  }

  const clerkClient = createClerkClient({
    secretKey,
    apiUrl: process.env.CLERK_API_URL,
  });

  const agentTask = await clerkClient.agentTasks.create({
    onBehalfOf: userId ? { userId } : { identifier: email! },
    permissions: "*",
    agentName: "studi-browser-agent",
    taskDescription: "Authenticated browser smoke for Studi",
    redirectUrl: new URL("/chat", baseUrl()).toString(),
    sessionMaxDurationInSeconds: Number(
      process.env.E2E_CLERK_AGENT_TASK_SESSION_SECONDS ??
        agentTaskSessionSeconds,
    ),
  });

  await page.goto(agentTask.url, { waitUntil: "domcontentloaded" });
}
