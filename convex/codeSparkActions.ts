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

const maxRunsPerCooldownWindow = 3;

const internalApi = internal as unknown as {
  codeSparks: {
    getRuntimeSessionForSparkInternal: FunctionReference<"query", "internal">;
    recordRunResultInternal: FunctionReference<"mutation", "internal">;
  };
};

function assertSafeCommand(language: string, command: string) {
  const normalized = command.trim().replace(/\s+/g, " ");
  if (!normalized) {
    throw new Error("Code Spark command is required");
  }

  const isTypeScriptSafe = /^node tests\/[A-Za-z0-9_-]+\.check\.ts$/.test(
    normalized,
  );
  const isPythonSafe =
    normalized === "python3 main.py" ||
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
  returns: v.object({
    status: runStatusValidator,
    provider: providerValidator,
    stdout: v.string(),
    stderr: v.string(),
    exitCode: v.optional(v.number()),
    durationMs: v.number(),
    timedOut: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    const session = await ctx.runQuery(
      internalApi.codeSparks.getRuntimeSessionForSparkInternal,
      {
        userId: identity.subject,
        threadId: args.threadId,
        sparkId: args.sparkId,
      },
    );
    if (!session) {
      throw new Error("Code Spark session not found");
    }
    if (session.recentRunCount >= maxRunsPerCooldownWindow) {
      throw new Error("Code Spark run limit reached. Try again in a few seconds.");
    }
    let command = args.mode === "test" ? session.testCommand : session.runCommand;

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
    const files = session.files as CodeSparkRuntimeFile[];
    const result: CodeSparkRuntimeRunResult = await (async () => {
      try {
        const runtimeSession = await provider.hydrateSession({
          sessionKey: `${session.threadId}-${session.sparkId}`,
          language: session.language,
          files,
          providerSessionId: session.providerSessionId,
        });

        return args.mode === "test"
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
        const message = error instanceof Error ? error.message : String(error);
        return {
          provider: provider.provider,
          status: "unavailable" as const,
          stdout: "",
          stderr: message,
          durationMs: 0,
          command,
          timedOut: false,
          reason: message,
        };
      }
    })();

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
  },
});
