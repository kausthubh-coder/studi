export const realCodeSparkOptInEnv = "E2E_CODE_SPARK_REAL_CHAT";
export const realCodeSparkProviderEnv = "E2E_CODE_SPARK_PROVIDER_EXPECTED";

type GateResult = { skip: true; reason: string } | { skip: false };

export function evaluateRealCodeSparkGate(input: {
  optIn: string | undefined;
  expectedProvider: string | undefined;
  missingAuthEnv: string[];
}): GateResult {
  if (input.optIn !== "1") {
    return {
      skip: true,
      reason:
        "Live Code Spark provider E2E is opt-in. Run bun run test:e2e:code-spark:real (sets E2E_CODE_SPARK_REAL_CHAT=1).",
    };
  }

  const missing = [...input.missingAuthEnv];
  if (input.expectedProvider !== "vercel_sandbox") {
    missing.push("E2E_CODE_SPARK_PROVIDER_EXPECTED=vercel_sandbox");
  }

  if (missing.length > 0) {
    return {
      skip: true,
      reason: `Live Code Spark provider E2E prerequisites are missing: ${missing.join(
        ", ",
      )}. Verify the target Clerk/Convex pairing and provider configuration, then rerun bun run test:e2e:code-spark:real.`,
    };
  }

  return { skip: false };
}
