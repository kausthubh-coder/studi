"use node";

import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { createCodeSparkRuntimeProvider } from "./codeSparkRuntime";
import type {
  CodeSparkRuntimeFile,
  CodeSparkRuntimeRunResult,
} from "../lib/code-sparks/types";
import { assertCodeSparkId } from "../lib/code-sparks/limits";
import {
  deriveCodeSparkLearnerRunCommand,
  isLearnerVisibleCodeSparkFile,
} from "../lib/sparks/contracts";

const providerValidator = v.union(
  v.literal("vercel_sandbox"),
  v.literal("daytona"),
  v.literal("e2b"),
  v.literal("local_fake"),
  v.literal("unavailable"),
);

const runModeValidator = v.union(v.literal("run"), v.literal("test"));

const runStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("passed"),
  v.literal("failed"),
  v.literal("timed_out"),
  v.literal("unavailable"),
);

const runLimitCodeValidator = v.union(
  v.literal("CODE_SPARK_COOLDOWN"),
  v.literal("CODE_SPARK_MONTHLY_LIMIT"),
);

const PROVIDER_UNAVAILABLE_MESSAGE =
  "Code Spark runtime provider is unavailable. Try again in a moment.";

type CodeSparkRunEntitlement = {
  planKey: "free_onboarding" | "intro" | "pro";
  status: "onboarding" | "active" | "past_due" | "canceled" | "inactive";
  billingPeriod: string;
  billingPeriodStart: number;
  billingPeriodEnd: number;
  monthlyRunLimit: number;
};

const internalApi = internal as unknown as {
  billing: {
    assertCanUseCodeSparkRunInternal: FunctionReference<"mutation", "internal">;
  };
  codeSparks: {
    reserveRunInternal: FunctionReference<"mutation", "internal">;
    finalizeRunReservationInternal: FunctionReference<"mutation", "internal">;
    recordRunResultInternal: FunctionReference<"mutation", "internal">;
  };
};

function challengeResultText(status: CodeSparkRuntimeRunResult["status"]) {
  if (status === "passed") {
    return "Check passed.";
  }
  if (status === "timed_out") {
    return "Check timed out. Try a smaller change.";
  }
  if (status === "unavailable") {
    return "Code runner unavailable. Try again in a moment.";
  }
  return "Check failed. Review your code and try again.";
}

function challengeRunResultText(status: CodeSparkRuntimeRunResult["status"]) {
  if (status === "passed") return "Program finished.";
  if (status === "timed_out") return "Program timed out.";
  if (status === "unavailable") {
    return "Code runner unavailable. Try again in a moment.";
  }
  return "Program exited with errors.";
}

function isSafeLearnerRunCommand(language: string, command: string) {
  if (language === "typescript") {
    return /^node (?:src\/)?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:js|mjs|cjs|ts)$/.test(
      command,
    );
  }
  if (language === "python") {
    return /^python3 (?:src\/)?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.py$/.test(
      command,
    );
  }
  return false;
}

function projectLearnerProgramOutput(value: string) {
  return value.replace(/^local_fake:\s*/gm, "");
}

function projectResultForPublic(
  mode: "workspace" | "challenge",
  kind: "run" | "test",
  language: string,
  result: CodeSparkRuntimeRunResult,
) {
  if (mode === "workspace") {
    return result;
  }
  if (
    kind === "run" &&
    isSafeLearnerRunCommand(language, result.command) &&
    result.status !== "unavailable"
  ) {
    return {
      provider: result.provider,
      status: result.status,
      reason: challengeRunResultText(result.status),
      stdout: projectLearnerProgramOutput(result.stdout),
      stderr: projectLearnerProgramOutput(result.stderr),
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
    };
  }
  return {
    provider: result.provider,
    status: result.status,
    reason: challengeResultText(result.status),
  };
}

