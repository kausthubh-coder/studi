"use node";

import { createClerkClient } from "@clerk/backend";
import { v } from "convex/values";
import { action } from "./_generated/server";

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

export const joinWaitlist = action({
  args: {
    email: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    alreadyOnList: v.optional(v.boolean()),
    error: v.optional(v.string()),
  }),
  handler: async (_ctx, { email }) => {
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      return { success: false, error: "Service not configured. Please try again later." };
    }

    const clerk = createClerkClient({ secretKey: clerkSecretKey });

    try {
      await clerk.waitlistEntries.create({ emailAddress: email });
      return { success: true };
    } catch (error) {
      const message = toErrorMessage(error);
      // Clerk throws when the email is already on the waitlist
      if (message.toLowerCase().includes("already") || message.toLowerCase().includes("duplicate")) {
        return { success: true, alreadyOnList: true };
      }
      return { success: false, error: "Something went wrong. Please try again." };
    }
  },
});
