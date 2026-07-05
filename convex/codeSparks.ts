import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getCodeSparkProviderConfig } from "../lib/code-sparks/config";

const languageValidator = v.union(
  v.literal("typescript"),
  v.literal("python"),
  v.literal("c"),
  v.literal("rust"),
  v.literal("mixed"),
);

const providerValidator = v.union(
  v.literal("vercel_sandbox"),
  v.literal("daytona"),
  v.literal("e2b"),
  v.literal("local_fake"),
  v.literal("unavailable"),
);

const providerStatusValidator = v.union(
  v.literal("configured"),
  v.literal("unconfigured"),
  v.literal("unavailable"),
  v.literal("test_only"),
);

const modeValidator = v.union(v.literal("workspace"), v.literal("challenge"));

const fileRoleValidator = v.union(
  v.literal("starter"),
  v.literal("solution"),
  v.literal("test"),
  v.literal("hidden_test"),
  v.literal("config"),
  v.literal("readme"),
);

const fileInputValidator = v.object({
  path: v.string(),
  language: languageValidator,
  contents: v.string(),
  editable: v.boolean(),
  role: fileRoleValidator,
});

const testInputValidator = v.object({
  id: v.string(),
  label: v.string(),
  command: v.string(),
  hidden: v.boolean(),
});

const runStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("passed"),
  v.literal("failed"),
  v.literal("timed_out"),
  v.literal("unavailable"),
);

const runCooldownWindowMs = 15_000;
const maxRunsPerCooldownWindow = 3;

function textHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return String(hash >>> 0);
}

function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((part) => part && part !== ".")
    .join("/");
}

function assertSafePath(path: string) {
  const normalized = normalizePath(path);
  if (
    !normalized ||
    normalized.split("/").includes("..") ||
    path.startsWith("/") ||
    /^[a-zA-Z]:/.test(path)
  ) {
    throw new Error("Unsafe Code Spark file path");
  }
  return normalized;
}

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

function assertVisibleOnlyInputs(args: {
  files: Array<{ role: string }>;
  tests: Array<{ hidden: boolean }>;
}) {
  if (args.files.some((file) => file.role === "hidden_test")) {
    throw new Error("Code Spark v1 only supports visible check files.");
  }
  if (args.tests.some((test) => test.hidden)) {
    throw new Error("Code Spark v1 only supports visible checks.");
  }
}

async function assertViewerOwnsThread(
  ctx: QueryCtx | MutationCtx,
  threadId: string,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  await ctx.runQuery(internal.chat.assertThreadOwner, {
    userId: identity.subject,
    threadId,
  });
  return identity.subject;
}

async function getOwnedSession(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  threadId: string,
  sparkId: string,
) {
  return await ctx.db
    .query("codeSparkSessions")
    .withIndex("by_userId_threadId_sparkId", (q) =>
      q.eq("userId", userId).eq("threadId", threadId).eq("sparkId", sparkId),
    )
    .unique();
}

