import { describe, expect, test } from "bun:test";
import { extractPreviewPortCandidates, isPreviewablePort } from "./preview";

describe("isPreviewablePort", () => {
  test("accepts Daytona preview ports", () => {
    expect(isPreviewablePort(3000)).toBe(true);
    expect(isPreviewablePort(5173)).toBe(true);
    expect(isPreviewablePort(9999)).toBe(true);
  });

  test("rejects unsupported ports", () => {
    expect(isPreviewablePort(22222)).toBe(false);
    expect(isPreviewablePort(2999)).toBe(false);
    expect(isPreviewablePort(10000)).toBe(false);
  });
});

describe("extractPreviewPortCandidates", () => {
  test("detects common localhost urls", () => {
    expect(
      extractPreviewPortCandidates(
        "Local: http://127.0.0.1:5173\nNetwork: http://0.0.0.0:5173",
      ),
    ).toEqual([5173]);
  });

  test("detects textual port declarations", () => {
    expect(extractPreviewPortCandidates("Server ready on port 3000")).toEqual([
      3000,
    ]);
  });

  test("ignores unsupported ports", () => {
    expect(
      extractPreviewPortCandidates(
        "Debugger port 9229\nTerm link 22222\nLegacy server localhost:80800",
      ),
    ).toEqual([]);
  });
});
