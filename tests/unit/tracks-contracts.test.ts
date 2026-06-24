import { describe, expect, it } from "vitest";
import {
  applyProgressToTrack,
  isTrackComplete,
  normalizeLearningTrackDraft,
  normalizeTrackProgress,
} from "@/lib/tracks/contracts";

describe("track contracts", () => {
  it("normalizes underspecified drafts into stable learning tracks", () => {
    const track = normalizeLearningTrackDraft({
      title: "  Algebra rescue path  ",
      summary: " ".repeat(4),
      milestones: [
        {
          title: "Linear equations",
          items: [
            { title: "  Balance both sides  " },
            { title: "Balance both sides" },
          ],
        },
      ],
    });

    expect(track.title).toBe("Algebra rescue path");
    expect(track.summary).toBe("A focused path for this thread.");
    expect(track.milestones).toHaveLength(1);
    expect(track.milestones[0]?.items.map((item) => item.id)).toEqual([
      "balance-both-sides",
      "balance-both-sides-2",
    ]);
    expect(track.milestones[0]?.items[0]?.status).toBe("pending");
  });

  it("falls back to a usable starter path", () => {
    const track = normalizeLearningTrackDraft({
      title: "",
      summary: "Learn derivatives from first principles.",
      milestones: [],
    });

    expect(track.title).toBe("Learning track");
    expect(track.milestones[0]?.items).toHaveLength(3);
  });

  it("derives progress and item statuses deterministically", () => {
    const track = normalizeLearningTrackDraft({
      title: "Loops",
      summary: "Understand loops.",
      milestones: [
        {
          title: "Practice",
          items: [{ title: "Trace" }, { title: "Write" }],
        },
      ],
    });
    const firstItem = track.milestones[0]!.items[0]!.id;
    const secondItem = track.milestones[0]!.items[1]!.id;

    const progress = normalizeTrackProgress(track, {
      completedItemIds: [firstItem, "missing"],
      skippedItemIds: [],
    });
    const updated = applyProgressToTrack(track, progress);

    expect(progress.currentItemId).toBe(secondItem);
    expect(updated.milestones[0]?.items[0]?.status).toBe("completed");
    expect(updated.milestones[0]?.items[1]?.status).toBe("active");
    expect(isTrackComplete(track, progress)).toBe(false);

    const completeProgress = normalizeTrackProgress(track, {
      completedItemIds: [firstItem, secondItem],
      skippedItemIds: [],
    });
    expect(isTrackComplete(track, completeProgress)).toBe(true);
  });
});

