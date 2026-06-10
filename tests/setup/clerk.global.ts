import { loadEnvConfig } from "@next/env";
import { clerkSetup } from "@clerk/testing/playwright";

export default async function globalSetup() {
  loadEnvConfig(process.cwd(), true);

  const hasClerkKeys =
    Boolean(process.env.CLERK_SECRET_KEY) &&
    Boolean(
      process.env.CLERK_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    );

  if (!hasClerkKeys) {
    return;
  }

  await clerkSetup();
}
