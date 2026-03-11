"use node";

import { v } from "convex/values";
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import {
  classifyLabRuntimeError,
  formatErrorSummary,
  truncateOutput,
} from "../lib/lab-runtime/shared";

const labRuntimeErrorValidator = v.object({
  category: v.string(),
  message: v.string(),
  retriable: v.boolean(),
  httpStatus: v.optional(v.number()),
  endpoint: v.optional(v.string()),
  requestId: v.optional(v.string()),
  hint: v.optional(v.string()),
  raw: v.optional(v.string()),
  exitCode: v.optional(v.number()),
});

const failureValidator = v.object({
  status: v.literal("failed"),
  summary: v.string(),
  error: labRuntimeErrorValidator,
});

const serializedHostTokenValidator = v.object({
  sandboxId: v.string(),
  token: v.string(),
  tokenId: v.string(),
  expiresAtMs: v.union(v.number(), v.null()),
  lastUsedAtMs: v.union(v.number(), v.null()),
});

const serializedSandboxSessionValidator = v.object({
  sandboxId: v.string(),
  pitcherToken: v.string(),
  pitcherURL: v.string(),
  workspacePath: v.string(),
  userWorkspacePath: v.string(),
  pitcherManagerVersion: v.string(),
  pitcherVersion: v.string(),
  latestPitcherVersion: v.string(),
  cluster: v.string(),
  bootupType: v.union(
    v.literal("RUNNING"),
    v.literal("CLEAN"),
    v.literal("RESUME"),
    v.literal("FORK"),
  ),
  isPint: v.boolean(),
  sessionId: v.optional(v.string()),
  hostToken: v.optional(serializedHostTokenValidator),
});

type QueryRunner = <
  Query extends FunctionReference<"query", "public" | "internal">,
>(
  query: Query,
  ...args: OptionalRestArgs<Query>
) => Promise<FunctionReturnType<Query>>;

type MutationRunner = <
  Mutation extends FunctionReference<"mutation", "public" | "internal">,
>(
  mutation: Mutation,
  ...args: OptionalRestArgs<Mutation>
) => Promise<FunctionReturnType<Mutation>>;

type ActionRunner = <
  Action extends FunctionReference<"action", "public" | "internal">,
>(
  action: Action,
  ...args: OptionalRestArgs<Action>
) => Promise<FunctionReturnType<Action>>;

const internalApi = internal as unknown as {
  billing: {
    assertCanCreateLabInternal: FunctionReference<"mutation", "internal">;
    assertCanRunExpensiveLabCommandInternal: FunctionReference<
      "mutation",
      "internal"
    >;
  };
  chat: {
    assertThreadOwner: FunctionReference<"query", "internal">;
  };
  labRuntime: {
    execute: FunctionReference<"action", "internal">;
  };
  labs: {
    getLabSessionByThreadForUserInternal: FunctionReference<"query", "internal">;
    touchLabSessionInternal: FunctionReference<"mutation", "internal">;
  };
};

async function requireUserId(ctx: {
  auth: {
    getUserIdentity: () => Promise<{ subject: string } | null>;
  };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity.subject;
}

async function getActiveSession(
  ctx: {
    runQuery: QueryRunner;
    runMutation: MutationRunner;
    runAction: ActionRunner;
  },
  userId: string,
  threadId: string,
) {
  await ctx.runQuery(internalApi.chat.assertThreadOwner, {
    userId,
    threadId,
  });

  const session = await ctx.runQuery(
    internalApi.labs.getLabSessionByThreadForUserInternal,
    {
      userId,
      threadId,
    },
  );

  if (!session || session.archivedAt) {
    throw new Error("No active lab session for this thread.");
  }

  await ctx.runMutation(internalApi.billing.assertCanCreateLabInternal, {
    userId,
  });

  const workspacePath = session.metadata?.workspacePath?.trim();
  if (!workspacePath) {
    throw new Error("Lab session is missing workspace metadata.");
  }

  await ctx.runAction(internalApi.labRuntime.execute, {
    operation: "resumeSandbox",
    payload: {
      sandboxId: session.sandboxId,
    },
  });
  await ctx.runMutation(internalApi.labs.touchLabSessionInternal, {
    userId,
    threadId,
  });

  return {
    sandboxId: session.sandboxId,
    workspacePath,
  };
}

export const listLabFiles = action({
  args: {
    threadId: v.string(),
    path: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      path: v.string(),
      workspaceMissing: v.boolean(),
      entries: v.array(
        v.object({
          name: v.string(),
          path: v.string(),
          isDir: v.boolean(),
          size: v.number(),
          modTime: v.string(),
        }),
      ),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId, workspacePath } = await getActiveSession(
        ctx,
        userId,
        args.threadId,
      );
      const result = await ctx.runAction(internalApi.labRuntime.execute, {
        operation: "listFiles",
        payload: {
          sandboxId,
          workspacePath,
          path: args.path,
        },
      });

      return {
        status: "success" as const,
        summary: `Listed ${result.entries.length} entries in ${result.path}.`,
        path: result.path,
        workspaceMissing: false,
        entries: result.entries,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("list files", error),
        error: classifyLabRuntimeError(error),
      };
    }
  },
});

