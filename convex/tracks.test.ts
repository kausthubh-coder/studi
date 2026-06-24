import { register as registerAgent } from "@convex-dev/agent/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

function testConvex() {
  const t = convexTest(schema, modules);
  registerAgent(t);
  registerRateLimiter(t);
  return t;
}

const draftTrack = {
  title: "Calculus foundations",
  summary: "Build an intuition-first path to derivatives.",
  milestones: [
    {
      title: "Slope before symbols",
      items: [
        {
          id: "notice-slope",
          title: "Notice slope",
          summary: "Compare two tiny line segments.",
        },
        {
          id: "explain-limit",
          title: "Explain the limit",
          summary: "Say why shrinking the interval helps.",
        },
      ],
    },
  ],
};

describe("learning tracks Convex API", () => {
  it("requires ownership for thread track reads", async () => {
    const t = testConvex();

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Calculus",
      lastMessageAt: 1,
    });
    await t.mutation(internal.tracks.upsertDraftTrackInternal, {
      userId: "user_a",
      threadId: "thread_a",
      draftTrack,
    });

    await expect(
      t.query(api.tracks.getThreadTrack, { threadId: "thread_a" }),
    ).rejects.toThrow("Unauthorized");

    await expect(
      t
        .withIdentity({ subject: "user_b" })
        .query(api.tracks.getThreadTrack, { threadId: "thread_a" }),
    ).rejects.toThrow("Thread not found");

    const track = await t
      .withIdentity({ subject: "user_a" })
      .query(api.tracks.getThreadTrack, { threadId: "thread_a" });

    expect(track).toMatchObject({
      phase: "draft_review",
      revision: 1,
      draftTrack: {
        title: "Calculus foundations",
      },
    });
  });

  it("accepts a draft and marks item progress", async () => {
    const t = testConvex();

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Calculus",
      lastMessageAt: 1,
    });
    const draft = await t.mutation(internal.tracks.upsertDraftTrackInternal, {
      userId: "user_a",
      threadId: "thread_a",
      draftTrack,
    });

    const authed = t.withIdentity({ subject: "user_a" });
    const accepted = await authed.mutation(api.tracks.acceptDraft, {
      trackId: draft._id,
    });

    expect(accepted.phase).toBe("active");
    expect(accepted.acceptedTrack?.milestones[0]?.items[0]?.status).toBe(
      "active",
    );

    const firstItemId = accepted.acceptedTrack!.milestones[0]!.items[0]!.id;
    const updated = await authed.mutation(api.tracks.markItem, {
      trackId: draft._id,
      itemId: firstItemId,
      status: "completed",
    });

    expect(updated.progress.completedItemIds).toEqual([firstItemId]);
    expect(updated.acceptedTrack?.milestones[0]?.items[0]?.status).toBe(
      "completed",
    );
    expect(updated.acceptedTrack?.milestones[0]?.items[1]?.status).toBe(
      "active",
    );
  });

  it("supports revision requests and revised drafts", async () => {
    const t = testConvex();

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Calculus",
      lastMessageAt: 1,
    });
    const first = await t.mutation(internal.tracks.upsertDraftTrackInternal, {
      userId: "user_a",
      threadId: "thread_a",
      draftTrack,
    });

    const revision = await t
      .withIdentity({ subject: "user_a" })
      .mutation(api.tracks.requestRevision, {
        trackId: first._id,
        note: "Make it shorter.",
      });

    expect(revision.phase).toBe("discovery");
    expect(revision.revisionNote).toBe("Make it shorter.");

    const second = await t.mutation(internal.tracks.upsertDraftTrackInternal, {
      userId: "user_a",
      threadId: "thread_a",
      draftTrack: {
        ...draftTrack,
        title: "Short calculus track",
      },
      revisionNote: "Make it shorter.",
    });

    expect(second.phase).toBe("draft_review");
    expect(second.revision).toBe(2);
    expect(second.draftTrack?.title).toBe("Short calculus track");
  });
});

