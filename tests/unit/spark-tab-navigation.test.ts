import { describe, expect, it } from "vitest";
import { getNextSparkTabIndex } from "@/components/landing/spark-tab-navigation";

describe("getNextSparkTabIndex", () => {
  it("wraps arrow navigation across the tab list", () => {
    expect(getNextSparkTabIndex(0, "ArrowRight", 4)).toBe(1);
    expect(getNextSparkTabIndex(3, "ArrowRight", 4)).toBe(0);
    expect(getNextSparkTabIndex(0, "ArrowLeft", 4)).toBe(3);
  });

  it("supports Home and End", () => {
    expect(getNextSparkTabIndex(2, "Home", 4)).toBe(0);
    expect(getNextSparkTabIndex(1, "End", 4)).toBe(3);
  });

  it("leaves unrelated keys alone", () => {
    expect(getNextSparkTabIndex(2, "Enter", 4)).toBe(2);
  });
});
