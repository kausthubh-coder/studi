import { describe, expect, it } from "vitest";
import { summarizeTrackProgress, type ThreadTrackRecord } from "./TrackCard";

describe("summarizeTrackProgress", () => {
  it("counts completed items from the current track", () => {
    const track = {
      _id: "track_1",
      phase: "active",
      revision: 2,
      progress: {
        completedItemIds: ["step-one"],
        skippedItemIds: [],
        updatedAt: 1,
      },
      acceptedTrack: {
        title: "Derivatives",
        summary: "Build slope intuition.",
        milestones: [
          {
            id: "intuition",
            title: "Intuition",
            items: [
              {
                id: "step-one",
                title: "Slope",
                status: "completed",
                linkedActivities: [],
              },
              {
                id: "step-two",
                title: "Limit",
                status: "active",
                linkedActivities: [],
              },
            ],
          },
        ],
      },
    } as unknown as ThreadTrackRecord;

    expect(summarizeTrackProgress(track)).toEqual({
      completed: 1,
      total: 2,
      label: "1/2 done",
    });
  });
});
