"use node";

import { createTool } from "@convex-dev/agent";
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import {
  classifyLabRuntimeError,
  formatErrorSummary,
  truncateOutput,
  type LabRuntimeError,
} from "../lib/lab-runtime/shared";
import { capturePosthogEvent } from "./posthog";
import { resolveLabRuntime } from "../lib/lab-runtime/profiles";

const internalApi = internal as unknown as {
  billing: {
    assertCanCreateLabInternal: FunctionReference<"mutation", "internal">;
    assertCanRunExpensiveLabCommandInternal: FunctionReference<
      "mutation",
      "internal"
    >;
  };
  labRuntime: {
    execute: FunctionReference<"action", "internal">;
  };
  plans: {
    ensureLabPlanInternal: FunctionReference<"mutation", "internal">;
  };
  telemetry: {
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

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

type ToolFailurePayload = {
  status: "failed";
  summary: string;
  error: LabRuntimeError;
  diagnostics?: Record<string, unknown>;
};

type LabSessionLookup = {
  session: {
    sandboxId: string;
    metadata?: {
      language?: string;
      framework?: string;
      template?: string;
      runtimeProfileId?: string;
      workspacePath?: string;
      templateKey?: string;
    };
    archivedAt?: number;
  } | null;
  userId: string;
  threadId: string;
};

const MAX_MATCHES = 300;

async function recordLabToolTelemetry(
  ctx: {
    runMutation: MutationRunner;
  },
  params: {
    userId?: string;
    threadId?: string;
    name: string;
    status: "success" | "failed";
    durationMs: number;
    errorCategory?: string;
    retriable?: boolean;
    metadata?: Record<string, unknown>;
  },
) {
  if (!params.userId) {
    return;
  }

  await ctx
    .runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
      userId: params.userId,
      threadId: params.threadId,
      source: "lab_tool",
      name: params.name,
      status: params.status,
      durationMs: params.durationMs,
      errorCategory: params.errorCategory,
      retriable: params.retriable,
      metadata: params.metadata,
    })
    .catch((error) => {
      console.error("Failed to store lab telemetry", error);
    });

  await capturePosthogEvent({
    event: "lab_tool_result",
    distinctId: params.userId,
    properties: {
      thread_id: params.threadId,
      tool_name: params.name,
      status: params.status,
      duration_ms: params.durationMs,
      error_category: params.errorCategory,
      retriable: params.retriable,
      ...(params.metadata ?? {}),
    },
  });
}

function failure(
  operation: string,
  error: unknown,
  diagnostics?: Record<string, unknown>,
): ToolFailurePayload {
  return {
    status: "failed",
    summary: formatErrorSummary(operation, error),
    error: classifyLabRuntimeError(error),
    diagnostics,
  };
}

async function getSessionForContext(ctx: {
  userId?: string;
  threadId?: string;
  runQuery: QueryRunner;
}): Promise<LabSessionLookup> {
  const userId = ctx.userId;
  const threadId = ctx.threadId;
  if (!userId || !threadId) {
    throw new Error("Lab tools require user and thread context.");
  }

  const session = await ctx.runQuery(
    internal.labs.getLabSessionByThreadForUserInternal,
    {
      userId,
      threadId,
    },
  );

  return {
    session: session as LabSessionLookup["session"],
    userId,
    threadId,
  };
}

async function touchSession(
  ctx: {
    runMutation: MutationRunner;
  },
  userId: string,
  threadId: string,
): Promise<void> {
  await ctx.runMutation(internal.labs.touchLabSessionInternal, {
    userId,
    threadId,
  });
}

async function runLabRuntime<Output>(
  ctx: {
    runAction: ActionRunner;
  },
  operation: string,
  payload: Record<string, unknown>,
) {
  return (await ctx.runAction(internalApi.labRuntime.execute, {
    operation,
    payload,
  })) as Output;
}

