"use node";

import { createTool } from "@convex-dev/agent";
import type { FunctionReference } from "convex/server";
import { z } from "zod";
import {
  type CreateWarningToolResult,
  type VoiceWarningReason,
} from "../lib/voice/contracts";
import { internal } from "./_generated/api";
import { capturePosthogEvent } from "./posthog";

const internalApi = internal as unknown as {
  telemetry: {
    insertTelemetryEventInternal: FunctionReference<"mutation", "internal">;
  };
};

const createWarningSchema = z.object({
  reason: z.enum(["lab_required", "plan_required", "long_term", "long_lesson"]),
  title: z.string().optional(),
  message: z.string().optional(),
  ctaLabel: z.string().optional(),
  suggestedPrompt: z.string().optional(),
});

function getDefaultWarningCopy(reason: VoiceWarningReason): {
  title: string;
  message: string;
  ctaLabel: string;
} {
  if (reason === "lab_required") {
    return {
      title: "Switch to text for Labs",
      message:
        "Lab workflows are disabled in voice mode. Switch to text and I can open a lab workspace for this thread.",
      ctaLabel: "Switch to text",
    };
  }

  if (reason === "plan_required") {
    return {
      title: "Switch to text for Plans",
      message:
        "Track planning and long roadmap setup are disabled in voice mode. Switch to text and I can build the plan with you.",
      ctaLabel: "Switch to text",
    };
  }

  if (reason === "long_term") {
    return {
      title: "Use text for long-term goals",
      message:
        "This request needs a longer planning flow. Switch to text so we can set up a proper track and milestones.",
      ctaLabel: "Switch to text",
    };
  }

  return {
    title: "Use text for long lessons",
    message:
      "Long-form lesson design works better in text mode. Switch to text and I will structure it step-by-step.",
    ctaLabel: "Switch to text",
  };
}

export const createWarningTool = createTool({
  description:
    "Show a voice-mode warning that asks the learner to switch back to text chat.",
  args: createWarningSchema,
  handler: async (ctx, args): Promise<CreateWarningToolResult> => {
    const startedAt = Date.now();
    const defaults = getDefaultWarningCopy(args.reason);

    const result: CreateWarningToolResult = {
      status: "warning",
      warningType: "switch_to_text",
      reason: args.reason,
      title: args.title?.trim() || defaults.title,
      message: args.message?.trim() || defaults.message,
      ctaLabel: args.ctaLabel?.trim() || defaults.ctaLabel,
      suggestedPrompt: args.suggestedPrompt?.trim() || undefined,
    };

    if (ctx.userId) {
      await ctx
        .runMutation(internalApi.telemetry.insertTelemetryEventInternal, {
          userId: ctx.userId,
          threadId: ctx.threadId,
          source: "voice",
          name: "create_warning",
          status: "success",
          durationMs: Date.now() - startedAt,
          metadata: {
            reason: result.reason,
            warningType: result.warningType,
            suggestedPrompt: result.suggestedPrompt,
          },
        })
        .catch((error) => {
          console.error("Failed to store voice warning telemetry", error);
        });

      await capturePosthogEvent({
        event: "voice_warning_created",
        distinctId: ctx.userId,
        properties: {
          thread_id: ctx.threadId,
          reason: result.reason,
          warning_type: result.warningType,
        },
      });
    }

    return result;
  },
});
