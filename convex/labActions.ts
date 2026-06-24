"use node";

import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { createDaytonaLabRuntimeProvider } from "./labs/daytonaProvider";
import type { LabLanguage, LabRuntimeProvider } from "../lib/labs/runtime";
import { normalizeLabPath } from "../lib/labs/runtime";

const internalApi = internal as unknown as {
  billing: {
    assertCanUseLabsInternal: FunctionReference<"mutation", "internal">;
  };
  labs: {
    createLabSessionInternal: FunctionReference<"mutation", "internal">;
    patchLabSessionRuntimeInternal: FunctionReference<"mutation", "internal">;
    recordLabErrorInternal: FunctionReference<"mutation", "internal">;
    archiveLabSessionInternal: FunctionReference<"mutation", "internal">;
    getLabSessionForUserInternal: FunctionReference<"query", "internal">;
  };
  telemetry: {
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

const labLanguageValidator = v.union(
  v.literal("python"),
  v.literal("javascript"),
  v.literal("typescript"),
);

const fileEntryValidator = v.object({
  path: v.string(),
  name: v.string(),
  type: v.union(v.literal("file"), v.literal("directory")),
  size: v.optional(v.number()),
  modifiedAt: v.optional(v.number()),
});

const commandResultValidator = v.object({
  command: v.string(),
  cwd: v.optional(v.string()),
  exitCode: v.optional(v.number()),
  stdout: v.optional(v.string()),
  stderr: v.optional(v.string()),
  output: v.optional(v.string()),
});

const sessionCommandResultValidator = v.object({
  command: v.string(),
  commandId: v.optional(v.string()),
  cwd: v.optional(v.string()),
  exitCode: v.optional(v.number()),
  stdout: v.optional(v.string()),
  stderr: v.optional(v.string()),
  output: v.optional(v.string()),
});

const searchMatchValidator = v.object({
  path: v.string(),
  line: v.optional(v.number()),
  content: v.optional(v.string()),
});

const previewValidator = v.object({
  port: v.number(),
  url: v.string(),
  token: v.optional(v.string()),
});

const labSessionActionValidator = v.object({
  _id: v.id("labSessions"),
  _creationTime: v.number(),
  userId: v.string(),
  threadId: v.string(),
  title: v.optional(v.string()),
  provider: v.literal("daytona"),
  sandboxId: v.string(),
  workspacePath: v.string(),
  language: v.optional(labLanguageValidator),
  status: v.union(
    v.literal("starting"),
    v.literal("ready"),
    v.literal("error"),
    v.literal("archived"),
  ),
  previewUrls: v.optional(v.array(previewValidator)),
  lastError: v.optional(
    v.object({
      message: v.string(),
      category: v.optional(v.string()),
      retriable: v.optional(v.boolean()),
      occurredAt: v.number(),
    }),
  ),
  lastActiveAt: v.number(),
  archivedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

let runtimeProvider: LabRuntimeProvider | null = null;

function getRuntimeProvider() {
  runtimeProvider ??= createDaytonaLabRuntimeProvider();
  return runtimeProvider;
}

function toMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error);
}

function classifyProviderError(error: unknown) {
  const message = toMessage(error).toLowerCase();
  if (message.includes("timeout")) return "timeout";
  if (message.includes("rate")) return "rate_limit";
  if (message.includes("auth")) return "auth";
  if (message.includes("not found")) return "not_found";
  return "provider_error";
}

async function requireAuthenticatedUserId(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  return identity.subject;
}

async function recordLabTelemetry(
  ctx: ActionCtx,
  args: {
    userId: string;
    threadId: string;
    name: string;
    status: "success" | "failed";
    startedAt: number;
    error?: unknown;
    metadata?: Record<string, unknown>;
  },
) {
  await ctx
    .runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
      userId: args.userId,
      threadId: args.threadId,
      source: "lab",
      name: args.name,
      status: args.status,
      durationMs: Date.now() - args.startedAt,
      errorCategory: args.error ? classifyProviderError(args.error) : undefined,
      retriable: args.error ? true : undefined,
      metadata: {
        ...args.metadata,
        error: args.error ? toMessage(args.error).slice(0, 500) : undefined,
      },
    })
    .catch((telemetryError) => {
      console.error("Failed to store lab telemetry", telemetryError);
    });
}

