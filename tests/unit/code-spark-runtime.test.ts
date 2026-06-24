import { describe, expect, it } from "vitest";
import {
  buildCodeSparkRuntimeFiles,
  getCodeSparkPrimaryFile,
} from "@/lib/sparks/code-runtime";
import type { CodePlaygroundPayload } from "@/lib/sparks/contracts";

describe("code spark runtime UI helpers", () => {
  it("uses starterCode as the default primary file when no file list exists", () => {
    const payload: CodePlaygroundPayload = {
      language: "python",
      instructions: "Run it.",
      starterCode: "print('old')",
      runCommand: "python main.py",
    };

    expect(getCodeSparkPrimaryFile(payload)).toBe("main.py");
    expect(buildCodeSparkRuntimeFiles(payload, "print('new')")).toEqual({
      primaryFile: "main.py",
      files: [{ path: "main.py", content: "print('new')" }],
    });
  });

  it("overwrites only the primary file before lab handoff", () => {
    const payload: CodePlaygroundPayload = {
      language: "javascript",
      instructions: "Run it.",
      starterCode: "console.log(answer)",
      starterFiles: [
        { path: "main.js", content: "console.log('old')" },
        { path: "helper.js", content: "export const answer = 42;" },
      ],
      primaryFile: "main.js",
      runCommand: "node main.js",
    };

    expect(buildCodeSparkRuntimeFiles(payload, "console.log('new')")).toEqual({
      primaryFile: "main.js",
      files: [
        { path: "main.js", content: "console.log('new')" },
        { path: "helper.js", content: "export const answer = 42;" },
      ],
    });
  });
});
