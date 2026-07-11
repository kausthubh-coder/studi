import { createClerkClient } from "@clerk/backend";
import { loadEnvConfig } from "@next/env";
import { spawnSync } from "node:child_process";

loadEnvConfig(process.cwd(), true);

const defaultTestEmail = "studi-agent+clerk_test@example.com";
const clerkTestEmailPattern = /^[^@\s+]+\+clerk_test@[^@\s]+\.[^@\s]+$/i;

function readFlag(name: string) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];

  return undefined;
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function assertAllowedTestEmail(email: string) {
  if (email === defaultTestEmail) return;
  if (clerkTestEmailPattern.test(email)) return;
  throw new Error("Refusing to reset billing for a non-+clerk_test email.");
}

function assertDevDeployment(deployment: string) {
  if (!/^dev:[a-z0-9-]+$/i.test(deployment.trim())) {
    throw new Error("Refusing to reset billing outside a dev Convex deployment.");
  }
}

async function main() {
  const email = normalizeEmail(readFlag("--email") ?? defaultTestEmail);
  assertAllowedTestEmail(email);

  const deployment = requireEnv("CONVEX_DEPLOYMENT").trim();
  assertDevDeployment(deployment);

  const clerkClient = createClerkClient({
    secretKey: requireEnv("CLERK_SECRET_KEY"),
    apiUrl: process.env.CLERK_API_URL,
  });
  const users = await clerkClient.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  const user = (Array.isArray(users) ? users : users.data)?.[0];
  if (!user) {
    throw new Error(`Missing Clerk test user: ${email}`);
  }

  console.log("Resetting dev test billing usage");
  console.log(`email: ${email}`);
  console.log(`deployment: ${deployment}`);
  console.log(`clerk user id prefix: ${user.id.slice(0, 8)}...`);

  const result = spawnSync(
    "bunx",
    [
      "convex",
      "run",
      "internal.billing.devResetTestBillingUsageInternal",
      JSON.stringify({
        clerkUserId: user.id,
        email,
        deployment,
      }),
      "--typecheck",
      "disable",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  if (result.stdout.trim()) {
    console.log(result.stdout.trim());
  }
  if (result.stderr.trim()) {
    console.error(result.stderr.trim());
  }
  if (result.status !== 0) {
    throw new Error(`Convex reset command failed with status ${result.status}.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