async function getOwnedSession(
  ctx: ActionCtx,
  userId: string,
  labSessionId: Id<"labSessions">,
) {
  return await ctx.runQuery(internalApi.labs.getLabSessionForUserInternal, {
    userId,
    labSessionId,
  });
}

async function recordSessionError(
  ctx: ActionCtx,
  userId: string,
  labSessionId: Id<"labSessions">,
  error: unknown,
) {
  await ctx.runMutation(internalApi.labs.recordLabErrorInternal, {
    userId,
    labSessionId,
    message: toMessage(error),
    category: classifyProviderError(error),
    retriable: true,
  });
}

export const createLab = action({
  args: {
    threadId: v.string(),
    title: v.optional(v.string()),
    language: v.optional(labLanguageValidator),
  },
  returns: labSessionActionValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const startedAt = Date.now();
    await ctx.runMutation(internalApi.billing.assertCanUseLabsInternal, {
      userId,
    });

    try {
      const runtimeSession = await getRuntimeProvider().create({
        title: args.title,
        language: args.language as LabLanguage | undefined,
        labels: {
          threadId: args.threadId,
          userId,
        },
      });
      const session = await ctx.runMutation(
        internalApi.labs.createLabSessionInternal,
        {
          userId,
          threadId: args.threadId,
          title: args.title,
          provider: runtimeSession.provider,
          sandboxId: runtimeSession.sandboxId,
          workspacePath: runtimeSession.workspacePath,
          language: args.language,
          status: runtimeSession.status,
          previewUrls: runtimeSession.previewUrls,
        },
      );

      await recordLabTelemetry(ctx, {
        userId,
        threadId: args.threadId,
        name: "create_lab",
        status: "success",
        startedAt,
        metadata: { labSessionId: session._id, provider: session.provider },
      });
      return session;
    } catch (error) {
      await recordLabTelemetry(ctx, {
        userId,
        threadId: args.threadId,
        name: "create_lab",
        status: "failed",
        startedAt,
        error,
      });
      throw error;
    }
  },
});

export const resumeLab = action({
  args: {
    labSessionId: v.id("labSessions"),
  },
  returns: labSessionActionValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    const startedAt = Date.now();

    try {
      const runtimeSession = await getRuntimeProvider().resume({
        sandboxId: session.sandboxId,
      });
      const updated = await ctx.runMutation(
        internalApi.labs.patchLabSessionRuntimeInternal,
        {
          userId,
          labSessionId: args.labSessionId,
          workspacePath: runtimeSession.workspacePath,
          status: runtimeSession.status,
          clearError: true,
        },
      );
      await recordLabTelemetry(ctx, {
        userId,
        threadId: session.threadId,
        name: "resume_lab",
        status: "success",
        startedAt,
        metadata: { labSessionId: session._id },
      });
      return updated;
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      await recordLabTelemetry(ctx, {
        userId,
        threadId: session.threadId,
        name: "resume_lab",
        status: "failed",
        startedAt,
        error,
      });
      throw error;
    }
  },
});

export const listFiles = action({
  args: {
    labSessionId: v.id("labSessions"),
    path: v.optional(v.string()),
  },
  returns: v.array(fileEntryValidator),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    try {
      return await getRuntimeProvider().list({
        sandboxId: session.sandboxId,
        path: normalizeLabPath(args.path),
      });
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      throw error;
    }
  },
});

export const readFile = action({
  args: {
    labSessionId: v.id("labSessions"),
    path: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    try {
      return await getRuntimeProvider().read({
        sandboxId: session.sandboxId,
        path: normalizeLabPath(args.path),
      });
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      throw error;
    }
  },
});