async function getActiveSandbox(ctx: {
  userId?: string;
  threadId?: string;
  runQuery: QueryRunner;
  runMutation: MutationRunner;
  runAction: ActionRunner;
}): Promise<{
  sandboxId: string;
  workspacePath: string;
  userId: string;
  threadId: string;
}> {
  const { session, userId, threadId } = await getSessionForContext(ctx);
  if (!session || session.archivedAt) {
    throw new Error("No active lab session in this thread.");
  }

  await ctx.runMutation(internalApi.billing.assertCanCreateLabInternal, {
    userId,
  });

  const workspacePath = session.metadata?.workspacePath?.trim();
  if (!workspacePath) {
    throw new Error(
      "Lab session is missing workspace metadata. Recreate the lab.",
    );
  }

  await runLabRuntime<null>(ctx, "resumeSandbox", {
    sandboxId: session.sandboxId,
  });
  await touchSession(ctx, userId, threadId);

  return {
    sandboxId: session.sandboxId,
    workspacePath,
    userId,
    threadId,
  };
}

const createLabSchema = z.object({
  topic: z.string().optional(),
  objective: z.string().optional(),
  language: z.string().optional(),
  framework: z.string().optional(),
  template: z.string().optional(),
  createTrack: z.boolean().optional(),
  forceNewSandbox: z.boolean().optional(),
});

type CreateLabResult =
  | {
      status: "active";
      summary: string;
      sandboxId: string;
      metadata: {
        topic?: string;
        objective?: string;
        language?: string;
        framework?: string;
        template?: string;
        runtimeProfileId?: string;
        workspacePath?: string;
        templateKey?: string;
      };
    }
  | ToolFailurePayload;

export const createLabTool = createTool<
  z.infer<typeof createLabSchema>,
  CreateLabResult
>({
  description:
    "Create or resume a coding lab for the current thread and switch to the lab agent.",
  args: createLabSchema,
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const userId = ctx.userId;
    const threadId = ctx.threadId;

    if (!userId || !threadId) {
      return failure("create_lab", new Error("Missing user/thread context."));
    }

    const runtime = resolveLabRuntime({
      language: args.language,
      framework: args.framework,
      template: args.template,
    });

    try {
      await ctx.runMutation(internalApi.billing.assertCanCreateLabInternal, {
        userId,
      });

      const shouldCreateTrack = args.createTrack === true;
      const forceNewSandbox = args.forceNewSandbox === true;
      const existing = (await ctx.runQuery(
        internal.labs.getLabSessionByThreadForUserInternal,
        {
          userId,
          threadId,
        },
      )) as LabSessionLookup["session"];

      let sandboxId: string;
      let workspacePath: string | undefined;
      let templateKey: string | undefined;
      let reusedExisting = false;
      let cleanupWarning: string | undefined;
      const existingProfileId = existing?.metadata?.runtimeProfileId;
      if (existing?.sandboxId && !forceNewSandbox) {
        sandboxId = existing.sandboxId;
        reusedExisting = true;
        workspacePath = existing.metadata?.workspacePath;
        templateKey = existing.metadata?.templateKey;
        await runLabRuntime<null>(ctx, "resumeSandbox", {
          sandboxId,
        });
      } else {
        if (existing?.sandboxId && forceNewSandbox) {
          try {
            await runLabRuntime<null>(ctx, "deleteSandboxAndConfirm", {
              sandboxId: existing.sandboxId,
            });
          } catch (error) {
            const detail = classifyLabRuntimeError(error);
            if (detail.category !== "not_found") {
              cleanupWarning = detail.message;
            }
          }
        }

        const created = await runLabRuntime<{
          sandboxId: string;
          workspacePath: string;
          templateKey?: string;
        }>(ctx, "createSandbox", {
          templateKey: runtime.templateKey,
          runtimeProfileId: runtime.runtimeProfileId,
          title: args.topic?.trim() || "Studi Lab",
        });
        sandboxId = created.sandboxId;
        workspacePath = created.workspacePath;
        templateKey = created.templateKey;
      }

      if (!workspacePath) {
        throw new Error("Lab sandbox is missing a workspace path.");
      }

      await ctx.runMutation(internal.labs.upsertLabSessionInternal, {
        userId,
        threadId,
        sandboxId,
        metadata: {
          topic: args.topic,
          objective: args.objective,
          language: runtime.language,
          framework: runtime.framework,
          template: args.template?.trim() || runtime.templateKey,
          runtimeProfileId: runtime.runtimeProfileId,
          workspacePath,
          templateKey,
        },
        unarchive: true,
      });

      if (shouldCreateTrack) {
        await ctx.runMutation(internalApi.plans.ensureLabPlanInternal, {
          userId,
          threadId,
          topic: args.topic,
          objective: args.objective,
        });
      }

      const runtimeNotice =
        reusedExisting &&
        existingProfileId &&
        existingProfileId !== runtime.runtimeProfileId
          ? ` Reused existing sandbox runtime (${existingProfileId}); use forceNewSandbox=true to switch.`
          : "";
      const cleanupNotice = cleanupWarning
        ? ` Previous sandbox cleanup warning: ${cleanupWarning}`
        : "";

      await recordLabToolTelemetry(ctx, {
        userId,
        threadId,
        name: "create_lab",
        status: "success",
        durationMs: Date.now() - startedAt,
        metadata: {
          topic: args.topic,
          objective: args.objective,
          language: runtime.language,
          framework: runtime.framework,
          template: args.template,
          runtimeProfileId: runtime.runtimeProfileId,
          selectedTemplateKey: runtime.templateKey,
          inferredFromFramework: runtime.inferredFromFramework,
          createdTrack: shouldCreateTrack,
          forceNewSandbox,
          reusedExisting,
          cleanupWarning,
          sandboxId,
          workspacePath,
          templateKey,
        },
      });

      return {
        status: "active",
        summary: `Lab is active. I will now use sandbox tools directly and report exact command/file results.${runtimeNotice}${cleanupNotice}`,
        sandboxId,
        metadata: {
          topic: args.topic,
          objective: args.objective,
          language: runtime.language,
          framework: runtime.framework,
          template: args.template?.trim() || runtime.templateKey,
          runtimeProfileId: runtime.runtimeProfileId,
          workspacePath,
          templateKey,
        },
      };
    } catch (error) {
      const detail = classifyLabRuntimeError(error);
      await recordLabToolTelemetry(ctx, {
        userId,
        threadId,
        name: "create_lab",
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCategory: detail.category,
        retriable: detail.retriable,
        metadata: {
          topic: args.topic,
          objective: args.objective,
          language: args.language,
          framework: args.framework,
          template: args.template,
          selectedTemplateKey: runtime.templateKey,
          createTrack: args.createTrack,
          forceNewSandbox: args.forceNewSandbox,
          error: detail.message,
          httpStatus: detail.httpStatus,
        },
      });
      return failure("create_lab", error, {
        threadId,
      });
    }
  },
});