export const readLabFile = action({
  args: {
    threadId: v.string(),
    path: v.string(),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      path: v.string(),
      content: v.string(),
      truncated: v.boolean(),
      isBinary: v.boolean(),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId, workspacePath } = await getActiveSession(
        ctx,
        userId,
        args.threadId,
      );
      const result = await ctx.runAction(internalApi.labRuntime.execute, {
        operation: "readFile",
        payload: {
          sandboxId,
          workspacePath,
          path: args.path,
          offset: args.offset,
          limit: args.limit,
          format: "raw",
        },
      });

      return {
        status: "success" as const,
        summary: `Read ${result.path}.`,
        path: result.path,
        content: result.content,
        truncated: result.truncated,
        isBinary: result.isBinary,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("read file", error),
        error: classifyLabRuntimeError(error),
      };
    }
  },
});

export const writeLabFile = action({
  args: {
    threadId: v.string(),
    path: v.string(),
    content: v.string(),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      path: v.string(),
      bytes: v.number(),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId, workspacePath } = await getActiveSession(
        ctx,
        userId,
        args.threadId,
      );
      const result = await ctx.runAction(internalApi.labRuntime.execute, {
        operation: "writeFile",
        payload: {
          sandboxId,
          workspacePath,
          path: args.path,
          content: args.content,
        },
      });

      return {
        status: "success" as const,
        summary: `Saved ${result.path}.`,
        path: result.path,
        bytes: result.bytes,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("write file", error),
        error: classifyLabRuntimeError(error),
      };
    }
  },
});

export const editLabFile = action({
  args: {
    threadId: v.string(),
    path: v.string(),
    oldText: v.string(),
    newText: v.string(),
    replaceAll: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      path: v.string(),
      replacements: v.number(),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId, workspacePath } = await getActiveSession(
        ctx,
        userId,
        args.threadId,
      );
      const result = await ctx.runAction(internalApi.labRuntime.execute, {
        operation: "editFile",
        payload: {
          sandboxId,
          workspacePath,
          path: args.path,
          oldText: args.oldText,
          newText: args.newText,
          replaceAll: args.replaceAll,
        },
      });

      return {
        status: "success" as const,
        summary: `Applied ${result.replacements} replacement(s) in ${result.path}.`,
        path: result.path,
        replacements: result.replacements,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("edit file", error),
        error: classifyLabRuntimeError(error),
      };
    }
  },
});

export const runLabCommand = action({
  args: {
    threadId: v.string(),
    command: v.string(),
    cwd: v.optional(v.string()),
    timeoutSeconds: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      command: v.string(),
      cwd: v.string(),
      exitCode: v.optional(v.number()),
      output: v.string(),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      await ctx.runMutation(
        internalApi.billing.assertCanRunExpensiveLabCommandInternal,
        {
          userId,
        },
      );

      const { sandboxId, workspacePath } = await getActiveSession(
        ctx,
        userId,
        args.threadId,
      );
      const result = await ctx.runAction(internalApi.labRuntime.execute, {
        operation: "runCommand",
        payload: {
          sandboxId,
          workspacePath,
          command: args.command,
          cwd: args.cwd,
          timeoutSeconds: args.timeoutSeconds,
        },
      });

      return {
        status: "success" as const,
        summary: `Command finished with exit code ${result.exitCode ?? 0}.`,
        command: args.command,
        cwd: result.cwd,
        exitCode: result.exitCode,
        output: truncateOutput(result.output),
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("run command", error),
        error: classifyLabRuntimeError(error),
      };
    }
  },
});

export const grepLabFiles = action({
  args: {
    threadId: v.string(),
    pattern: v.string(),
    path: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      path: v.string(),
      total: v.number(),
      matches: v.array(
        v.object({
          file: v.string(),
          line: v.number(),
          content: v.string(),
        }),
      ),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId, workspacePath } = await getActiveSession(
        ctx,
        userId,
        args.threadId,
      );
      const result = await ctx.runAction(internalApi.labRuntime.execute, {
        operation: "grepFiles",
        payload: {
          sandboxId,
          workspacePath,
          pattern: args.pattern,
          path: args.path,
          limit: args.limit,
        },
      });

      return {
        status: "success" as const,
        summary: `Found ${result.total} match(es).`,
        path: result.path,
        total: result.total,
        matches: result.matches.map(
          (match: { file: string; line: number; content: string }) => ({
          file: match.file,
          line: match.line,
          content: truncateOutput(match.content, 500),
          }),
        ),
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("grep files", error),
        error: classifyLabRuntimeError(error),
      };
    }
  },
});

export const globLabFiles = action({
  args: {
    threadId: v.string(),
    pattern: v.string(),
    path: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      path: v.string(),
      total: v.number(),
      files: v.array(v.string()),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId, workspacePath } = await getActiveSession(
        ctx,
        userId,
        args.threadId,
      );
      const result = await ctx.runAction(internalApi.labRuntime.execute, {
        operation: "globFiles",
        payload: {
          sandboxId,
          workspacePath,
          pattern: args.pattern,
          path: args.path,
          limit: args.limit,
        },
      });

      return {
        status: "success" as const,
        summary: `Found ${result.total} file(s).`,
        path: result.path,
        total: result.total,
        files: result.files,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("glob files", error),
        error: classifyLabRuntimeError(error),
      };
    }
  },
});

export const createLabClientSession = action({
  args: {
    threadId: v.string(),
    sessionId: v.optional(v.string()),
  },
  returns: serializedSandboxSessionValidator,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
    const hostToken = await ctx.runAction(internalApi.labRuntime.execute, {
      operation: "createHostToken",
      payload: {
        sandboxId,
      },
    });
    const session = await ctx.runAction(internalApi.labRuntime.execute, {
      operation: "createBrowserSession",
      payload: {
        sandboxId,
        sessionId: args.sessionId?.trim() || undefined,
        hostToken,
      },
    });

    return session;
  },
});