export const upsertSessionFromArtifact = mutation({
  args: {
    threadId: v.string(),
    messageId: v.optional(v.string()),
    sparkId: v.string(),
    title: v.string(),
    mode: modeValidator,
    language: languageValidator,
    provider: providerValidator,
    providerStatus: providerStatusValidator,
    activePath: v.string(),
    runCommand: v.string(),
    testCommand: v.string(),
    files: v.array(fileInputValidator),
    tests: v.array(testInputValidator),
  },
  returns: v.object({
    sessionId: v.id("codeSparkSessions"),
    version: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await assertViewerOwnsThread(ctx, args.threadId);
    const now = Date.now();
    assertVisibleOnlyInputs(args);
    const activePath = assertSafePath(args.activePath);
    const existing = await getOwnedSession(ctx, userId, args.threadId, args.sparkId);
    const runCommand = existing
      ? existing.runCommand
      : assertSafeCommand(args.language, args.runCommand);
    const testCommand = existing
      ? existing.testCommand
      : assertSafeCommand(args.language, args.testCommand);
    const providerConfig = getCodeSparkProviderConfig();
    const provider =
      args.provider === "unavailable" ? providerConfig.provider : args.provider;
    const providerStatus =
      provider === "vercel_sandbox"
        ? "configured"
        : provider === "local_fake"
          ? "test_only"
          : "unavailable";

    const sessionId =
      existing?._id ??
      (await ctx.db.insert("codeSparkSessions", {
        userId,
        threadId: args.threadId,
        messageId: args.messageId,
        sparkId: args.sparkId,
        title: args.title,
        mode: args.mode,
        language: args.language,
        provider,
        providerStatus,
        status: provider === "unavailable" ? "unavailable" : "ready",
        activePath,
        runCommand,
        testCommand,
        version: 1,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
      }));

    if (existing) {
      await ctx.db.patch(existing._id, {
        title: args.title,
        mode: args.mode,
        provider,
        providerStatus,
        status: provider === "unavailable" ? "unavailable" : "ready",
        activePath,
        updatedAt: now,
        lastAccessedAt: now,
      });
    }

    const session = existing
      ? { ...existing, _id: sessionId, version: existing.version }
      : await ctx.db.get(sessionId);
    const version = session?.version ?? 1;

    for (const file of args.files) {
      const safePath = assertSafePath(file.path);
      const existingFile = await ctx.db
        .query("codeSparkFiles")
        .withIndex("by_sessionId_and_path", (q) =>
          q.eq("sessionId", sessionId).eq("path", safePath),
        )
        .unique();
      if (existingFile) {
        continue;
      }
      if (existing && file.role === "test") {
        continue;
      }
      const nextFile = {
        sessionId,
        path: safePath,
        language: file.language,
        contents: file.contents,
        version,
        hash: textHash(file.contents),
        editable: file.editable,
        role: file.role,
        updatedAt: now,
      };
      await ctx.db.insert("codeSparkFiles", nextFile);
    }

    if (!existing) {
      for (const check of args.tests) {
        const safeCommand = assertSafeCommand(args.language, check.command);
        const nextCheck = {
          sessionId,
          checkId: check.id,
          label: check.label,
          command: safeCommand,
          hidden: false,
          createdAt: now,
          updatedAt: now,
        };
        await ctx.db.insert("codeSparkChecks", nextCheck);
      }
    }

    return { sessionId, version };
  },
});

export const getSessionForSpark = query({
  args: {
    threadId: v.string(),
    sparkId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      sessionId: v.id("codeSparkSessions"),
      threadId: v.string(),
      messageId: v.optional(v.string()),
      sparkId: v.string(),
      title: v.string(),
      mode: modeValidator,
      language: languageValidator,
      provider: providerValidator,
      providerStatus: providerStatusValidator,
      providerSessionId: v.optional(v.string()),
      status: v.string(),
      activePath: v.string(),
      version: v.number(),
      hiddenTestCount: v.number(),
      files: v.array(fileInputValidator),
      lastRun: v.optional(
        v.object({
          kind: v.string(),
          provider: providerValidator,
          status: runStatusValidator,
          command: v.optional(v.string()),
          stdout: v.optional(v.string()),
          stderr: v.optional(v.string()),
          exitCode: v.optional(v.number()),
          durationMs: v.optional(v.number()),
          timedOut: v.boolean(),
          createdAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await assertViewerOwnsThread(ctx, args.threadId);
    const session = await getOwnedSession(ctx, userId, args.threadId, args.sparkId);
    if (!session) {
      return null;
    }
    const files = await ctx.db
      .query("codeSparkFiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    const visibleFiles = files.map((file) => ({
      path: file.path,
      language: file.language,
      contents: file.contents,
      editable: file.editable,
      role: file.role,
      }));
    const [lastRun] = await ctx.db
      .query("codeSparkRuns")
      .withIndex("by_sessionId_and_createdAt", (q) =>
        q.eq("sessionId", session._id),
      )
      .order("desc")
      .take(1);

    return {
      sessionId: session._id,
      threadId: session.threadId,
      messageId: session.messageId,
      sparkId: session.sparkId,
      title: session.title,
      mode: session.mode,
      language: session.language,
      provider: session.provider,
      providerStatus: session.providerStatus,
      providerSessionId: session.providerSessionId,
      status: session.status,
      activePath: session.activePath,
      version: session.version,
      hiddenTestCount: 0,
      files: visibleFiles,
      lastRun: lastRun
        ? {
            kind: lastRun.kind,
            provider: lastRun.provider,
            status: lastRun.status,
            command: lastRun.command,
            stdout: lastRun.stdout,
            stderr: lastRun.stderr,
            exitCode: lastRun.exitCode,
            durationMs: lastRun.durationMs,
            timedOut: lastRun.timedOut,
            createdAt: lastRun.createdAt,
          }
        : undefined,
    };
  },
});

export const getRuntimeSessionForSparkInternal = internalQuery({
  args: {
    userId: v.string(),
    threadId: v.string(),
    sparkId: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      sessionId: v.id("codeSparkSessions"),
      threadId: v.string(),
      sparkId: v.string(),
      language: languageValidator,
      providerSessionId: v.optional(v.string()),
      runCommand: v.string(),
      testCommand: v.string(),
      files: v.array(fileInputValidator),
      checks: v.array(testInputValidator),
      recentRunCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.chat.assertThreadOwner, {
      userId: args.userId,
      threadId: args.threadId,
    });
    const session = await getOwnedSession(ctx, args.userId, args.threadId, args.sparkId);
    if (!session) {
      return null;
    }
    const files = await ctx.db
      .query("codeSparkFiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    const checks = await ctx.db
      .query("codeSparkChecks")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    const recentRuns = await ctx.db
      .query("codeSparkRuns")
      .withIndex("by_sessionId_and_createdAt", (q) =>
        q.eq("sessionId", session._id),
      )
      .order("desc")
      .take(maxRunsPerCooldownWindow);
    const recentRunCount = recentRuns.filter(
      (run) => run.createdAt >= Date.now() - runCooldownWindowMs,
    ).length;

    return {
      sessionId: session._id,
      threadId: session.threadId,
      sparkId: session.sparkId,
      language: session.language,
      providerSessionId: session.providerSessionId,
      runCommand: session.runCommand,
      testCommand: session.testCommand,
      files: files
        .filter((file) => file.role !== "hidden_test")
        .map((file) => ({
          path: file.path,
          language: file.language,
          contents: file.contents,
          editable: file.editable,
          role: file.role,
        })),
      checks: checks
        .filter((check) => !check.hidden)
        .map((check) => ({
          id: check.checkId,
          label: check.label,
          command: check.command,
          hidden: false,
        })),
      recentRunCount,
    };
  },
});

export const writeFile = mutation({
  args: {
    threadId: v.string(),
    sparkId: v.string(),
    path: v.string(),
    contents: v.string(),
  },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    const userId = await assertViewerOwnsThread(ctx, args.threadId);
    const session = await getOwnedSession(ctx, userId, args.threadId, args.sparkId);
    if (!session) {
      throw new Error("Code Spark session not found");
    }
    const path = assertSafePath(args.path);
    const file = await ctx.db
      .query("codeSparkFiles")
      .withIndex("by_sessionId_and_path", (q) =>
        q.eq("sessionId", session._id).eq("path", path),
      )
      .unique();
    if (!file || !file.editable || file.role === "hidden_test") {
      throw new Error("Code Spark file is not editable");
    }

    const version = session.version + 1;
    const now = Date.now();
    await ctx.db.patch(file._id, {
      contents: args.contents,
      version,
      hash: textHash(args.contents),
      updatedAt: now,
    });
    await ctx.db.patch(session._id, {
      version,
      activePath: path,
      updatedAt: now,
      lastAccessedAt: now,
    });
    return { version };
  },
});

export const recordRunResultInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    sparkId: v.string(),
    kind: v.union(v.literal("run"), v.literal("test"), v.literal("preview"), v.literal("inspect")),
    provider: providerValidator,
    status: runStatusValidator,
    command: v.optional(v.string()),
    stdout: v.optional(v.string()),
    stderr: v.optional(v.string()),
    exitCode: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    timedOut: v.boolean(),
    triggeredBy: v.optional(v.union(v.literal("user"), v.literal("agent"))),
  },
  returns: v.object({ runId: v.id("codeSparkRuns") }),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.chat.assertThreadOwner, {
      userId: args.userId,
      threadId: args.threadId,
    });
    const session = await getOwnedSession(ctx, args.userId, args.threadId, args.sparkId);
    if (!session) {
      throw new Error("Code Spark session not found");
    }
    const now = Date.now();
    const runId = await ctx.db.insert("codeSparkRuns", {
      sessionId: session._id,
      version: session.version,
      kind: args.kind,
      provider: args.provider,
      command: args.command,
      status: args.status,
      stdout: args.stdout,
      stderr: args.stderr,
      exitCode: args.exitCode,
      durationMs: args.durationMs,
      timedOut: args.timedOut,
      triggeredBy: args.triggeredBy ?? "user",
      createdAt: now,
    });
    await ctx.db.patch(session._id, {
      status:
        args.status === "unavailable"
          ? "unavailable"
          : args.status === "failed" || args.status === "timed_out"
            ? "failed"
            : "ready",
      updatedAt: now,
      lastAccessedAt: now,
    });
    return { runId };
  },
});
