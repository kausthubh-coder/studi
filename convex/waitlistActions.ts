"use node";

import { createClerkClient } from "@clerk/backend";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const internalApi = internal as unknown as {
  waitlist: {
    startSyncAttemptInternal: FunctionReference<"mutation", "internal">;
    markWaitlistSyncedInternal: FunctionReference<"mutation", "internal">;
    markWaitlistFailedInternal: FunctionReference<"mutation", "internal">;
  };
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

export const syncWaitlistEntry = internalAction({
  args: {
    eventDocId: v.id("waitlistWebhookEvents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    const attempt = await ctx.runMutation(
      internalApi.waitlist.startSyncAttemptInternal,
      {
        eventDocId: args.eventDocId,
        startedAt,
      },
    );

    if (!attempt.shouldProcess || !attempt.emailAddress) {
      return null;
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      await ctx.runMutation(internalApi.waitlist.markWaitlistFailedInternal, {
        eventDocId: args.eventDocId,
        error: "CLERK_SECRET_KEY is not configured",
        processedAt: Date.now(),
      });
      return null;
    }

    const clerk = createClerkClient({ secretKey: clerkSecretKey });

    try {
      const entry = await clerk.waitlistEntries.create({
        emailAddress: attempt.emailAddress,
      });

      await ctx.runMutation(internalApi.waitlist.markWaitlistSyncedInternal, {
        eventDocId: args.eventDocId,
        clerkWaitlistEntryId: entry.id,
        processedAt: Date.now(),
      });
    } catch (error) {
      await ctx.runMutation(internalApi.waitlist.markWaitlistFailedInternal, {
        eventDocId: args.eventDocId,
        error: toErrorMessage(error),
        processedAt: Date.now(),
      });
    }

    return null;
  },
});
