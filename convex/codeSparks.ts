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
import { assertCodeSparkId } from "../lib/code-sparks/limits";
import {
  isLearnerVisibleCodeSparkFile,
  isPrivateCodeSparkPath,
} from "../lib/sparks/contracts";

const languageValidator = v.union(v.literal("typescript"), v.literal("python"));

const storedLanguageValidator = v.union(
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

const storedFileOutputValidator = v.object({
  path: v.string(),
  language: storedLanguageValidator,
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

const publicTestInputValidator = v.object({
  id: v.string(),
  label: v.string(),
  command: v.optional(v.string()),
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
const maxConcurrentCodeSparkRuns = 3;
// Vercel Sandbox has a two-minute sandbox lifetime. Keep admission reserved for
// five minutes so cleanup cannot release provider work that is still live.
const codeSparkActiveRunLeaseMs = 5 * 60_000;
const codeSparkOperationalRetentionMs = 35 * 24 * 60 * 60 * 1_000;
const codeSparkCleanupBatchSize = 64;
const maxCodeSparkFiles = 8;
const maxCodeSparkChecks = 12;
const maxCodeSparksPerThread = 32;
const maxCodeSparkTitleBytes = 160;
const maxCodeSparkMessageIdBytes = 160;
const maxCodeSparkPathBytes = 180;
const maxCodeSparkFileBytes = 20_000;
const maxCodeSparkAggregateBytes = 64_000;
const maxCodeSparkCheckIdBytes = 120;
const maxCodeSparkCheckLabelBytes = 240;
const maxCodeSparkCommandBytes = 240;

function isRunnableLanguage(
  language: string,
): language is "typescript" | "python" {
  return language === "typescript" || language === "python";
}

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function assertFilePayloadLimits(
  files: Array<{ path: string; contents: string }>,
) {
  if (files.length > maxCodeSparkFiles) {
    throw new Error(`Code Spark supports at most ${maxCodeSparkFiles} files.`);
  }

  let aggregateBytes = 0;
  for (const file of files) {
    if (utf8Bytes(file.path) > maxCodeSparkPathBytes) {
      throw new Error(
        `Code Spark file path exceeds ${maxCodeSparkPathBytes} bytes.`,
      );
    }
    const contentBytes = utf8Bytes(file.contents);
    if (contentBytes > maxCodeSparkFileBytes) {
      throw new Error(
        `Code Spark file exceeds ${maxCodeSparkFileBytes.toLocaleString("en-US")} bytes.`,
      );
    }
    aggregateBytes += contentBytes;
  }

  if (aggregateBytes > maxCodeSparkAggregateBytes) {
    throw new Error(
      `Code Spark aggregate file contents exceed ${maxCodeSparkAggregateBytes.toLocaleString("en-US")} bytes.`,
    );
  }
}

function assertSessionPayloadLimits(args: {
  sparkId: string;
  messageId?: string;
  title: string;
  tests: Array<{ id: string; label: string; command?: string }>;
}) {
  assertCodeSparkId(args.sparkId);
  if (
    typeof args.messageId === "string" &&
    utf8Bytes(args.messageId) > maxCodeSparkMessageIdBytes
  ) {
    throw new Error(
      `Code Spark message id exceeds ${maxCodeSparkMessageIdBytes} bytes.`,
    );
  }
  if (utf8Bytes(args.title) > maxCodeSparkTitleBytes) {
    throw new Error(
      `Code Spark title exceeds ${maxCodeSparkTitleBytes} bytes.`,
    );
  }
  if (args.tests.length > maxCodeSparkChecks) {
    throw new Error(`Code Spark supports at most ${maxCodeSparkChecks} checks.`);
  }
  for (const test of args.tests) {
    if (utf8Bytes(test.id) > maxCodeSparkCheckIdBytes) {
      throw new Error(
        `Code Spark check id exceeds ${maxCodeSparkCheckIdBytes} bytes.`,
      );
    }
    if (utf8Bytes(test.label) > maxCodeSparkCheckLabelBytes) {
      throw new Error(
        `Code Spark check label exceeds ${maxCodeSparkCheckLabelBytes} bytes.`,
      );
    }
    if (
      typeof test.command === "string" &&
      utf8Bytes(test.command) > maxCodeSparkCommandBytes
    ) {
      throw new Error(
        `Code Spark check command exceeds ${maxCodeSparkCommandBytes} bytes.`,
      );
    }
  }
}

function challengeRunResultText(
  status:
    | "queued"
    | "running"
    | "passed"
    | "failed"
    | "timed_out"
    | "unavailable",
) {
  if (status === "passed") return "Program finished.";
  if (status === "timed_out") return "Program timed out.";
  if (status === "unavailable") {
    return "Code runner unavailable. Try again in a moment.";
  }
  if (status === "queued" || status === "running") {
    return "Program is still running.";
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

function projectLearnerProgramOutput(value: string | undefined) {
  return value?.replace(/^local_fake:\s*/gm, "");
}

function projectChallengeRun(
  run: {
    kind: string;
    status:
      | "queued"
      | "running"
      | "passed"
      | "failed"
      | "timed_out"
      | "unavailable";
    command?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    durationMs?: number;
    timedOut?: boolean;
  },
  language: string,
) {
  if (
    run.kind === "run" &&
    typeof run.command === "string" &&
    isSafeLearnerRunCommand(language, run.command) &&
    run.status !== "unavailable"
  ) {
    return {
      stdout: projectLearnerProgramOutput(run.stdout),
      stderr: projectLearnerProgramOutput(run.stderr),
      exitCode: run.exitCode,
      durationMs: run.durationMs,
      timedOut: run.timedOut,
      reason: challengeRunResultText(run.status),
    };
  }
  if (run.status === "passed") {
    return { reason: "Check passed." };
  }
  if (run.status === "timed_out") {
    const reason = "Check timed out. Try a smaller change.";
    return { reason };
  }
  if (run.status === "unavailable") {
    const reason = "Code runner unavailable. Try again in a moment.";
    return { reason };
  }
  if (run.status === "queued" || run.status === "running") {
    return { reason: "Check is still running." };
  }
  const reason = "Check failed. Review your code and try again.";
  return { reason };
}

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

function assertPublicFileInputs(args: {
  mode: "workspace" | "challenge";
  files: Array<{
    path: string;
    editable: boolean;
    role: "starter" | "solution" | "test" | "hidden_test" | "config" | "readme";
  }>;
}) {
  for (const file of args.files) {
    if (
      file.role === "solution" ||
      file.role === "hidden_test" ||
      isPrivateCodeSparkPath(file.path, args.mode) ||
      (args.mode === "challenge" && !isLearnerVisibleCodeSparkFile(file))
    ) {
      throw new Error("Public Code Spark writes cannot create private files.");
    }
  }
}

function canPubliclyEditStoredFile(
  mode: "workspace" | "challenge",
  file: {
    path: string;
    editable: boolean;
    role: "starter" | "solution" | "test" | "hidden_test" | "config" | "readme";
    language: string;
  },
) {
  if (
    !file.editable ||
    file.role === "solution" ||
    file.role === "hidden_test" ||
    isPrivateCodeSparkPath(file.path, mode) ||
    !isRunnableLanguage(file.language)
  ) {
    return false;
  }
  return mode === "workspace" || isLearnerVisibleCodeSparkFile(file);
}

function providerStatusForProvider(provider: string) {
  if (provider === "vercel_sandbox") {
    return "configured" as const;
  }
  if (provider === "local_fake") {
    return "test_only" as const;
  }
  return "unavailable" as const;
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

type SessionArtifactInput = {
  threadId: string;
  messageId?: string;
  sparkId: string;
  title: string;
  mode: "workspace" | "challenge";
  language: "typescript" | "python";
  provider: "vercel_sandbox" | "daytona" | "e2b" | "local_fake" | "unavailable";
  providerStatus: "configured" | "unconfigured" | "unavailable" | "test_only";
  activePath: string;
  runCommand?: string;
  testCommand?: string;
  files: Array<{
    path: string;
    language: "typescript" | "python";
    contents: string;
    editable: boolean;
    role: "starter" | "solution" | "test" | "hidden_test" | "config" | "readme";
  }>;
  tests: Array<{
    id: string;
    label: string;
    command?: string;
    hidden: boolean;
  }>;
};

async function upsertSessionForUser(
  ctx: MutationCtx,
  userId: string,
  args: SessionArtifactInput,
  authority: "public" | "server",
) {
  const now = Date.now();
  assertVisibleOnlyInputs(args);
  assertSessionPayloadLimits(args);
  if (authority === "public") {
    assertPublicFileInputs(args);
  }
  assertFilePayloadLimits(args.files);
  const activePath = assertSafePath(args.activePath);
  const existing = await getOwnedSession(
    ctx,
    userId,
    args.threadId,
    args.sparkId,
  );

  if (!existing) {
    const threadSessions = await ctx.db
      .query("codeSparkSessions")
      .withIndex("by_userId_and_threadId", (q) =>
        q.eq("userId", userId).eq("threadId", args.threadId),
      )
      .take(maxCodeSparksPerThread);
    if (threadSessions.length >= maxCodeSparksPerThread) {
      throw new Error(
        `Code Spark supports at most ${maxCodeSparksPerThread} Code Sparks per thread.`,
      );
    }
  }

  if (existing) {
    let nextActivePath = existing.activePath;
    if (authority === "public" && activePath !== existing.activePath) {
      const requestedFile = await ctx.db
        .query("codeSparkFiles")
        .withIndex("by_sessionId_and_path", (q) =>
          q.eq("sessionId", existing._id).eq("path", activePath),
        )
        .unique();
      if (
        requestedFile &&
        canPubliclyEditStoredFile(existing.mode, requestedFile)
      ) {
        nextActivePath = activePath;
      }
    }

    // Public artifact remounts may update presentation-only learner state.
    // Classification, language, commands, provider/runtime state, linkage,
    // files, and checks remain server-owned and immutable here.
    await ctx.db.patch(existing._id, {
      title: args.title,
      activePath: nextActivePath,
      updatedAt: now,
      lastAccessedAt: now,
    });
    return { sessionId: existing._id, version: existing.version };
  }

  const publicActiveFile =
    args.mode === "challenge"
      ? args.files.find(isLearnerVisibleCodeSparkFile)
      : undefined;
  if (args.mode === "challenge" && !publicActiveFile) {
    throw new Error(
      "Challenge Code Spark requires an editable learner-visible file.",
    );
  }
  const persistedActivePath =
    args.mode === "challenge" &&
    !args.files.some(
      (file) => file.path === activePath && isLearnerVisibleCodeSparkFile(file),
    )
      ? publicActiveFile!.path
      : activePath;
  const runCommand = assertSafeCommand(args.language, args.runCommand ?? "");
  const testCommand = assertSafeCommand(args.language, args.testCommand ?? "");
  const providerConfig = getCodeSparkProviderConfig();
  const provider = providerConfig.provider;
  const providerStatus = providerStatusForProvider(provider);

  const sessionId = await ctx.db.insert("codeSparkSessions", {
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
    activePath: persistedActivePath,
    runCommand,
    testCommand,
    version: 1,
    createdAt: now,
    updatedAt: now,
    lastAccessedAt: now,
  });
  const version = 1;

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
    await ctx.db.insert("codeSparkFiles", {
      sessionId,
      path: safePath,
      language: file.language,
      contents: file.contents,
      version,
      hash: textHash(file.contents),
      editable: file.editable,
      role: file.role,
      updatedAt: now,
    });
  }

  for (const check of args.tests) {
    const safeCommand = assertSafeCommand(args.language, check.command ?? "");
    await ctx.db.insert("codeSparkChecks", {
      sessionId,
      checkId: check.id,
      label: check.label,
      command: safeCommand,
      hidden: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { sessionId, version };
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
    runCommand: v.optional(v.string()),
    testCommand: v.optional(v.string()),
    files: v.array(fileInputValidator),
    tests: v.array(publicTestInputValidator),
  },
  returns: v.object({
    sessionId: v.id("codeSparkSessions"),
    version: v.number(),
  }),
  handler: async (ctx, args) => {
    assertCodeSparkId(args.sparkId);
    const userId = await assertViewerOwnsThread(ctx, args.threadId);
    return await upsertSessionForUser(ctx, userId, args, "public");
  },
});

export const persistGeneratedSessionInternal = internalMutation({
  args: {
    userId: v.string(),
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
    await ctx.runQuery(internal.chat.assertThreadOwner, {
      userId: args.userId,
      threadId: args.threadId,
    });
    return await upsertSessionForUser(ctx, args.userId, args, "server");
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
      sessionId: v.optional(v.id("codeSparkSessions")),
      threadId: v.optional(v.string()),
      messageId: v.optional(v.string()),
      sparkId: v.optional(v.string()),
      title: v.string(),
      mode: modeValidator,
      language: storedLanguageValidator,
      provider: providerValidator,
      providerStatus: providerStatusValidator,
      providerSessionId: v.optional(v.string()),
      status: v.string(),
      activePath: v.string(),
      runCommand: v.optional(v.string()),
      testCommand: v.optional(v.string()),
      version: v.number(),
      hiddenTestCount: v.number(),
      files: v.array(storedFileOutputValidator),
      tests: v.array(publicTestInputValidator),
      lastRun: v.optional(
        v.object({
          kind: v.string(),
          provider: v.optional(providerValidator),
          status: runStatusValidator,
          command: v.optional(v.string()),
          stdout: v.optional(v.string()),
          stderr: v.optional(v.string()),
          exitCode: v.optional(v.number()),
          durationMs: v.optional(v.number()),
          timedOut: v.optional(v.boolean()),
          reason: v.optional(v.string()),
          createdAt: v.optional(v.number()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    assertCodeSparkId(args.sparkId);
    const userId = await assertViewerOwnsThread(ctx, args.threadId);
    const session = await getOwnedSession(
      ctx,
      userId,
      args.threadId,
      args.sparkId,
    );
    if (!session) {
      return null;
    }
    const files = await ctx.db
      .query("codeSparkFiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    const isChallenge = session.mode === "challenge";
    const visibleFiles = files
      .filter((file) =>
        isChallenge
          ? isLearnerVisibleCodeSparkFile(file)
          : file.role !== "hidden_test",
      )
      .map((file) => ({
        path: file.path,
        language: file.language,
        contents: file.contents,
        editable: file.editable,
        role: file.role,
      }));
    if (isChallenge && visibleFiles.length === 0) {
      return null;
    }
    const publicActivePath = visibleFiles.some(
      (file) => file.path === session.activePath,
    )
      ? session.activePath
      : visibleFiles[0]!.path;
    const checks = await ctx.db
      .query("codeSparkChecks")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    const visibleChecks = checks
      .filter((check) => !check.hidden)
      .map((check) =>
        isChallenge
          ? {
              id: check.checkId,
              label: check.label,
              hidden: false as const,
            }
          : {
              id: check.checkId,
              label: check.label,
              command: check.command,
              hidden: false as const,
            },
      );
    const [lastRun] = await ctx.db
      .query("codeSparkRuns")
      .withIndex("by_sessionId_and_createdAt", (q) =>
        q.eq("sessionId", session._id),
      )
      .order("desc")
      .take(1);

    return {
      sessionId: isChallenge ? undefined : session._id,
      threadId: isChallenge ? undefined : session.threadId,
      messageId: isChallenge ? undefined : session.messageId,
      sparkId: isChallenge ? undefined : session.sparkId,
      title: session.title,
      mode: session.mode,
      language: session.language,
      provider: session.provider,
      providerStatus: session.providerStatus,
      providerSessionId: isChallenge ? undefined : session.providerSessionId,
      status: session.status,
      activePath: publicActivePath,
      runCommand: isChallenge ? undefined : session.runCommand,
      testCommand: isChallenge ? undefined : session.testCommand,
      version: session.version,
      // Legacy renderer compatibility only; Code Spark generates and reports
      // visible checks and never advertises a concealed-check count.
      hiddenTestCount: 0,
      files: visibleFiles,
      tests: visibleChecks,
      lastRun: lastRun
        ? isChallenge
          ? {
              kind: lastRun.kind,
              provider: lastRun.provider,
              status: lastRun.status,
              ...projectChallengeRun(lastRun, session.language),
            }
          : {
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
    const session = await getOwnedSession(
      ctx,
      args.userId,
      args.threadId,
      args.sparkId,
    );
    if (!session) {
      return null;
    }
    if (!isRunnableLanguage(session.language)) {
      throw new Error(
        `Historical Code Spark language ${session.language} is read-only and cannot run.`,
      );
    }
    const files = await ctx.db
      .query("codeSparkFiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    if (files.some((file) => !isRunnableLanguage(file.language))) {
      throw new Error(
        "Historical Code Spark files are read-only and cannot run.",
      );
    }
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
          language: file.language as "typescript" | "python",
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

async function cleanupOperationalData(ctx: MutationCtx, cleanupNow: number) {
  const retentionCutoff = cleanupNow - codeSparkOperationalRetentionMs;
  const expiredReservations = await ctx.db
    .query("codeSparkRunReservations")
    .withIndex("by_status_and_expiresAt", (q) =>
      q.eq("status", "reserved").lte("expiresAt", cleanupNow),
    )
    .take(codeSparkCleanupBatchSize);
  for (const reservation of expiredReservations) {
    await ctx.db.patch(reservation._id, {
      status: "released",
      finalizedAt: cleanupNow,
    });
  }

  const expiredUsage = await ctx.db
    .query("codeSparkUsage")
    .withIndex("by_createdAt", (q) => q.lte("createdAt", retentionCutoff))
    .take(codeSparkCleanupBatchSize);
  for (const usage of expiredUsage) {
    await ctx.db.delete(usage._id);
  }

  const expiredRuns = await ctx.db
    .query("codeSparkRuns")
    .withIndex("by_createdAt", (q) => q.lte("createdAt", retentionCutoff))
    .take(codeSparkCleanupBatchSize);
  for (const run of expiredRuns) {
    await ctx.db.delete(run._id);
  }

  const reservationCandidates = await ctx.db
    .query("codeSparkRunReservations")
    .withIndex("by_createdAt", (q) => q.lte("createdAt", retentionCutoff))
    .take(codeSparkCleanupBatchSize);
  let deletedReservations = 0;
  for (const reservation of reservationCandidates) {
    const retainedUsage = await ctx.db
      .query("codeSparkUsage")
      .withIndex("by_reservationId", (q) =>
        q.eq("reservationId", reservation._id),
      )
      .unique();
    if (!retainedUsage) {
      await ctx.db.delete(reservation._id);
      deletedReservations += 1;
    }
  }

  const [moreExpired, moreUsage, moreRuns] = await Promise.all([
    ctx.db
      .query("codeSparkRunReservations")
      .withIndex("by_status_and_expiresAt", (q) =>
        q.eq("status", "reserved").lte("expiresAt", cleanupNow),
      )
      .first(),
    ctx.db
      .query("codeSparkUsage")
      .withIndex("by_createdAt", (q) => q.lte("createdAt", retentionCutoff))
      .first(),
    ctx.db
      .query("codeSparkRuns")
      .withIndex("by_createdAt", (q) => q.lte("createdAt", retentionCutoff))
      .first(),
  ]);

  return {
    reconciledReservations: expiredReservations.length,
    deletedRuns: expiredRuns.length,
    deletedUsage: expiredUsage.length,
    deletedReservations,
    hasMore: Boolean(
      moreExpired ||
      moreUsage ||
      moreRuns ||
      (reservationCandidates.length === codeSparkCleanupBatchSize &&
        deletedReservations > 0),
    ),
  };
}

export const cleanupOperationalDataInternal = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({
    reconciledReservations: v.number(),
    deletedRuns: v.number(),
    deletedUsage: v.number(),
    deletedReservations: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const result = await cleanupOperationalData(ctx, args.now ?? Date.now());
    if (result.hasMore) {
      await ctx.scheduler.runAfter(
        0,
        internal.codeSparks.cleanupOperationalDataInternal,
        {},
      );
    }
    return result;
  },
});

export const reserveRunInternal = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    sparkId: v.string(),
    monthlyRunLimit: v.optional(v.number()),
    billingPeriodStart: v.optional(v.number()),
    billingPeriodEnd: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      allowed: v.literal(false),
      mode: modeValidator,
      provider: providerValidator,
      limit: v.union(
        v.literal("active"),
        v.literal("start_rate"),
        v.literal("monthly"),
      ),
      retryAfterMs: v.number(),
      cooldownUntil: v.number(),
    }),
    v.object({
      allowed: v.literal(true),
      reservationId: v.id("codeSparkRunReservations"),
      session: v.object({
        sessionId: v.id("codeSparkSessions"),
        threadId: v.string(),
        sparkId: v.string(),
        mode: modeValidator,
        language: languageValidator,
        provider: providerValidator,
        providerSessionId: v.optional(v.string()),
        runCommand: v.string(),
        testCommand: v.string(),
        files: v.array(fileInputValidator),
        checks: v.array(testInputValidator),
      }),
    }),
  ),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.chat.assertThreadOwner, {
      userId: args.userId,
      threadId: args.threadId,
    });
    const session = await getOwnedSession(
      ctx,
      args.userId,
      args.threadId,
      args.sparkId,
    );
    if (!session) {
      throw new Error("Code Spark session not found");
    }
    if (!isRunnableLanguage(session.language)) {
      throw new Error(
        `Historical Code Spark language ${session.language} is read-only and cannot run.`,
      );
    }

    const files = await ctx.db
      .query("codeSparkFiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    if (files.some((file) => !isRunnableLanguage(file.language))) {
      throw new Error(
        "Historical Code Spark files are read-only and cannot run.",
      );
    }
    assertFilePayloadLimits(files);
    const checks = await ctx.db
      .query("codeSparkChecks")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .collect();

    const now = Date.now();
    const hasMonthlyEntitlement =
      args.monthlyRunLimit !== undefined ||
      args.billingPeriodStart !== undefined ||
      args.billingPeriodEnd !== undefined;
    if (
      hasMonthlyEntitlement &&
      (!Number.isInteger(args.monthlyRunLimit) ||
        (args.monthlyRunLimit ?? 0) <= 0 ||
        !Number.isFinite(args.billingPeriodStart) ||
        !Number.isFinite(args.billingPeriodEnd) ||
        (args.billingPeriodStart ?? 0) > now ||
        (args.billingPeriodEnd ?? 0) <= now ||
        (args.billingPeriodEnd ?? 0) <= (args.billingPeriodStart ?? 0))
    ) {
      throw new Error("Invalid Code Spark monthly run entitlement");
    }
    const cleanup = await cleanupOperationalData(ctx, now);
    if (cleanup.hasMore) {
      await ctx.scheduler.runAfter(
        0,
        internal.codeSparks.cleanupOperationalDataInternal,
        {},
      );
    }
    const activeReservations = await ctx.db
      .query("codeSparkRunReservations")
      .withIndex("by_userId_status_expiresAt", (q) =>
        q
          .eq("userId", args.userId)
          .eq("status", "reserved")
          .gt("expiresAt", now),
      )
      .order("asc")
      .take(maxConcurrentCodeSparkRuns);
    if (activeReservations.length >= maxConcurrentCodeSparkRuns) {
      const cooldownUntil = Math.max(now + 1, activeReservations[0]!.expiresAt);
      return {
        allowed: false as const,
        mode: session.mode,
        provider: session.provider,
        limit: "active" as const,
        retryAfterMs: cooldownUntil - now,
        cooldownUntil,
      };
    }
    const recentReservations = await ctx.db
      .query("codeSparkRunReservations")
      .withIndex("by_userId_and_createdAt", (q) =>
        q.eq("userId", args.userId).gte("createdAt", now - runCooldownWindowMs),
      )
      .order("asc")
      .take(maxRunsPerCooldownWindow);
    if (recentReservations.length >= maxRunsPerCooldownWindow) {
      const cooldownUntil = Math.max(
        now + 1,
        recentReservations[0]!.createdAt + runCooldownWindowMs,
      );
      return {
        allowed: false as const,
        mode: session.mode,
        provider: session.provider,
        limit: "start_rate" as const,
        retryAfterMs: cooldownUntil - now,
        cooldownUntil,
      };
    }

    if (hasMonthlyEntitlement) {
      const completedReservations = await ctx.db
        .query("codeSparkRunReservations")
        .withIndex("by_userId_status_and_createdAt", (q) =>
          q
            .eq("userId", args.userId)
            .eq("status", "completed")
            .gte("createdAt", args.billingPeriodStart!)
            .lt("createdAt", args.billingPeriodEnd!),
        )
        .take(args.monthlyRunLimit!);
      const remainingAllowance = Math.max(
        0,
        args.monthlyRunLimit! - completedReservations.length,
      );
      const activeMonthlyReservations =
        remainingAllowance === 0
          ? []
          : await ctx.db
              .query("codeSparkRunReservations")
              .withIndex("by_userId_status_and_createdAt", (q) =>
                q
                  .eq("userId", args.userId)
                  .eq("status", "reserved")
                  .gte("createdAt", args.billingPeriodStart!)
                  .lt("createdAt", args.billingPeriodEnd!),
              )
              .take(remainingAllowance);
      if (
        completedReservations.length + activeMonthlyReservations.length >=
        args.monthlyRunLimit!
      ) {
        return {
          allowed: false as const,
          mode: session.mode,
          provider: session.provider,
          limit: "monthly" as const,
          retryAfterMs: args.billingPeriodEnd! - now,
          cooldownUntil: args.billingPeriodEnd!,
        };
      }
    }

    const reservationId = await ctx.db.insert("codeSparkRunReservations", {
      userId: args.userId,
      threadId: args.threadId,
      sparkId: args.sparkId,
      sessionId: session._id,
      status: "reserved",
      createdAt: now,
      expiresAt: now + codeSparkActiveRunLeaseMs,
    });

    return {
      allowed: true as const,
      reservationId,
      session: {
        sessionId: session._id,
        threadId: session.threadId,
        sparkId: session.sparkId,
        mode: session.mode,
        language: session.language,
        provider: session.provider,
        providerSessionId: session.providerSessionId,
        runCommand: session.runCommand,
        testCommand: session.testCommand,
        files: files
          .filter((file) => file.role !== "hidden_test")
          .map((file) => ({
            path: file.path,
            language: file.language as "typescript" | "python",
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
      },
    };
  },
});

export const finalizeRunReservationInternal = internalMutation({
  args: {
    userId: v.string(),
    reservationId: v.id("codeSparkRunReservations"),
    completed: v.boolean(),
    provider: providerValidator,
    status: v.union(
      v.literal("passed"),
      v.literal("failed"),
      v.literal("timed_out"),
      v.literal("unavailable"),
    ),
    durationMs: v.number(),
    timedOut: v.boolean(),
  },
  returns: v.object({ finalized: v.boolean() }),
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation || reservation.userId !== args.userId) {
      throw new Error("Code Spark run reservation not found");
    }
    if (reservation.finalizedAt !== undefined) {
      return { finalized: false };
    }

    const now = Date.now();
    await ctx.db.patch(reservation._id, {
      status: args.completed ? "completed" : "released",
      finalizedAt: now,
    });
    const existingUsage = await ctx.db
      .query("codeSparkUsage")
      .withIndex("by_reservationId", (q) =>
        q.eq("reservationId", reservation._id),
      )
      .unique();
    if (!existingUsage) {
      // Operational observability only. This record neither grants execution
      // entitlement nor participates in learner billing or pricing.
      await ctx.db.insert("codeSparkUsage", {
        userId: reservation.userId,
        threadId: reservation.threadId,
        sparkId: reservation.sparkId,
        sessionId: reservation.sessionId,
        reservationId: reservation._id,
        provider: args.provider,
        status: args.status,
        durationMs: Math.max(0, args.durationMs),
        timedOut: args.timedOut,
        createdAt: now,
      });
    }
    return { finalized: true };
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
    assertCodeSparkId(args.sparkId);
    const userId = await assertViewerOwnsThread(ctx, args.threadId);
    const session = await getOwnedSession(
      ctx,
      userId,
      args.threadId,
      args.sparkId,
    );
    if (!session) {
      throw new Error("Code Spark session not found");
    }
    if (!isRunnableLanguage(session.language)) {
      throw new Error("Historical Code Spark sessions are read-only.");
    }
    const path = assertSafePath(args.path);
    const file = await ctx.db
      .query("codeSparkFiles")
      .withIndex("by_sessionId_and_path", (q) =>
        q.eq("sessionId", session._id).eq("path", path),
      )
      .unique();
    if (!file || !canPubliclyEditStoredFile(session.mode, file)) {
      throw new Error("Code Spark file is not editable");
    }

    const files = await ctx.db
      .query("codeSparkFiles")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    assertFilePayloadLimits(
      files.map((persistedFile) => ({
        path: persistedFile.path,
        contents:
          persistedFile._id === file._id
            ? args.contents
            : persistedFile.contents,
      })),
    );

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
    kind: v.union(
      v.literal("run"),
      v.literal("test"),
      v.literal("preview"),
      v.literal("inspect"),
    ),
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
    const session = await getOwnedSession(
      ctx,
      args.userId,
      args.threadId,
      args.sparkId,
    );
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