const archiveLabSchema = z.object({});

type ArchiveLabResult =
  | {
      status: "archived";
      summary: string;
    }
  | ToolFailurePayload;

export const archiveLabTool = createTool<
  z.infer<typeof archiveLabSchema>,
  ArchiveLabResult
>({
  description: "Archive the current lab and hibernate its sandbox.",
  args: archiveLabSchema,
  handler: async (ctx) => {
    const startedAt = Date.now();
    const userId = ctx.userId;
    const threadId = ctx.threadId;

    if (!userId || !threadId) {
      return failure("archive_lab", new Error("Missing user/thread context."));
    }

    try {
      const { session } = await getSessionForContext(ctx);
      if (!session) {
        return failure("archive_lab", new Error("No lab session found."), {
          threadId,
        });
      }

      await runLabRuntime<null>(ctx, "hibernateSandbox", {
        sandboxId: session.sandboxId,
      });

      await ctx.runMutation(internal.labs.archiveLabSessionInternal, {
        userId,
        threadId,
      });

      await recordLabToolTelemetry(ctx, {
        userId,
        threadId,
        name: "archive_lab",
        status: "success",
        durationMs: Date.now() - startedAt,
      });

      return {
        status: "archived",
        summary: "Lab archived. Sandbox hibernated and state preserved.",
      };
    } catch (error) {
      const detail = classifyLabRuntimeError(error);
      await recordLabToolTelemetry(ctx, {
        userId,
        threadId,
        name: "archive_lab",
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCategory: detail.category,
        retriable: detail.retriable,
        metadata: {
          error: detail.message,
          httpStatus: detail.httpStatus,
        },
      });
      return failure("archive_lab", error, {
        threadId,
      });
    }
  },
});

