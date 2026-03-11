import { describe, expect, test } from "bun:test";
import { isPreviewablePort } from "./preview";

describe("isPreviewablePort", () => {
  test("accepts supported lab preview ports", () => {
    expect(isPreviewablePort(3000)).toBe(true);
    expect(isPreviewablePort(5173)).toBe(true);
    expect(isPreviewablePort(9999)).toBe(true);
  });

  test("rejects unsupported ports", () => {
    expect(isPreviewablePort(9229)).toBe(false);
    expect(isPreviewablePort(2999)).toBe(false);
    expect(isPreviewablePort(10000)).toBe(false);
  });
});
