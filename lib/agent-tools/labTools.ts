"use node";

import { createTool } from "@convex-dev/agent";
import type { FunctionReference } from "convex/server";
import { z } from "zod";
import { api } from "../../convex/_generated/api";

const labActionsApi = api as unknown as {
  labActions: {
    createLab: FunctionReference<"action">;
    listFiles: FunctionReference<"action">;
    readFile: FunctionReference<"action">;
    writeFile: FunctionReference<"action">;
    runCommand: FunctionReference<"action">;
    search: FunctionReference<"action">;
    getPreview: FunctionReference<"action">;
  };
};

const labLanguageSchema = z.enum(["python", "javascript", "typescript"]);

function unavailable(message: string) {
  return {
    status: "failed" as const,
    summary: message,
  };
}

export const createLabTool = createTool({
  description:
    "Create a persistent code lab for this learning thread. Use it when the learner needs real files, commands, or a preview server.",
  args: z.object({
    threadId: z.string().optional().describe("Defaults to the current thread."),
    title: z.string().optional(),
    language: labLanguageSchema.optional(),
  }),
  handler: async (ctx, args) => {
    const threadId = args.threadId ?? ctx.threadId;
    if (!ctx.userId || !threadId) {
      return unavailable("Cannot create a lab without user and thread context.");
    }

    const lab = await ctx.runAction(labActionsApi.labActions.createLab, {
      threadId,
      title: args.title,
      language: args.language,
    });

    return {
      status: "success" as const,
      summary: `Created lab ${lab._id}.`,
      lab,
    };
  },
});

export const listLabFilesTool = createTool({
  description:
    "List files in a lab directory. Use after create_lab or when a labSessionId is known.",
  args: z.object({
    labSessionId: z.string(),
    path: z.string().optional().describe("Directory path. Defaults to workspace root."),
  }),
  handler: async (ctx, args) => {
    if (!ctx.userId) return unavailable("Cannot list lab files without user context.");
    const files = await ctx.runAction(labActionsApi.labActions.listFiles, {
      labSessionId: args.labSessionId,
      path: args.path,
    });
    return {
      status: "success" as const,
      summary: `Found ${files.length} item(s).`,
      files,
    };
  },
});

export const readLabFileTool = createTool({
  description: "Read a text file from a lab.",
  args: z.object({
    labSessionId: z.string(),
    path: z.string(),
  }),
  handler: async (ctx, args) => {
    if (!ctx.userId) return unavailable("Cannot read lab files without user context.");
    const content = await ctx.runAction(labActionsApi.labActions.readFile, {
      labSessionId: args.labSessionId,
      path: args.path,
    });
    return {
      status: "success" as const,
      summary: `Read ${args.path}.`,
      path: args.path,
      content,
    };
  },
});

export const writeLabFileTool = createTool({
  description: "Write a text file into a lab, creating parent folders as needed.",
  args: z.object({
    labSessionId: z.string(),
    path: z.string(),
    content: z.string(),
  }),
  handler: async (ctx, args) => {
    if (!ctx.userId) return unavailable("Cannot write lab files without user context.");
    await ctx.runAction(labActionsApi.labActions.writeFile, {
      labSessionId: args.labSessionId,
      path: args.path,
      content: args.content,
    });
    return {
      status: "success" as const,
      summary: `Wrote ${args.path}.`,
      path: args.path,
    };
  },
});

export const runLabCommandTool = createTool({
  description:
    "Run a shell command in a lab and return stdout/stderr. Keep commands focused and explain destructive commands before using them.",
  args: z.object({
    labSessionId: z.string(),
    command: z.string(),
    cwd: z.string().optional(),
    timeoutSec: z.number().int().min(1).max(120).optional(),
  }),
  handler: async (ctx, args) => {
    if (!ctx.userId) return unavailable("Cannot run lab commands without user context.");
    const result = await ctx.runAction(labActionsApi.labActions.runCommand, {
      labSessionId: args.labSessionId,
      command: args.command,
      cwd: args.cwd,
      timeoutSec: args.timeoutSec,
    });
    return {
      status: result.exitCode === 0 ? ("success" as const) : ("failed" as const),
      summary: `Command exited with code ${result.exitCode ?? "unknown"}.`,
      result,
    };
  },
});

export const searchLabTool = createTool({
  description: "Search lab files for text.",
  args: z.object({
    labSessionId: z.string(),
    query: z.string(),
    path: z.string().optional(),
  }),
  handler: async (ctx, args) => {
    if (!ctx.userId) return unavailable("Cannot search lab files without user context.");
    const matches = await ctx.runAction(labActionsApi.labActions.search, {
      labSessionId: args.labSessionId,
      query: args.query,
      path: args.path,
    });
    return {
      status: "success" as const,
      summary: `Found ${matches.length} match(es).`,
      matches,
    };
  },
});

export const getLabPreviewTool = createTool({
  description:
    "Create or retrieve a browser preview link for a lab server port, such as 3000 or 5173.",
  args: z.object({
    labSessionId: z.string(),
    port: z.number().int().min(1).max(65535),
  }),
  handler: async (ctx, args) => {
    if (!ctx.userId) return unavailable("Cannot create lab previews without user context.");
    const preview = await ctx.runAction(labActionsApi.labActions.getPreview, {
      labSessionId: args.labSessionId,
      port: args.port,
    });
    return {
      status: "success" as const,
      summary: `Preview ready on port ${args.port}.`,
      preview,
    };
  },
});

export function buildLabToolset() {
  return {
    create_lab: createLabTool,
    list_lab_files: listLabFilesTool,
    read_lab_file: readLabFileTool,
    write_lab_file: writeLabFileTool,
    run_lab_command: runLabCommandTool,
    search_lab: searchLabTool,
    get_lab_preview: getLabPreviewTool,
  };
}
