import { describe, expect, it } from "vitest";
import { getNextSettingsTabIndex } from "@/components/settings/settings-tab-navigation";

describe("settings tab keyboard navigation", () => {
  it("wraps arrows and supports Home and End", () => {
    expect(getNextSettingsTabIndex(0, "ArrowRight", 3)).toBe(1);
    expect(getNextSettingsTabIndex(2, "ArrowRight", 3)).toBe(0);
    expect(getNextSettingsTabIndex(0, "ArrowLeft", 3)).toBe(2);
    expect(getNextSettingsTabIndex(1, "Home", 3)).toBe(0);
    expect(getNextSettingsTabIndex(1, "End", 3)).toBe(2);
    expect(getNextSettingsTabIndex(1, "Enter", 3)).toBe(1);
  });
});
