import { describe, expect, test } from "bun:test";
import {
  normalizeLabPath,
  parseRipgrepMatches,
  toRelativeLabPath,
  truncateOutput,
} from "./lab-runtime/shared";

describe("normalizeLabPath", () => {
  test("resolves relative paths inside the stored workspace", () => {
    expect(normalizeLabPath("src/index.ts", "/project/sandbox")).toBe(
      "/project/sandbox/src/index.ts",
    );
    expect(normalizeLabPath(".", "/project/sandbox")).toBe("/project/sandbox");
  });

  test("accepts absolute paths inside the stored workspace", () => {
    expect(
      normalizeLabPath("/project/sandbox/src/index.ts", "/project/sandbox"),
    ).toBe("/project/sandbox/src/index.ts");
  });

  test("rejects traversal outside the stored workspace", () => {
    expect(() => normalizeLabPath("../etc/passwd", "/project/sandbox")).toThrow(
      "Path must stay inside the lab workspace.",
    );
    expect(() => normalizeLabPath("/etc/passwd", "/project/sandbox")).toThrow(
      "Path must stay inside the lab workspace.",
    );
  });
});

describe("toRelativeLabPath", () => {
  test("returns root for the workspace root", () => {
    expect(toRelativeLabPath("/project/sandbox", "/project/sandbox")).toBe(".");
  });

  test("returns relative file paths", () => {
    expect(
      toRelativeLabPath("/project/sandbox/src/index.ts", "/project/sandbox"),
    ).toBe("src/index.ts");
  });
});

describe("parseRipgrepMatches", () => {
  test("parses ripgrep output into structured matches", () => {
    expect(
      parseRipgrepMatches(
        "src/index.ts:12:const answer = 42;\nsrc/app.tsx:4:return <App />;",
        10,
      ),
    ).toEqual([
      {
        file: "src/index.ts",
        line: 12,
        content: "const answer = 42;",
      },
      {
        file: "src/app.tsx",
        line: 4,
        content: "return <App />;",
      },
    ]);
  });
});

describe("truncateOutput", () => {
  test("preserves short output and truncates long output", () => {
    expect(truncateOutput("short", 10)).toBe("short");
    expect(truncateOutput("abcdefghijklmnopqrstuvwxyz", 10)).toBe("abcdefghi...");
  });
});
