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
  classifyDaytonaError,
  createProcessSession,
  deleteProcessSession,
  editFile,
  ensureSandboxStarted,
  executeSessionCommand,
  formatErrorSummary,
  getProcessSession,
  getSessionCommand,
  getSessionCommandLogs,
  globFiles,
  grepFiles,
  listFiles,
  readFile,
  runCommand,
  sendSessionCommandInput,
  getSignedPreviewLink,
  getTerminalLink,
  truncateOutput,
  writeFile,
} from "./daytona";
import { ensurePtySession } from "../lib/daytona/server";
import { isPreviewablePort } from "../lib/lab/preview";

const daytonaErrorValidator = v.object({
  category: v.string(),
  message: v.string(),
  retriable: v.boolean(),
  httpStatus: v.optional(v.number()),
  endpoint: v.optional(v.string()),
  requestId: v.optional(v.string()),
  hint: v.optional(v.string()),
  raw: v.optional(v.string()),
});

const failureValidator = v.object({
  status: v.literal("failed"),
  summary: v.string(),
  error: daytonaErrorValidator,
});

const DEFAULT_PTY_COLS = 120;
const DEFAULT_PTY_ROWS = 32;

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

async function requireUserId(ctx: {
  auth: {
    getUserIdentity: () => Promise<{ subject: string } | null>;
  };
}): Promise<string> {
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
  },
  userId: string,
  threadId: string,
): Promise<{ sandboxId: string }> {
  await ctx.runQuery(internal.chat.assertThreadOwner, {
    userId,
    threadId,
  });

  const session = await ctx.runQuery(
    internal.labs.getLabSessionByThreadForUserInternal,
    {
      userId,
      threadId,
    },
  );

  if (!session || session.archivedAt) {
    throw new Error("No active lab session for this thread.");
  }

  await ensureSandboxStarted(session.sandboxId);
  await ctx.runMutation(internal.labs.touchLabSessionInternal, {
    userId,
    threadId,
  });

  return {
    sandboxId: session.sandboxId,
  };
}

