import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  TrackCard,
  summarizeTrackProgress,
  type ThreadTrackRecord,
} from "./TrackCard";

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

  it("shows revised drafts while an accepted track is under review", () => {
    const track = {
      _id: "track_1",
      phase: "draft_review",
      revision: 3,
      progress: {
        completedItemIds: ["old-step"],
        skippedItemIds: [],
        updatedAt: 1,
      },
      acceptedTrack: {
        title: "Accepted path",
        summary: "The previous plan.",
        milestones: [
          {
            id: "old",
            title: "Old",
            items: [
              {
                id: "old-step",
                title: "Old step",
                status: "completed",
                linkedActivities: [],
              },
            ],
          },
        ],
      },
      draftTrack: {
        title: "Revised path",
        summary: "The new plan to review.",
        milestones: [
          {
            id: "new",
            title: "New",
            items: [
              {
                id: "new-step",
                title: "New step",
                status: "pending",
                linkedActivities: [],
              },
            ],
          },
        ],
      },
    } as unknown as ThreadTrackRecord;

    expect(summarizeTrackProgress(track)).toEqual({
      completed: 0,
      total: 1,
      label: "0/1 done",
    });

    render(<TrackCard track={track} />);

    expect(screen.getByRole("heading", { name: "Revised path" })).toBeTruthy();
    expect(screen.queryByText("Accepted path")).toBeNull();
  });
});