const readSchema = z.object({
  path: z.string(),
  offset: z.number().int().min(1).max(500_000).optional(),
  limit: z.number().int().min(1).max(2000).optional(),
});

type ReadResult =
  | {
      status: "success";
      summary: string;
      path: string;
      content: string;
      truncated: boolean;
      isBinary: boolean;
    }
  | ToolFailurePayload;

export const readTool = createTool<z.infer<typeof readSchema>, ReadResult>({
  description: "Read a file from the active lab sandbox.",
  args: readSchema,
  handler: async (ctx, args) => {
    try {
      const { sandboxId, workspacePath } = await getActiveSandbox(ctx);
      const result = await runLabRuntime<{
        path: string;
        content: string;
        truncated: boolean;
        isBinary: boolean;
      }>(ctx, "readFile", {
        sandboxId,
        workspacePath,
        path: args.path,
        offset: args.offset,
        limit: args.limit,
      });

      return {
        status: "success",
        summary: `Read ${result.path}.`,
        path: result.path,
        content: result.content,
        truncated: result.truncated,
        isBinary: result.isBinary,
      };
    } catch (error) {
      return failure("read", error, {
        requestedPath: args.path,
      });
    }
  },
});

const grepSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_MATCHES).optional(),
});

type GrepResult =
  | {
      status: "success";
      summary: string;
      path: string;
      total: number;
      matches: Array<{ file: string; line: number; content: string }>;
    }
  | ToolFailurePayload;

export const grepTool = createTool<z.infer<typeof grepSchema>, GrepResult>({
  description:
    "Search file contents in the active lab sandbox by text pattern.",
  args: grepSchema,
  handler: async (ctx, args) => {
    try {
      const { sandboxId, workspacePath } = await getActiveSandbox(ctx);
      const result = await runLabRuntime<{
        path: string;
        total: number;
        matches: Array<{ file: string; line: number; content: string }>;
      }>(ctx, "grepFiles", {
        sandboxId,
        workspacePath,
        pattern: args.pattern,
        path: args.path,
        limit: args.limit,
      });

      return {
        status: "success",
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
      return failure("grep", error, {
        pattern: args.pattern,
        path: args.path,
      });
    }
  },
});

const globSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  limit: z.number().int().min(1).max(MAX_MATCHES).optional(),
});

type GlobResult =
  | {
      status: "success";
      summary: string;
      path: string;
      total: number;
      files: string[];
    }
  | ToolFailurePayload;

export const globTool = createTool<z.infer<typeof globSchema>, GlobResult>({
  description: "Find files by glob pattern in the active lab sandbox.",
  args: globSchema,
  handler: async (ctx, args) => {
    try {
      const { sandboxId, workspacePath } = await getActiveSandbox(ctx);
      const result = await runLabRuntime<{
        path: string;
        total: number;
        files: string[];
      }>(ctx, "globFiles", {
        sandboxId,
        workspacePath,
        pattern: args.pattern,
        path: args.path,
        limit: args.limit,
      });

      return {
        status: "success",
        summary: `Found ${result.total} file(s).`,
        path: result.path,
        total: result.total,
        files: result.files,
      };
    } catch (error) {
      return failure("glob", error, {
        pattern: args.pattern,
        path: args.path,
      });
    }
  },
});

const runSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  timeoutSeconds: z.number().int().min(1).max(600).optional(),
});

type RunResult =
  | {
      status: "success";
      summary: string;
      command: string;
      cwd: string;
      exitCode?: number;
      output: string;
    }
  | ToolFailurePayload;