async function ensureProcessSession(
  sandboxId: string,
  requestedSessionId?: string,
): Promise<{
  sessionId: string;
  created: boolean;
}> {
  const normalizedRequested = requestedSessionId?.trim();
  if (normalizedRequested) {
    try {
      await getProcessSession({
        sandboxId,
        sessionId: normalizedRequested,
      });
      return {
        sessionId: normalizedRequested,
        created: false,
      };
    } catch (error) {
      const detail = classifyDaytonaError(error);
      if (detail.category !== "not_found") {
        throw error;
      }
    }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const nextId =
      attempt === 0 && normalizedRequested
        ? normalizedRequested
        : `studi-${crypto.randomUUID()}`;
    try {
      await createProcessSession({
        sandboxId,
        sessionId: nextId,
      });
      return {
        sessionId: nextId,
        created: true,
      };
    } catch (error) {
      const detail = classifyDaytonaError(error);
      if (detail.category === "conflict") {
        return {
          sessionId: nextId,
          created: false,
        };
      }
      if (detail.category !== "invalid_request" || attempt > 0) {
        throw error;
      }
    }
  }

  throw new Error("Unable to establish process session.");
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
    const requestedPath = args.path?.trim();
    const isWorkspaceRootRequest =
      !requestedPath ||
      requestedPath === "." ||
      requestedPath === "workspace" ||
      requestedPath === "/workspace";

    try {
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const result = await listFiles({
        sandboxId,
        path: args.path,
      });

      return {
        status: "success" as const,
        summary: `Listed ${result.entries.length} entries in ${result.path}.`,
        path: result.path,
        workspaceMissing: false,
        entries: result.entries,
      };
    } catch (error) {
      const detail = classifyDaytonaError(error);
      if (isWorkspaceRootRequest && detail.category === "not_found") {
        return {
          status: "success" as const,
          summary:
            "Workspace directory is missing. Create a project folder to get started.",
          path: "workspace",
          workspaceMissing: true,
          entries: [],
        };
      }
      return {
        status: "failed" as const,
        summary: formatErrorSummary("list files", error),
        error: detail,
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
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const result = await readFile({
        sandboxId,
        path: args.path,
        offset: args.offset,
        limit: args.limit,
        format: "raw",
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
        error: classifyDaytonaError(error),
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
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const result = await writeFile({
        sandboxId,
        path: args.path,
        content: args.content,
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
        error: classifyDaytonaError(error),
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
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const result = await editFile({
        sandboxId,
        path: args.path,
        oldText: args.oldText,
        newText: args.newText,
        replaceAll: args.replaceAll,
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
        error: classifyDaytonaError(error),
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
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const result = await runCommand({
        sandboxId,
        command: args.command,
        cwd: args.cwd,
        timeoutSeconds: args.timeoutSeconds,
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
        error: classifyDaytonaError(error),
      };
    }
  },
});

export const ensureLabTerminalSession = action({
  args: {
    threadId: v.string(),
    sessionId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      sessionId: v.string(),
      created: v.boolean(),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const ensured = await ensureProcessSession(sandboxId, args.sessionId);

      return {
        status: "success" as const,
        summary: ensured.created
          ? "Created terminal session."
          : "Reused existing terminal session.",
        sessionId: ensured.sessionId,
        created: ensured.created,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("ensure terminal session", error),
        error: classifyDaytonaError(error),
      };
    }
  },
});

export const ensureLabPtySession = action({
  args: {
    threadId: v.string(),
    sessionId: v.optional(v.string()),
    cols: v.optional(v.number()),
    rows: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      sessionId: v.string(),
      created: v.boolean(),
      cols: v.number(),
      rows: v.number(),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const sessionId = args.sessionId?.trim() || "studi-main";
      const cols =
        typeof args.cols === "number" && Number.isFinite(args.cols)
          ? Math.max(40, Math.floor(args.cols))
          : DEFAULT_PTY_COLS;
      const rows =
        typeof args.rows === "number" && Number.isFinite(args.rows)
          ? Math.max(10, Math.floor(args.rows))
          : DEFAULT_PTY_ROWS;

      const ensured = await ensurePtySession({
        sandboxId,
        sessionId,
        cols,
        rows,
      });

      return {
        status: "success" as const,
        summary: ensured.created
          ? "Created PTY terminal session."
          : "Reused PTY terminal session.",
        sessionId: ensured.sessionId,
        created: ensured.created,
        cols: ensured.cols,
        rows: ensured.rows,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("ensure PTY session", error),
        error: classifyDaytonaError(error),
      };
    }
  },
});

export const runLabTerminalCommand = action({
  args: {
    threadId: v.string(),
    sessionId: v.string(),
    command: v.string(),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      sessionId: v.string(),
      commandId: v.string(),
      running: v.boolean(),
      exitCode: v.optional(v.number()),
      output: v.string(),
      stdout: v.optional(v.string()),
      stderr: v.optional(v.string()),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const session = await ensureProcessSession(sandboxId, args.sessionId);

      const result = await executeSessionCommand({
        sandboxId,
        sessionId: session.sessionId,
        command: args.command,
        runAsync: true,
      });

      const running = result.exitCode === undefined;
      const summary = running
        ? "Command started in terminal session."
        : `Command finished with exit code ${result.exitCode}.`;

      return {
        status: "success" as const,
        summary,
        sessionId: session.sessionId,
        commandId: result.commandId,
        running,
        exitCode: result.exitCode,
        output: truncateOutput(result.output ?? ""),
        stdout: result.stdout ? truncateOutput(result.stdout) : undefined,
        stderr: result.stderr ? truncateOutput(result.stderr) : undefined,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("run terminal command", error),
        error: classifyDaytonaError(error),
      };
    }
  },
});

export const getLabTerminalCommandLogs = action({
  args: {
    threadId: v.string(),
    sessionId: v.string(),
    commandId: v.string(),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      sessionId: v.string(),
      commandId: v.string(),
      running: v.boolean(),
      exitCode: v.optional(v.number()),
      output: v.string(),
      stdout: v.optional(v.string()),
      stderr: v.optional(v.string()),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const streams = await getSessionCommandLogs({
        sandboxId,
        sessionId: args.sessionId,
        commandId: args.commandId,
      });

      let running = true;
      let exitCode: number | undefined;
      try {
        const status = await getSessionCommand({
          sandboxId,
          sessionId: args.sessionId,
          commandId: args.commandId,
        });
        running = status.running;
        exitCode = status.exitCode;
      } catch (statusError) {
        const detail = classifyDaytonaError(statusError);
        if (detail.category === "not_found") {
          running = false;
          exitCode = exitCode ?? 0;
        } else {
          throw statusError;
        }
      }

      const summary = running
        ? "Terminal command still running."
        : `Terminal command finished with exit code ${exitCode ?? 0}.`;

      return {
        status: "success" as const,
        summary,
        sessionId: args.sessionId,
        commandId: args.commandId,
        running,
        exitCode,
        output: truncateOutput(streams.output ?? "", 20_000),
        stdout: streams.stdout
          ? truncateOutput(streams.stdout, 20_000)
          : undefined,
        stderr: streams.stderr
          ? truncateOutput(streams.stderr, 20_000)
          : undefined,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("get terminal logs", error),
        error: classifyDaytonaError(error),
      };
    }
  },
});

export const sendLabTerminalInput = action({
  args: {
    threadId: v.string(),
    sessionId: v.string(),
    commandId: v.string(),
    data: v.string(),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      sessionId: v.string(),
      commandId: v.string(),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      await sendSessionCommandInput({
        sandboxId,
        sessionId: args.sessionId,
        commandId: args.commandId,
        data: args.data,
      });

      return {
        status: "success" as const,
        summary: "Input sent to running terminal command.",
        sessionId: args.sessionId,
        commandId: args.commandId,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("send terminal input", error),
        error: classifyDaytonaError(error),
      };
    }
  },
});

export const closeLabTerminalSession = action({
  args: {
    threadId: v.string(),
    sessionId: v.string(),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      sessionId: v.string(),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      await deleteProcessSession({
        sandboxId,
        sessionId: args.sessionId,
      });

      return {
        status: "success" as const,
        summary: "Terminal session closed.",
        sessionId: args.sessionId,
      };
    } catch (error) {
      const detail = classifyDaytonaError(error);
      if (detail.category === "not_found") {
        return {
          status: "success" as const,
          summary: "Terminal session already closed.",
          sessionId: args.sessionId,
        };
      }
      return {
        status: "failed" as const,
        summary: formatErrorSummary("close terminal session", error),
        error: detail,
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
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const result = await grepFiles({
        sandboxId,
        pattern: args.pattern,
        path: args.path,
        limit: args.limit,
      });

      return {
        status: "success" as const,
        summary: `Found ${result.total} match(es).`,
        path: result.path,
        total: result.total,
        matches: result.matches.map((match) => ({
          file: match.file,
          line: match.line,
          content: truncateOutput(match.content, 500),
        })),
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("grep files", error),
        error: classifyDaytonaError(error),
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
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const result = await globFiles({
        sandboxId,
        pattern: args.pattern,
        path: args.path,
        limit: args.limit,
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
        error: classifyDaytonaError(error),
      };
    }
  },
});

export const getLabPreviewLink = action({
  args: {
    threadId: v.string(),
    port: v.number(),
    expiresInSeconds: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      port: v.number(),
      url: v.string(),
      token: v.optional(v.string()),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const preview = await getSignedPreviewLink({
        sandboxId,
        port: args.port,
        expiresInSeconds: args.expiresInSeconds,
      });

      return {
        status: "success" as const,
        summary: `Preview URL ready for port ${args.port}.`,
        port: args.port,
        url: preview.url,
        token: preview.token,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("get preview link", error),
        error: classifyDaytonaError(error),
      };
    }
  },
});

export const getLabPreviewProxyDescriptor = action({
  args: {
    threadId: v.string(),
    port: v.number(),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      port: v.number(),
      proxyPath: v.string(),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      if (!isPreviewablePort(args.port)) {
        throw new Error("Preview port must be between 3000 and 9999.");
      }

      await getActiveSession(ctx, userId, args.threadId);

      return {
        status: "success" as const,
        summary: `Preview proxy ready for port ${args.port}.`,
        port: args.port,
        proxyPath: `/api/lab/preview/${encodeURIComponent(args.threadId)}/${args.port}`,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("get preview proxy descriptor", error),
        error: classifyDaytonaError(error),
      };
    }
  },
});

export const getLabTerminalLink = action({
  args: {
    threadId: v.string(),
    expiresInSeconds: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      status: v.literal("success"),
      summary: v.string(),
      url: v.string(),
      token: v.optional(v.string()),
      port: v.number(),
    }),
    failureValidator,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    try {
      const { sandboxId } = await getActiveSession(ctx, userId, args.threadId);
      const terminal = await getTerminalLink({
        sandboxId,
        expiresInSeconds: args.expiresInSeconds,
      });

      return {
        status: "success" as const,
        summary: "Daytona web terminal link ready.",
        url: terminal.url,
        token: terminal.token,
        port: 22222,
      };
    } catch (error) {
      return {
        status: "failed" as const,
        summary: formatErrorSummary("get terminal link", error),
        error: classifyDaytonaError(error),
      };
    }
  },
});

