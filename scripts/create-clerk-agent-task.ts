import { createClerkClient } from "@clerk/backend";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), true);

const defaultSessionSeconds = 30 * 60;

function getBaseUrl() {
  const port = process.env.PORT ?? "3030";
  return (
    process.env.STUDI_AGENT_BASE_URL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    `http://127.0.0.1:${port}`
  );
}

function getRedirectUrl() {
  const redirectPath = process.env.STUDI_AGENT_REDIRECT_PATH ?? "/chat";
  return new URL(redirectPath, getBaseUrl()).toString();
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

async function main() {
  const secretKey = requireEnv("CLERK_SECRET_KEY");
  const userId = process.env.E2E_CLERK_USER_ID;
  const email = process.env.E2E_CLERK_USER_EMAIL;

  if (!userId && !email) {
    throw new Error("Set E2E_CLERK_USER_EMAIL or E2E_CLERK_USER_ID.");
  }

  const sessionSeconds = Number(
    process.env.E2E_CLERK_AGENT_TASK_SESSION_SECONDS ?? defaultSessionSeconds,
  );
  if (!Number.isFinite(sessionSeconds) || sessionSeconds <= 0) {
    throw new Error("E2E_CLERK_AGENT_TASK_SESSION_SECONDS must be positive.");
  }

  const clerkClient = createClerkClient({
    secretKey,
    apiUrl: process.env.CLERK_API_URL,
  });

  const agentTask = await clerkClient.agentTasks.create({
    onBehalfOf: userId ? { userId } : { identifier: email! },
    permissions: "*",
    agentName: process.env.STUDI_AGENT_NAME ?? "codex-browser-use",
    taskDescription:
      process.env.STUDI_AGENT_TASK_DESCRIPTION ??
      "Browser-use testing session for Studi",
    redirectUrl: getRedirectUrl(),
    sessionMaxDurationInSeconds: sessionSeconds,
  });

  console.log("Open this URL with Codex Browser Use:");
  console.log(agentTask.url);
  console.log("");
  console.log(`Redirects to: ${getRedirectUrl()}`);
  console.log(`Session max seconds: ${sessionSeconds}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
