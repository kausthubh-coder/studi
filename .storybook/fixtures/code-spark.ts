import {
  sparkSceneVersion,
  type CodeSparkPayload,
  type CodeSparkRunSummary,
  type SparkArtifact,
} from "@/lib/sparks/contracts";

export const addNumbersCodeSparkPayload = {
  mode: "challenge",
  language: "typescript",
  instructions: "Predict add(2, 3), then repair the function.",
  provider: "local_fake",
  providerStatus: "test_only",
  activePath: "src/add.ts",
  files: [
    {
      path: "src/add.ts",
      language: "typescript",
      contents: "export function add(a: number, b: number) { return 0; }",
      editable: true,
      role: "starter",
    },
    {
      path: "tests/add.check.ts",
      language: "typescript",
      contents:
        "import { add } from '../src/add.ts';\nif (add(2, 3) !== 5) throw new Error('Try again');",
      editable: false,
      role: "test",
    },
  ],
  tests: [
    {
      id: "adds_visible_numbers",
      label: "adds visible numbers",
      command: "bun tests/add.check.ts",
      hidden: false,
    },
  ],
  hiddenTestCount: 0,
  runCommand: "bun src/add.ts",
  testCommand: "bun tests/add.check.ts",
  lab: {
    enabled: false,
    reason: "Open in Lab is disabled until a real Lab handoff exists.",
  },
} satisfies CodeSparkPayload;

export const addNumbersCodeSparkArtifact = {
  kind: "spark_code",
  version: sparkSceneVersion,
  sparkType: "code",
  mode: "editable",
  artifactId: "artifact_story_add_numbers",
  title: "Repair add()",
  summary: "Fix a tiny function, then run the visible check.",
  payload: addNumbersCodeSparkPayload,
} satisfies SparkArtifact;

export const hydratedAddNumbersSession = {
  provider: "local_fake",
  providerStatus: "test_only",
  activePath: addNumbersCodeSparkPayload.activePath,
  files: addNumbersCodeSparkPayload.files,
  tests: addNumbersCodeSparkPayload.tests,
  lastRun: null,
};

export const passedCodeSparkResult = {
  status: "passed",
  provider: "local_fake",
  stdout: "visible check passed\n",
  stderr: "",
  exitCode: 0,
  durationMs: 8,
  timedOut: false,
} as const;

export const failedCodeSparkResult = {
  status: "failed",
  provider: "local_fake",
  stdout: "",
  stderr: "Expected 5, received 0\n",
  exitCode: 1,
  durationMs: 7,
  timedOut: false,
} as const;

export const timedOutCodeSparkResult = {
  status: "timed_out",
  provider: "local_fake",
  stdout: "",
  stderr: "Execution timed out.",
  exitCode: 124,
  durationMs: 15_000,
  timedOut: true,
} as const;

export const unavailableCodeSparkRun = {
  kind: "run",
  status: "unavailable",
  provider: "unavailable",
  reason: "The Storybook fixture intentionally has no execution provider.",
  createdAt: Date.UTC(2026, 6, 10, 16, 0, 0),
} satisfies CodeSparkRunSummary;
