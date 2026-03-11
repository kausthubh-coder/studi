import { v } from "convex/values";
import type { FunctionReference } from "convex/server";
import { action, internalMutation } from "./_generated/server";

const internalApi = {
  labAdmin: {
    resetLegacyLabSessionsInternal:
      "labAdmin:resetLegacyLabSessionsInternal" as unknown as FunctionReference<
        "mutation",
        "internal"
      >,
  },
};

export const resetLegacyLabSessionsInternal = internalMutation({
  args: {},
  returns: v.object({
    deletedCount: v.number(),
  }),
  handler: async (ctx) => {
    const sessions = await ctx.db.query("labSessions").collect();

    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    return {
      deletedCount: sessions.length,
    };
  },
});

export const resetLegacyLabSessions = action({
  args: {
    token: v.string(),
  },
  returns: v.object({
    deletedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const expectedToken = process.env.LAB_MIGRATION_TOKEN?.trim();
    if (!expectedToken) {
      throw new Error(
        "LAB_MIGRATION_TOKEN must be configured before running the legacy lab reset.",
      );
    }

    if (args.token !== expectedToken) {
      throw new Error("Unauthorized");
    }

    return await ctx.runMutation(
      internalApi.labAdmin.resetLegacyLabSessionsInternal,
      {},
    );
  },
});
