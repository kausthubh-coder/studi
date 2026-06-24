import { saveMessage } from "@convex-dev/agent";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import {
  defaultRealtimeVoiceModel,
  type VoicePersistedTurn,
} from "../lib/voice-runtime/contracts";

const internalApi = internal as unknown as {
  chat: {
    touchThread: FunctionReference<"mutation", "internal">;
  };
};

const voicePersistedTurnValidator = v.object({
  role: v.union(v.literal("user"), v.literal("assistant")),
  text: v.string(),
  providerItemId: v.optional(v.string()),
  providerEventId: v.optional(v.string()),
  startedAt: v.optional(v.number()),
  committedAt: v.optional(v.number()),
});

function definedMetadata(
  values: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  );
}

function metadataForTurn(
  sessionId: string,
  turn: VoicePersistedTurn,
): {
  model: string;
  provider: string;
  providerMetadata: Record<string, Record<string, unknown>>;
} {
  return {
    model: defaultRealtimeVoiceModel,
    provider: "openai_realtime",
    providerMetadata: {
      studi: definedMetadata({
        source: "voice_transcript",
        sessionId,
        providerItemId: turn.providerItemId,
        providerEventId: turn.providerEventId,
        startedAt: turn.startedAt,
        committedAt: turn.committedAt,
      }),
    },
  };
}

export const persistVoiceTranscript = mutation({
  args: {
    threadId: v.string(),
    sessionId: v.string(),
    turns: v.array(voicePersistedTurnValidator),
  },
  returns: v.object({
    persistedCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const userId = identity.subject;
    const voiceSession = await ctx.db
      .query("voiceSessions")
      .withIndex("by_clientSessionId", (q) =>
        q.eq("clientSessionId", args.sessionId),
      )
      .unique();

    if (
      !voiceSession ||
      voiceSession.userId !== userId ||
      voiceSession.threadId !== args.threadId
    ) {
      throw new Error("Voice session not found");
    }

    let persistedCount = 0;
    for (const turn of args.turns) {
      const text = turn.text.trim();
      if (!text) {
        continue;
      }

      await saveMessage(ctx, components.agent, {
        threadId: args.threadId,
        userId,
        agentName: turn.role === "assistant" ? "studi-voice" : undefined,
        message: {
          role: turn.role,
          content: [{ type: "text", text }],
        },
        metadata: metadataForTurn(args.sessionId, turn),
      });
      persistedCount += 1;
    }

    const now = Date.now();
    await ctx.db.patch(voiceSession._id, {
      status: "ended",
      endedAt: now,
    });
    await ctx.runMutation(internalApi.chat.touchThread, {
      userId,
      threadId: args.threadId,
      lastMessageAt: now,
    });

    return { persistedCount };
  },
});

export const recordVoiceSessionCreated = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    provider: v.literal("openai_realtime"),
    model: v.string(),
    clientSessionId: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("voiceSessions", {
      userId: args.userId,
      threadId: args.threadId,
      provider: args.provider,
      model: args.model,
      status: "created",
      clientSessionId: args.clientSessionId,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
    return null;
  },
});