function assertSafeCommand(language: string, command: string) {
  const normalized = command.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new Error("Code Spark command is required");
  }

  const isTypeScriptSafe =
    isSafeLearnerRunCommand("typescript", normalized) ||
    /^node tests\/[A-Za-z0-9_-]+\.check\.(?:js|mjs|cjs|ts)$/.test(normalized);
  const isPythonSafe =
    isSafeLearnerRunCommand("python", normalized) ||
    /^python3 tests\/[A-Za-z0-9_-]+\.check\.py$/.test(normalized);

  if (language === "typescript" && isTypeScriptSafe) {
    return normalized;
  }
  if (language === "python" && isPythonSafe) {
    return normalized;
  }

  throw new Error("Code Spark command is not allowlisted");
}

export const run = action({
  args: {
    threadId: v.string(),
    sparkId: v.string(),
    mode: runModeValidator,
    checkId: v.optional(v.string()),
    timeoutMs: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      status: runStatusValidator,
      provider: v.optional(providerValidator),
      reason: v.string(),
      stdout: v.optional(v.string()),
      stderr: v.optional(v.string()),
      exitCode: v.optional(v.number()),
      durationMs: v.optional(v.number()),
      timedOut: v.optional(v.boolean()),
      code: v.optional(runLimitCodeValidator),
      retryAfterMs: v.optional(v.number()),
      cooldownUntil: v.optional(v.number()),
    }),
    v.object({
      status: runStatusValidator,
      provider: providerValidator,
      stdout: v.string(),
      stderr: v.string(),
      exitCode: v.optional(v.number()),
      durationMs: v.number(),
      timedOut: v.boolean(),
      reason: v.optional(v.string()),
      code: v.optional(runLimitCodeValidator),
      retryAfterMs: v.optional(v.number()),
      cooldownUntil: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    assertCodeSparkId(args.sparkId);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    const entitlement = (await ctx.runMutation(
      internalApi.billing.assertCanUseCodeSparkRunInternal,
      {
        userId: identity.subject,
      },
    )) as CodeSparkRunEntitlement;
    const admission = await ctx.runMutation(
      internalApi.codeSparks.reserveRunInternal,
      {
        userId: identity.subject,
        threadId: args.threadId,
        sparkId: args.sparkId,
        monthlyRunLimit: entitlement.monthlyRunLimit,
        billingPeriodStart: entitlement.billingPeriodStart,
        billingPeriodEnd: entitlement.billingPeriodEnd,
      },
    );
    if (!admission.allowed) {
      const isMonthlyLimit = admission.limit === "monthly";
      const limitMessage = isMonthlyLimit
        ? "Code Spark monthly run limit reached for this billing period. Your edits are saved."
        : admission.limit === "active"
          ? "Code Spark has too many runs in progress. Wait for one to finish."
          : "Code Spark run limit reached. Try again in a few seconds.";
      const limitCode = isMonthlyLimit
        ? ("CODE_SPARK_MONTHLY_LIMIT" as const)
        : ("CODE_SPARK_COOLDOWN" as const);
      if (admission.mode === "challenge") {
        return {
          status: "unavailable" as const,
          reason: limitMessage,
          code: limitCode,
          retryAfterMs: admission.retryAfterMs,
          cooldownUntil: admission.cooldownUntil,
        };
      }
      return {
        status: "unavailable" as const,
        provider: admission.provider,
        stdout: "",
        stderr: limitMessage,
        exitCode: undefined,
        durationMs: 0,
        timedOut: false,
        reason: limitMessage,
        code: limitCode,
        retryAfterMs: admission.retryAfterMs,
        cooldownUntil: admission.cooldownUntil,
      };
    }
    const session = admission.session;
    let result: CodeSparkRuntimeRunResult | undefined;
    let providerForUsage = session.provider;

    try {
      const files = session.files as CodeSparkRuntimeFile[];
      let command =
        args.mode === "test" ? session.testCommand : session.runCommand;

      if (
        session.mode === "challenge" &&
        args.mode === "run" &&
        !isSafeLearnerRunCommand(session.language, command)
      ) {
        const learnerEntryFile =
          files.find(
            (file) =>
              file.path === session.activePath &&
              isLearnerVisibleCodeSparkFile(file),
          ) ?? files.find(isLearnerVisibleCodeSparkFile);
        const learnerCommand = learnerEntryFile
          ? deriveCodeSparkLearnerRunCommand(
              session.language,
              learnerEntryFile.path,
            )
          : undefined;
        if (learnerCommand) {
          command = learnerCommand;
        }
      }

      if (args.checkId) {
        const checks = session.checks as Array<{
          id: string;
          command: string;
          hidden: boolean;
        }>;
        const check = checks.find((item) => item.id === args.checkId);
        if (!check || check.hidden) {
          throw new Error("Visible Code Spark check not found");
        }
        command = check.command;
      }

      command = assertSafeCommand(session.language, command);

      const provider = createCodeSparkRuntimeProvider();
      providerForUsage = provider.provider;
      const runtimeFiles =
        session.mode === "challenge" && args.mode === "run"
          ? files.filter(isLearnerVisibleCodeSparkFile)
          : files;
      try {
        const runtimeSession = await provider.hydrateSession({
          sessionKey: `${session.threadId}-${session.sparkId}-${args.mode}`,
          language: session.language,
          files: runtimeFiles,
          providerSessionId: session.providerSessionId,
        });

        result =
          args.mode === "test"
            ? await provider.runTests(runtimeSession.providerSessionId, {
                kind: "test",
                command,
                timeoutMs: args.timeoutMs,
                language: session.language,
              })
            : await provider.runCommand(runtimeSession.providerSessionId, {
                kind: "run",
                command,
                timeoutMs: args.timeoutMs,
                language: session.language,
              });
      } catch (error) {
        void error;
        result = {
          provider: provider.provider,
          status: "unavailable" as const,
          stdout: "",
          stderr: PROVIDER_UNAVAILABLE_MESSAGE,
          durationMs: 0,
          command,
          timedOut: false,
          reason: PROVIDER_UNAVAILABLE_MESSAGE,
        };
      }

      if (result.status === "unavailable") {
        result = {
          ...result,
          stdout: "",
          stderr: PROVIDER_UNAVAILABLE_MESSAGE,
          reason: PROVIDER_UNAVAILABLE_MESSAGE,
        };
      }

      await ctx.runMutation(internalApi.codeSparks.recordRunResultInternal, {
        userId: identity.subject,
        threadId: args.threadId,
        sparkId: args.sparkId,
        kind: args.mode,
        provider: result.provider,
        status: result.status,
        command: result.command,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
      });

      if (session.mode === "challenge") {
        return projectResultForPublic(
          session.mode,
          args.mode,
          session.language,
          result,
        );
      }
      return {
        status: result.status,
        provider: result.provider,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
        reason: result.reason,
      };
    } finally {
      const finalization = {
        userId: identity.subject,
        reservationId: admission.reservationId,
        completed: result !== undefined && result.status !== "unavailable",
        provider: result?.provider ?? providerForUsage,
        status: result?.status ?? ("unavailable" as const),
        durationMs: result?.durationMs ?? 0,
        timedOut: result?.timedOut ?? false,
      };
      try {
        await ctx.runMutation(
          internalApi.codeSparks.finalizeRunReservationInternal,
          finalization,
        );
      } catch {
        // A transient finalizer failure must not replace the learner-facing run
        // result. Retry idempotently; expired reservations are also reconciled
        // opportunistically by the next admission/cleanup pass.
        try {
          await ctx.scheduler.runAfter(
            0,
            internalApi.codeSparks.finalizeRunReservationInternal,
            finalization,
          );
        } catch (scheduleError) {
          void scheduleError;
        }
      }
    }
  },
});
