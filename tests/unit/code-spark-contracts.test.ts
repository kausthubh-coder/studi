import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  codeSparkPythonCheckSource,
  codeSparkPythonStarterSource,
  deriveCodeSparkLearnerRunCommand,
  isCreateSparkToolResult,
  isPrivateCodeSparkPath,
  isSparkArtifact,
  isSparkType,
  inferCodeSparkModeFromContext,
  normalizeCodeSparkDraft,
  normalizeCreateSparkInput,
  projectCodeSparkArtifactForPublic,
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

  it("drops model-authored Code Spark header copy that could reveal an answer", () => {
    const normalized = normalizeCreateSparkInput({
      sparkId: "test",
      context: "Create a tiny add(a, b) repair challenge.",
      title: "Return a + b",
      summary: "The visible check prints 5.",
    });

    expect(normalized).toEqual({
      sparkId: "test",
      context: "Create a tiny add(a, b) repair challenge.",
      title: undefined,
      summary: undefined,
    });
  });

  it("routes requested Code Spark challenges to challenge mode", () => {
    expect(
      inferCodeSparkModeFromContext(
        "Create a tiny Code Spark challenge with one visible check.",
        "code",
      ),
    ).toBe("challenge");
    expect(
      inferCodeSparkModeFromContext("Create a TypeScript workspace for loops.", "code"),
    ).toBe("workspace");
    expect(inferCodeSparkModeFromContext("Create a failing test spark.", "test")).toBe(
      "challenge",
    );
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

  it("defaults Python challenges to a real visible harness instead of treating exit zero as success", () => {
    const artifact = normalizeCodeSparkDraft(
      {
        title: "Return a value",
        payload: {
          mode: "challenge",
          language: "python",
        },
      },
      "test",
    );

    expect(artifact.payload.files.map((file) => file.path)).toEqual([
      "main.py",
      "tests/answer.check.py",
    ]);
    expect(artifact.payload.tests).toEqual([
      {
        id: "visible-answer",
        label: "answer() returns a concrete value",
        command: "python3 tests/answer.check.py",
        hidden: false,
      },
    ]);
    expect(artifact.payload.runCommand).toBe("python3 main.py");
    expect(artifact.payload.testCommand).toBe(
      "python3 tests/answer.check.py",
    );

    const checkFile = artifact.payload.files.find(
      (file) => file.path === "tests/answer.check.py",
    );
    expect(checkFile).toMatchObject({ role: "test", editable: false });
    expect(checkFile?.contents).toContain("from main import answer");
    expect(checkFile?.contents).toContain("raise AssertionError");
  });

  it("keeps the generated Python template aligned with the public contract defaults", () => {
    const templateSource = readFileSync("convex/sparks/tools.ts", "utf8");

    expect(templateSource).toContain("path: codeSparkPythonCheckPath");
    expect(templateSource).toContain("contents: codeSparkPythonCheckSource");
    expect(templateSource).toContain("command: codeSparkPythonTestCommand");
    expect(templateSource).toContain("testCommand: codeSparkPythonTestCommand");
  });

  it("projects the initial challenge artifact without execution internals", () => {
    const normalizedArtifact = normalizeCodeSparkDraft(starterDraft, "test");
    const internalArtifact = {
      ...normalizedArtifact,
      payload: {
        ...normalizedArtifact.payload,
        activePath: "tests/add.test.ts",
        files: [
          ...normalizedArtifact.payload.files,
          {
            path: "README.md",
            language: "typescript" as const,
            contents: "Learner notes",
            editable: true,
            role: "readme" as const,
          },
          {
            path: "support.json",
            language: "typescript" as const,
            contents: "{}",
            editable: false,
            role: "config" as const,
          },
          {
            path: "solutions/add.ts",
            language: "typescript" as const,
            contents: "export const add = (a: number, b: number) => a + b;",
            editable: true,
            role: "solution" as const,
          },
        ],
      },
    };
    const publicArtifact = projectCodeSparkArtifactForPublic(internalArtifact);

    expect(
      publicArtifact.payload.files.map((file) => ({
        path: file.path,
        role: file.role,
        editable: file.editable,
      })),
    ).toEqual([
      { path: "src/add.ts", role: "starter", editable: true },
      { path: "README.md", role: "readme", editable: true },
    ]);
    expect(publicArtifact.payload.activePath).toBe("src/add.ts");
    expect(
      publicArtifact.payload.files.some(
        (file) => file.path === publicArtifact.payload.activePath,
      ),
    ).toBe(true);
    expect(publicArtifact.payload.tests).toEqual([
      {
        id: "visible-add",
        label: "adds two positive numbers",
        command: "",
        hidden: false,
      },
    ]);
    expect(publicArtifact.payload.runCommand).toBe("");
    expect(publicArtifact.payload.testCommand).toBe("");
    expect(JSON.stringify(publicArtifact)).not.toMatch(
      /tests\/add|solutions\/add|support\.json|a \+ b/,
    );
    expect(isSparkArtifact(publicArtifact)).toBe(true);
    expect(
      isCreateSparkToolResult({
        status: "success",
        workerSummary: "Created a visible-check challenge.",
        warnings: [],
        artifact: publicArtifact,
      }),
    ).toBe(true);
  });

  it("derives a learner entry command for legacy challenges", () => {
    expect(
      deriveCodeSparkLearnerRunCommand("typescript", "src/add.ts"),
    ).toBe("node src/add.ts");
    expect(deriveCodeSparkLearnerRunCommand("python", "main.py")).toBe(
      "python3 main.py",
    );
    expect(
      deriveCodeSparkLearnerRunCommand("typescript", "tests/add.check.ts"),
    ).toBeUndefined();
    expect(
      deriveCodeSparkLearnerRunCommand("python", "../private/main.py"),
    ).toBeUndefined();
  });

  it("fails closed on canonical private challenge paths even when roles are mislabeled", () => {
    for (const path of [
      "solutions/answer.ts",
      "TESTS\\answer.CHECK.TS",
      "src/../tests/answer.check.ts",
      "src/answer.solution.ts",
    ]) {
      expect(isPrivateCodeSparkPath(path), path).toBe(true);
    }
    for (const path of [
      "src/contest.ts",
      "src/checkBalance.ts",
      "src/solutionary.ts",
      "support/test-utils.ts",
    ]) {
      expect(isPrivateCodeSparkPath(path), path).toBe(false);
    }

    const normalizedArtifact = normalizeCodeSparkDraft(starterDraft, "test");
    const malformedArtifact = {
      ...normalizedArtifact,
      payload: {
        ...normalizedArtifact.payload,
        activePath: "TESTS\\answer.CHECK.TS",
        files: [
          {
            path: "src/index.ts",
            language: "typescript" as const,
            contents: "export const answer = 0;",
            editable: true,
            role: "starter" as const,
          },
          {
            path: "support/test-utils.ts",
            language: "typescript" as const,
            contents: "export const helper = true;",
            editable: true,
            role: "starter" as const,
          },
          ...[
            "solutions/answer.ts",
            "TESTS\\answer.CHECK.TS",
            "src/../tests/answer.check.ts",
            "src/answer.solution.ts",
          ].map((path) => ({
            path,
            language: "typescript" as const,
            contents: "export const leaked = 42;",
            editable: true,
            role: "starter" as const,
          })),
          {
            path: "src/role-solution.ts",
            language: "typescript" as const,
            contents: "export const leaked = 42;",
            editable: true,
            role: "solution" as const,
          },
          {
            path: "src/role-test.ts",
            language: "typescript" as const,
            contents: "throw new Error('private check');",
            editable: true,
            role: "test" as const,
          },
          {
            path: "src/role-hidden.ts",
            language: "typescript" as const,
            contents: "throw new Error('hidden check');",
            editable: true,
            role: "hidden_test" as const,
          },
        ],
      },
    };

    const publicArtifact = projectCodeSparkArtifactForPublic(malformedArtifact);

    expect(publicArtifact.payload.files.map((file) => file.path)).toEqual([
      "src/index.ts",
      "support/test-utils.ts",
    ]);
    expect(publicArtifact.payload.activePath).toBe("src/index.ts");
    expect(JSON.stringify(publicArtifact)).not.toMatch(
      /leaked|private check|hidden check|answer\.check|solutions\/answer|answer\.solution/i,
    );
    expect(readFileSync("convex/sparks/tools.ts", "utf8")).toContain(
      "artifact: projectCodeSparkArtifactForPublic(result.artifact)",
    );
  });

  it("keeps shared contract path handling compatible with the ES2021 Convex target", () => {
    const contractSource = readFileSync("lib/sparks/contracts.ts", "utf8");

    expect(contractSource).not.toMatch(/\.at\s*\(/);
  });

  it("accepts legacy persisted languages for display while executable validation rejects them", () => {
    const artifact = normalizeCodeSparkDraft(
      {
        title: "Unsupported language request",
        payload: {
          language: "rust",
          files: [
            {
              path: "src/main.rs",
              language: "rust",
              contents: "fn main() {}",
              editable: true,
              role: "starter",
            },
          ],
        },
      } as unknown as CodeSparkDraft,
      "code",
    );
    const schemaSource = readFileSync("convex/schema.ts", "utf8");

    expect(artifact.payload.language).toBe("typescript");
    expect(artifact.payload.files[0]?.language).toBe("typescript");
    expect(
      validateCodeSparkPayload({
        ...artifact.payload,
        language: "rust",
      } as unknown),
    ).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        "Code Spark currently supports JS/TypeScript and Python only.",
      ]),
    });
    for (const language of ["c", "rust", "mixed"] as const) {
      const legacyArtifact = {
        ...artifact,
        payload: {
          ...artifact.payload,
          language,
          activePath: `src/main.${language}`,
          files: [
            {
              path: `src/main.${language}`,
              language,
              contents: `historical ${language} source`,
              editable: false,
              role: "starter" as const,
            },
          ],
        },
      };

      expect(isSparkArtifact(legacyArtifact)).toBe(true);
      expect(validateCodeSparkPayload(legacyArtifact.payload)).toMatchObject({
        ok: false,
        errors: expect.arrayContaining([
          "Code Spark currently supports JS/TypeScript and Python only.",
        ]),
      });
    }
    expect(schemaSource).toContain('v.literal("c")');
    expect(schemaSource).toContain('v.literal("rust")');
    expect(schemaSource).toContain('v.literal("mixed")');
  });

  it("executes the generated Python starter, visible check, repairs, and failure modes with Bun", () => {
    const pythonProbe = spawnSync(
      "bun",
      ["--silent", "-e", "process.exit(Bun.which('python3') ? 0 : 125)"],
      { encoding: "utf8" },
    );
    if (pythonProbe.status === 125 || pythonProbe.error) {
      return;
    }

    const root = mkdtempSync(join(tmpdir(), "studi-code-spark-python-"));
    const testsDir = join(root, "tests");
    mkdirSync(testsDir);
    const mainPath = join(root, "main.py");
    const checkPath = join(testsDir, "answer.check.py");
    writeFileSync(checkPath, codeSparkPythonCheckSource);

    const run = (...args: string[]) => {
      const script = [
        "const python3 = Bun.which('python3');",
        "if (!python3) process.exit(125);",
        `const result = Bun.spawnSync([python3, ...${JSON.stringify(args)}], {`,
        `  cwd: ${JSON.stringify(root)}, stdout: 'pipe', stderr: 'pipe'`,
        "});",
        "await Bun.write(Bun.stdout, result.stdout);",
        "await Bun.write(Bun.stderr, result.stderr);",
        "process.exit(result.exitCode);",
      ].join("\n");
      return spawnSync("bun", ["--silent", "-e", script], {
        encoding: "utf8",
      });
    };

    try {
      writeFileSync(mainPath, codeSparkPythonStarterSource);
      const normal = run("main.py");
      expect(normal.status).toBe(0);
      expect(normal.stdout).toContain("None");

      const starterCheck = run("tests/answer.check.py");
      expect(starterCheck.status).not.toBe(0);
      expect(starterCheck.stderr).toContain("AssertionError");

      writeFileSync(
        mainPath,
        "def answer():\n    return 42\n\nif __name__ == \"__main__\":\n    print(answer())\n",
      );
      const repairedCheck = run("tests/answer.check.py");
      expect(repairedCheck.status).toBe(0);
      expect(repairedCheck.stdout).toContain("visible check passed");

      writeFileSync(mainPath, "def answer(\n    return 42\n");
      const syntaxFailure = run("main.py");
      expect(syntaxFailure.status).not.toBe(0);
      expect(syntaxFailure.stderr).toContain("SyntaxError");

      writeFileSync(
        mainPath,
        "def answer():\n    raise RuntimeError('learner runtime failure')\n\nanswer()\n",
      );
      const runtimeFailure = run("main.py");
      expect(runtimeFailure.status).not.toBe(0);
      expect(runtimeFailure.stderr).toContain(
        "learner runtime failure",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("documents challenge checks as UI concealment rather than a cryptographic boundary", () => {
    const contractSource = readFileSync("lib/sparks/contracts.ts", "utf8");
    const toolSource = readFileSync("convex/sparks/tools.ts", "utf8");

    expect(contractSource).toContain(
      "UI-concealment boundary, not a cryptographic hidden-test boundary",
    );
    expect(toolSource).not.toMatch(/private runtime session/i);
  });
});
