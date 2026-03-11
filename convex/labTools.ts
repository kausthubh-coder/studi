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
  classifyDaytonaError,
  createSandbox,
  editFile,
  ensureSandboxStarted,
  formatErrorSummary,
  globFiles,
  grepFiles,
  listFiles,
  readFile,
  runCommand,
  truncateOutput,
  writeFile,
  type DaytonaToolError,
} from "./daytona";
import { capturePosthogEvent } from "./posthog";
import { resolveLabRuntime } from "../lib/lab-runtime/profiles";

const internalApi = internal as unknown as {
  billing: {
    assertCanCreateLabInternal: FunctionReference<"mutation", "internal">;
    assertCanRunExpensiveLabCommandInternal: FunctionReference<"mutation", "internal">;
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

type ToolFailurePayload = {
  status: "failed";
  summary: string;
  error: DaytonaToolError;
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
  const candidate = error as { data?: { message?: string; surface?: string } };
  if (
    candidate?.data &&
    typeof candidate.data.message === "string" &&
    candidate.data.message.length > 0
  ) {
    return {
      status: "failed",
      summary: candidate.data.message,
      error: {
        category: "invalid_request",
        message: candidate.data.message,
        retriable: false,
      },
      diagnostics,
    };
  }

  return {
    status: "failed",
    summary: formatErrorSummary(operation, error),
    error: classifyDaytonaError(error),
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

async function getActiveSandbox(ctx: {
  userId?: string;
  threadId?: string;
  runQuery: QueryRunner;
  runMutation: MutationRunner;
}): Promise<{
  sandboxId: string;
  userId: string;
  threadId: string;
}> {
  const { session, userId, threadId } = await getSessionForContext(ctx);
  if (!session) {
    throw new Error("No lab session in this thread.");
  }

  await ctx.runMutation(internalApi.billing.assertCanCreateLabInternal, {
    userId,
  });

  await ensureSandboxStarted(session.sandboxId);
  await touchSession(ctx, userId, threadId);

  return {
    sandboxId: session.sandboxId,
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

    try {
      await ctx.runMutation(internalApi.billing.assertCanCreateLabInternal, {
        userId,
      });

      const runtime = resolveLabRuntime({
        language: args.language,
        framework: args.framework,
      });
      const shouldCreateTrack = args.createTrack === true;
      const existing = (await ctx.runQuery(
        internal.labs.getLabSessionByThreadForUserInternal,
        {
          userId,
          threadId,
        },
      )) as LabSessionLookup["session"];

      let sandboxId: string;
      let reusedExisting = false;
      const existingProfileId = existing?.metadata?.runtimeProfileId;
      if (existing?.sandboxId) {
        sandboxId = existing.sandboxId;
        reusedExisting = true;
        await ensureSandboxStarted(sandboxId);
      } else {
        const created = await createSandbox({
          language: runtime.language,
          labels: {
            runtime_language: runtime.language,
            runtime_framework: runtime.framework,
            runtime_profile: runtime.runtimeProfileId,
            runtime_template: args.template,
          },
        });
        sandboxId = created.sandboxId;
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
          template: args.template?.trim() || undefined,
          runtimeProfileId: runtime.runtimeProfileId,
        },
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
          ? ` Reused existing sandbox runtime (${existingProfileId}).`
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
          inferredFromFramework: runtime.inferredFromFramework,
          createdTrack: shouldCreateTrack,
          reusedExisting,
          sandboxId,
        },
      });

      return {
        status: "active",
        summary: `Lab is active. I will now use sandbox tools directly and report exact command/file results.${runtimeNotice}`,
        sandboxId,
        metadata: {
          topic: args.topic,
          objective: args.objective,
          language: runtime.language,
          framework: runtime.framework,
          template: args.template?.trim() || undefined,
          runtimeProfileId: runtime.runtimeProfileId,
        },
      };
    } catch (error) {
      const detail = classifyDaytonaError(error);
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
          createTrack: args.createTrack,
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
      const { sandboxId } = await getActiveSandbox(ctx);
      const result = await readFile({
        sandboxId,
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
      const { sandboxId } = await getActiveSandbox(ctx);
      const result = await grepFiles({
        sandboxId,
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
      const { sandboxId } = await getActiveSandbox(ctx);
      const result = await globFiles({
        sandboxId,
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

      const { sandboxId } = await getActiveSandbox(ctx);
      const result = await runCommand({
        sandboxId,
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
      const detail = classifyDaytonaError(error);
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
      const { sandboxId } = await getActiveSandbox(ctx);
      const result = await writeFile({
        sandboxId,
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
      const { sandboxId } = await getActiveSandbox(ctx);
      const result = await editFile({
        sandboxId,
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
      const { sandboxId } = await getActiveSandbox(ctx);
      const result = await listFiles({
        sandboxId,
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
