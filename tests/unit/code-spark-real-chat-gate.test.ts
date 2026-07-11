import { describe, expect, it } from "vitest";
import { evaluateRealCodeSparkGate } from "../e2e/helpers/code-spark-real-chat-gate";

describe("real Code Spark E2E gate", () => {
  it("keeps the live provider flow opt-in", () => {
    expect(
      evaluateRealCodeSparkGate({
        optIn: undefined,
        expectedProvider: undefined,
        missingAuthEnv: [],
      }),
    ).toEqual({
      skip: true,
      reason:
        "Live Code Spark provider E2E is opt-in. Run bun run test:e2e:code-spark:real (sets E2E_CODE_SPARK_REAL_CHAT=1).",
    });
  });

  it("names missing auth and provider prerequisites without secret values", () => {
    expect(
      evaluateRealCodeSparkGate({
        optIn: "1",
        expectedProvider: undefined,
        missingAuthEnv: ["CLERK_SECRET_KEY", "E2E_CLERK_USER_EMAIL"],
      }),
    ).toEqual({
      skip: true,
      reason:
        "Live Code Spark provider E2E prerequisites are missing: CLERK_SECRET_KEY, E2E_CLERK_USER_EMAIL, E2E_CODE_SPARK_PROVIDER_EXPECTED=vercel_sandbox. Verify the target Clerk/Convex pairing and provider configuration, then rerun bun run test:e2e:code-spark:real.",
    });
  });

  it("runs only after explicit opt-in and prerequisite confirmation", () => {
    expect(
      evaluateRealCodeSparkGate({
        optIn: "1",
        expectedProvider: "vercel_sandbox",
        missingAuthEnv: [],
      }),
    ).toEqual({ skip: false });
  });
});