export const writeFile = action({
  args: {
    labSessionId: v.id("labSessions"),
    path: v.string(),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    try {
      await getRuntimeProvider().write({
        sandboxId: session.sandboxId,
        path: normalizeLabPath(args.path),
        content: args.content,
      });
      await ctx.runMutation(internalApi.labs.patchLabSessionRuntimeInternal, {
        userId,
        labSessionId: args.labSessionId,
        clearError: true,
      });
      return null;
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      throw error;
    }
  },
});

export const createFile = action({
  args: {
    labSessionId: v.id("labSessions"),
    path: v.string(),
    content: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    try {
      await getRuntimeProvider().createFile({
        sandboxId: session.sandboxId,
        path: normalizeLabPath(args.path),
        content: args.content,
      });
      await ctx.runMutation(internalApi.labs.patchLabSessionRuntimeInternal, {
        userId,
        labSessionId: args.labSessionId,
        clearError: true,
      });
      return null;
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      throw error;
    }
  },
});

export const renamePath = action({
  args: {
    labSessionId: v.id("labSessions"),
    oldPath: v.string(),
    newPath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    try {
      await getRuntimeProvider().rename({
        sandboxId: session.sandboxId,
        oldPath: normalizeLabPath(args.oldPath),
        newPath: normalizeLabPath(args.newPath),
      });
      await ctx.runMutation(internalApi.labs.patchLabSessionRuntimeInternal, {
        userId,
        labSessionId: args.labSessionId,
        clearError: true,
      });
      return null;
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      throw error;
    }
  },
});

export const deletePath = action({
  args: {
    labSessionId: v.id("labSessions"),
    path: v.string(),
    recursive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    try {
      await getRuntimeProvider().delete({
        sandboxId: session.sandboxId,
        path: normalizeLabPath(args.path),
        recursive: args.recursive,
      });
      await ctx.runMutation(internalApi.labs.patchLabSessionRuntimeInternal, {
        userId,
        labSessionId: args.labSessionId,
        clearError: true,
      });
      return null;
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      throw error;
    }
  },
});

export const search = action({
  args: {
    labSessionId: v.id("labSessions"),
    path: v.optional(v.string()),
    query: v.string(),
  },
  returns: v.array(searchMatchValidator),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    try {
      return await getRuntimeProvider().search({
        sandboxId: session.sandboxId,
        path: normalizeLabPath(args.path),
        query: args.query,
      });
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      throw error;
    }
  },
});

export const runCommand = action({
  args: {
    labSessionId: v.id("labSessions"),
    command: v.string(),
    cwd: v.optional(v.string()),
    timeoutSec: v.optional(v.number()),
  },
  returns: commandResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    const startedAt = Date.now();
    try {
      const result = await getRuntimeProvider().runCommand({
        sandboxId: session.sandboxId,
        command: args.command,
        cwd: args.cwd,
        timeoutSec: args.timeoutSec,
      });
      await ctx.runMutation(internalApi.labs.patchLabSessionRuntimeInternal, {
        userId,
        labSessionId: args.labSessionId,
        clearError: true,
      });
      await recordLabTelemetry(ctx, {
        userId,
        threadId: session.threadId,
        name: "run_command",
        status: result.exitCode === 0 ? "success" : "failed",
        startedAt,
        metadata: { labSessionId: session._id, command: args.command },
      });
      return result;
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      await recordLabTelemetry(ctx, {
        userId,
        threadId: session.threadId,
        name: "run_command",
        status: "failed",
        startedAt,
        error,
        metadata: { labSessionId: session._id, command: args.command },
      });
      throw error;
    }
  },
});

