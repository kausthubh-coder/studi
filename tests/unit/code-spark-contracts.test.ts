import { describe, expect, it } from "vitest";
import {
  isSparkArtifact,
  isSparkType,
  normalizeCodeSparkDraft,
  normalizeCreateSparkInput,
  sparkSceneVersion,
  sparkTypes,
  validateCodeSparkPayload,
  type CodeSparkDraft,
  type CreateSparkToolInput,
} from "@/lib/sparks/contracts";

const starterDraft: CodeSparkDraft = {
  title: "Sum two numbers",
  summary: "Practice a tiny function with visible checks.",
  payload: {
    mode: "challenge",
    language: "typescript",
    instructions: "Make add(a, b) return the sum.",
    files: [
      {
        path: "src/add.ts",
        language: "typescript",
        contents: "export function add(a: number, b: number) { return 0; }",
        editable: true,
        role: "starter",
      },
      {
        path: "tests/add.test.ts",
        language: "typescript",
        contents: "import { add } from '../src/add';",
        editable: false,
        role: "test",
      },
    ],
    tests: [
      {
        id: "visible-add",
        label: "adds two positive numbers",
        command: "node tests/add.check.ts",
        hidden: false,
      },
      {
        id: "hidden-negative",
        label: "handles negatives",
        command: "node tests/hidden.check.ts",
        hidden: true,
      },
    ],
  },
};

describe("Code/Test Spark contracts", () => {
  it("adds code and test as first-class spark types", () => {
    expect(sparkTypes).toEqual([
      "scene",
      "quiz",
      "flash_card",
      "desmos_graph",
      "code",
      "test",
    ]);
    expect(isSparkType("code")).toBe(true);
    expect(isSparkType("test")).toBe(true);
  });

  it("normalizes create_spark inputs for code/test sparks", () => {
    expect(
      normalizeCreateSparkInput({
        sparkId: "code",
        context: "Create a Python workspace for loops.",
      } as CreateSparkToolInput).sparkId,
    ).toBe("code");
    expect(
      normalizeCreateSparkInput({
        sparkId: "test",
        context: "Create a failing TypeScript challenge.",
      } as CreateSparkToolInput).sparkId,
    ).toBe("test");
  });

  it("normalizes Code Spark artifacts to visible checks only", () => {
    const artifact = normalizeCodeSparkDraft(starterDraft, "code");

    expect(artifact).toMatchObject({
      kind: "spark_code",
      version: sparkSceneVersion,
      sparkType: "code",
      mode: "editable",
      title: "Sum two numbers",
    });
    expect(artifact.payload.files.map((file) => file.path)).toEqual([
      "src/add.ts",
      "tests/add.test.ts",
    ]);
    expect(artifact.payload.tests).toEqual([
      {
        id: "visible-add",
        label: "adds two positive numbers",
        command: "node tests/add.check.ts",
        hidden: false,
      },
    ]);
    expect(artifact.payload.hiddenTestCount).toBe(0);
    expect(JSON.stringify(artifact.payload.tests)).not.toContain(
      "expect(add(-2, -3)).toBe(-5)",
    );
    expect(isSparkArtifact(artifact)).toBe(true);
  });

  it("validates supported languages and blocks unsafe paths", () => {
    const artifact = normalizeCodeSparkDraft(starterDraft, "test");
    expect(validateCodeSparkPayload(artifact.payload).ok).toBe(true);

    const invalid = validateCodeSparkPayload({
      ...artifact.payload,
      files: [
        {
          path: "../secret.env",
          language: "python",
          contents: "print('nope')",
          editable: true,
          role: "starter",
        },
      ],
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join("\n")).toMatch(/unsafe path/i);
  });

  it("rejects hidden checks and hidden test files in v1 validation", () => {
    const artifact = normalizeCodeSparkDraft(starterDraft, "test");
    const invalid = validateCodeSparkPayload({
      ...artifact.payload,
      files: [
        ...artifact.payload.files,
        {
          path: "tests/secret.check.ts",
          language: "typescript",
          contents: "console.log('secret')",
          editable: false,
          role: "hidden_test",
        },
      ],
      tests: [
        ...artifact.payload.tests,
        {
          id: "secret",
          label: "secret check",
          command: "node tests/secret.check.ts",
          hidden: true,
        },
      ],
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join("\n")).toMatch(/visible checks/i);
  });

  it("supports dependency-free TypeScript visible checks for provider bootstrap", () => {
    const artifact = normalizeCodeSparkDraft(
      {
        title: "Add numbers",
        payload: {
          mode: "challenge",
          language: "typescript",
          instructions: "Fix add().",
          activePath: "src/add.ts",
          files: [
            {
              path: "src/add.ts",
              language: "typescript",
              contents:
                "export function add(a: number, b: number): number { return 0; }",
              editable: true,
              role: "starter",
            },
            {
              path: "tests/add.check.ts",
              language: "typescript",
              contents:
                "import { add } from '../src/add.ts';\nif (add(2, 3) !== 5) throw new Error('Expected 5');",
              editable: false,
              role: "test",
            },
          ],
          tests: [
            {
              id: "visible-add",
              label: "adds visible values",
              command: "node tests/add.check.ts",
              hidden: false,
            },
          ],
          runCommand: "node tests/add.check.ts",
          testCommand: "node tests/add.check.ts",
        },
      },
      "test",
    );

    expect(artifact.payload.testCommand).toBe("node tests/add.check.ts");
    expect(JSON.stringify(artifact.payload)).not.toContain("vitest");
    expect(validateCodeSparkPayload(artifact.payload).ok).toBe(true);
  });
});
