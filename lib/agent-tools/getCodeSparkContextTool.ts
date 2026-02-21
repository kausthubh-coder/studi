"use node";

import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../convex/_generated/api";

const getCodeSparkContextSchema = z.object({
  threadId: z
    .string()
    .optional()
    .describe("Optional thread id override. Defaults to current thread."),
  focus: z
    .string()
    .optional()
    .describe(
      "Optional note on what you want to inspect in the latest attempts.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe("Maximum number of recent code spark attempts to retrieve."),
});

type GetCodeSparkContextResult = {
  status: "success" | "empty" | "failed";
  summary: string;
  attempts: Array<{
    sparkInstanceId: string;
    sparkTitle?: string;
    language?: string;
    runCount: number;
    lastStatus: "idle" | "success" | "error";
    lastRunAt?: number;
    codeSnippet?: string;
    lastStdoutSnippet?: string;
    lastErrorSnippet?: string;
  }>;
};

type CodeSparkContextRow = {
  sparkInstanceId: string;
  sparkTitle?: string;
  language?: string;
  code?: string;
  runCount: number;
  lastStatus: "idle" | "success" | "error";
  lastRunAt?: number;
  lastStdout?: string;
  lastError?: string;
};

function trimSnippet(
  value: string | undefined,
  maxLength: number,
): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

export const getCodeSparkContextTool = createTool<
  z.infer<typeof getCodeSparkContextSchema>,
  GetCodeSparkContextResult
>({
  description:
    "Read the learner's latest code spark edits and run outputs in this thread.",
  args: getCodeSparkContextSchema,
  handler: async (ctx, args) => {
    const userId = ctx.userId;
    const threadId = args.threadId ?? ctx.threadId;

    if (!userId || !threadId) {
      return {
        status: "failed",
        summary:
          "Code spark context is unavailable without user/thread context.",
        attempts: [],
      };
    }

    const rows = await ctx.runQuery(
      internal.sparkFeedback.getRecentCodeSparkContextInternal,
      {
        userId,
        threadId,
        limit: args.limit ?? 3,
      },
    );

    if (rows.length === 0) {
      return {
        status: "empty",
        summary: "No code spark attempts found for this thread yet.",
        attempts: [],
      };
    }

    const attempts = (rows as CodeSparkContextRow[]).map((row) => ({
      sparkInstanceId: row.sparkInstanceId,
      sparkTitle: row.sparkTitle,
      language: row.language,
      runCount: row.runCount,
      lastStatus: row.lastStatus,
      lastRunAt: row.lastRunAt,
      codeSnippet: trimSnippet(row.code, 700),
      lastStdoutSnippet: trimSnippet(row.lastStdout, 320),
      lastErrorSnippet: trimSnippet(row.lastError, 320),
    }));

    const focusSuffix =
      args.focus && args.focus.trim().length > 0
        ? ` Focus requested: ${args.focus.trim().slice(0, 140)}.`
        : "";

    return {
      status: "success",
      summary: `Loaded ${attempts.length} recent code spark attempt(s).${focusSuffix}`,
      attempts,
    };
  },
});
