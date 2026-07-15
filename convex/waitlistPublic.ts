"use node";

import { createClerkClient } from "@clerk/backend";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { enforcePublicWaitlistRateLimit } from "./rateLimits";

const MAX_EMAIL_LENGTH = 254;
const MAX_EMAIL_LOCAL_LENGTH = 64;
const MAX_EMAIL_DOMAIN_LENGTH = 253;
const MAX_DOMAIN_LABEL_LENGTH = 63;
const LOCAL_PART_PATTERN = /^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function normalizeEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized || normalized.length > MAX_EMAIL_LENGTH) {
    return null;
  }

  const separator = normalized.indexOf("@");
  if (separator <= 0 || separator !== normalized.lastIndexOf("@")) {
    return null;
  }

  const local = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  if (
    local.length > MAX_EMAIL_LOCAL_LENGTH ||
    domain.length === 0 ||
    domain.length > MAX_EMAIL_DOMAIN_LENGTH ||
    !LOCAL_PART_PATTERN.test(local) ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    return null;
  }

  const labels = domain.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > MAX_DOMAIN_LABEL_LENGTH ||
        !DOMAIN_LABEL_PATTERN.test(label),
    )
  ) {
    return null;
  }

  return normalized;
}

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
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { email }) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return { success: false, error: "Please enter a valid email address." };
    }

    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    if (!clerkSecretKey) {
      return { success: false, error: "Service not configured. Please try again later." };
    }

    const rateLimit = await enforcePublicWaitlistRateLimit(ctx);
    if (!rateLimit.ok) {
      return {
        success: false,
        error: "Too many signup attempts right now. Please wait a moment and try again.",
      };
    }

    const clerk = createClerkClient({ secretKey: clerkSecretKey });

    try {
      await clerk.waitlistEntries.create({ emailAddress: normalizedEmail });
      return { success: true };
    } catch (error) {
      const message = toErrorMessage(error);
      // Clerk throws when the email is already on the waitlist
      if (message.toLowerCase().includes("already") || message.toLowerCase().includes("duplicate")) {
        return { success: true };
      }
      return { success: false, error: "Something went wrong. Please try again." };
    }
  },
});