export const createTerminalSession = action({
  args: {
    labSessionId: v.id("labSessions"),
    sessionId: v.string(),
  },
  returns: v.object({
    sessionId: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    try {
      return await getRuntimeProvider().createSession({
        sandboxId: session.sandboxId,
        sessionId: args.sessionId,
      });
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      throw error;
    }
  },
});

export const runSessionCommand = action({
  args: {
    labSessionId: v.id("labSessions"),
    sessionId: v.string(),
    command: v.string(),
    timeoutSec: v.optional(v.number()),
  },
  returns: sessionCommandResultValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    try {
      const result = await getRuntimeProvider().runSessionCommand({
        sandboxId: session.sandboxId,
        sessionId: args.sessionId,
        command: args.command,
        timeoutSec: args.timeoutSec,
      });
      await ctx.runMutation(internalApi.labs.patchLabSessionRuntimeInternal, {
        userId,
        labSessionId: args.labSessionId,
        clearError: true,
      });
      return result;
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      throw error;
    }
  },
});

export const createPty = action({
  args: {
    labSessionId: v.id("labSessions"),
    ptyId: v.string(),
    cwd: v.optional(v.string()),
    cols: v.optional(v.number()),
    rows: v.optional(v.number()),
  },
  returns: v.object({
    ptyId: v.string(),
    initialOutput: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    try {
      const result = await getRuntimeProvider().createPty({
        sandboxId: session.sandboxId,
        ptyId: args.ptyId,
        cwd: args.cwd,
        cols: args.cols,
        rows: args.rows,
      });
      await ctx.runMutation(internalApi.labs.patchLabSessionRuntimeInternal, {
        userId,
        labSessionId: args.labSessionId,
        clearError: true,
      });
      return result;
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      throw error;
    }
  },
});

export const getPreview = action({
  args: {
    labSessionId: v.id("labSessions"),
    port: v.number(),
    signed: v.optional(v.boolean()),
  },
  returns: previewValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    try {
      const preview = await getRuntimeProvider().getPreview({
        sandboxId: session.sandboxId,
        port: args.port,
        signed: args.signed,
      });
      const previews = [
        ...(session.previewUrls ?? []).filter(
          (item: { port: number }) => item.port !== args.port,
        ),
        preview,
      ];
      await ctx.runMutation(internalApi.labs.patchLabSessionRuntimeInternal, {
        userId,
        labSessionId: args.labSessionId,
        previewUrls: previews,
        clearError: true,
      });
      return preview;
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      throw error;
    }
  },
});

export const archiveLab = action({
  args: {
    labSessionId: v.id("labSessions"),
  },
  returns: labSessionActionValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthenticatedUserId(ctx);
    const session = await getOwnedSession(ctx, userId, args.labSessionId);
    const startedAt = Date.now();
    try {
      await getRuntimeProvider().archive({ sandboxId: session.sandboxId });
      const archived = await ctx.runMutation(
        internalApi.labs.archiveLabSessionInternal,
        {
          userId,
          labSessionId: args.labSessionId,
        },
      );
      await recordLabTelemetry(ctx, {
        userId,
        threadId: session.threadId,
        name: "archive_lab",
        status: "success",
        startedAt,
        metadata: { labSessionId: session._id },
      });
      return archived;
    } catch (error) {
      await recordSessionError(ctx, userId, args.labSessionId, error);
      await recordLabTelemetry(ctx, {
        userId,
        threadId: session.threadId,
        name: "archive_lab",
        status: "failed",
        startedAt,
        error,
        metadata: { labSessionId: session._id },
      });
      throw error;
    }
  },
});

export const archiveThreadLabsInternal = internalAction({
  args: {
    userId: v.string(),
    threadId: v.string(),
    labs: v.array(
      v.object({
        labSessionId: v.id("labSessions"),
        sandboxId: v.string(),
        provider: v.literal("daytona"),
      }),
    ),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    for (const lab of args.labs) {
      try {
        await getRuntimeProvider().archive({ sandboxId: lab.sandboxId });
      } catch (error) {
        console.error("Best-effort lab archive failed", {
          userId: args.userId,
          threadId: args.threadId,
          labSessionId: lab.labSessionId,
          error: toMessage(error),
        });
      }
    }
    return null;
  },
});