export const runTool = createTool<z.infer<typeof runSchema>, RunResult>({
  description: "Run a shell command in the active lab sandbox.",
  args: runSchema,
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const userId = ctx.userId;
    const threadId = ctx.threadId;

    try {
      if (userId) {
        await ctx.runMutation(
          internalApi.billing.assertCanRunExpensiveLabCommandInternal,
          {
            userId,
          },
        );
      }

      const { sandboxId, workspacePath } = await getActiveSandbox(ctx);
      const result = await runLabRuntime<{
        cwd: string;
        exitCode?: number;
        output: string;
      }>(ctx, "runCommand", {
        sandboxId,
        workspacePath,
        command: args.command,
        cwd: args.cwd,
        timeoutSeconds: args.timeoutSeconds,
      });

      await recordLabToolTelemetry(ctx, {
        userId,
        threadId,
        name: "run",
        status: "success",
        durationMs: Date.now() - startedAt,
        metadata: {
          command: args.command,
          cwd: result.cwd,
          exitCode: result.exitCode,
        },
      });

      return {
        status: "success",
        summary: `Command finished with exit code ${result.exitCode ?? 0}.`,
        command: args.command,
        cwd: result.cwd,
        exitCode: result.exitCode,
        output: truncateOutput(result.output),
      };
    } catch (error) {
      const detail = classifyLabRuntimeError(error);
      await recordLabToolTelemetry(ctx, {
        userId,
        threadId,
        name: "run",
        status: "failed",
        durationMs: Date.now() - startedAt,
        errorCategory: detail.category,
        retriable: detail.retriable,
        metadata: {
          command: args.command,
          cwd: args.cwd,
          error: detail.message,
          httpStatus: detail.httpStatus,
        },
      });
      return failure("run", error, {
        command: args.command,
        cwd: args.cwd,
      });
    }
  },
});

const writeSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

type WriteResult =
  | {
      status: "success";
      summary: string;
      path: string;
      bytes: number;
    }
  | ToolFailurePayload;

export const writeTool = createTool<z.infer<typeof writeSchema>, WriteResult>({
  description: "Write file content in the active lab sandbox.",
  args: writeSchema,
  handler: async (ctx, args) => {
    try {
      const { sandboxId, workspacePath } = await getActiveSandbox(ctx);
      const result = await runLabRuntime<{
        path: string;
        bytes: number;
      }>(ctx, "writeFile", {
        sandboxId,
        workspacePath,
        path: args.path,
        content: args.content,
      });

      return {
        status: "success",
        summary: `Wrote ${result.path}.`,
        path: result.path,
        bytes: result.bytes,
      };
    } catch (error) {
      return failure("write", error, {
        requestedPath: args.path,
      });
    }
  },
});

const editSchema = z.object({
  path: z.string().min(1),
  oldText: z.string().min(1),
  newText: z.string(),
  replaceAll: z.boolean().optional(),
});

type EditResult =
  | {
      status: "success";
      summary: string;
      path: string;
      replacements: number;
    }
  | ToolFailurePayload;

export const editTool = createTool<z.infer<typeof editSchema>, EditResult>({
  description: "Edit a file by replacing text in the active lab sandbox.",
  args: editSchema,
  handler: async (ctx, args) => {
    try {
      const { sandboxId, workspacePath } = await getActiveSandbox(ctx);
      const result = await runLabRuntime<{
        path: string;
        replacements: number;
      }>(ctx, "editFile", {
        sandboxId,
        workspacePath,
        path: args.path,
        oldText: args.oldText,
        newText: args.newText,
        replaceAll: args.replaceAll,
      });

      return {
        status: "success",
        summary: `Updated ${result.path}.`,
        path: result.path,
        replacements: result.replacements,
      };
    } catch (error) {
      return failure("edit", error, {
        requestedPath: args.path,
      });
    }
  },
});

const listSchema = z.object({
  path: z.string().optional(),
});

type ListResult =
  | {
      status: "success";
      summary: string;
      path: string;
      entries: Array<{
        name: string;
        path: string;
        isDir: boolean;
        size: number;
        modTime: string;
      }>;
    }
  | ToolFailurePayload;

export const listTool = createTool<z.infer<typeof listSchema>, ListResult>({
  description: "List files and folders in the active lab sandbox.",
  args: listSchema,
  handler: async (ctx, args) => {
    try {
      const { sandboxId, workspacePath } = await getActiveSandbox(ctx);
      const result = await runLabRuntime<{
        path: string;
        entries: Array<{
          name: string;
          path: string;
          isDir: boolean;
          size: number;
          modTime: string;
        }>;
      }>(ctx, "listFiles", {
        sandboxId,
        workspacePath,
        path: args.path,
      });

      return {
        status: "success",
        summary: `Listed ${result.entries.length} entries in ${result.path}.`,
        path: result.path,
        entries: result.entries,
      };
    } catch (error) {
      return failure("list", error, {
        requestedPath: args.path,
      });
    }
  },
});
