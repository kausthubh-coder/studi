import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as CodeSparkSceneModule from "./CodeSparkScene";
import type { CodeSparkPayload } from "@/lib/sparks/contracts";

const CodeSparkScene = CodeSparkSceneModule.default;
const { __resetCodeSparkDraftBuffersForTests } = CodeSparkSceneModule;
const codeSparkStyles = readFileSync(
  resolve(process.cwd(), "app/globals.css"),
  "utf8",
);

const upsertSession = vi.fn().mockResolvedValue({});
const writeFile = vi.fn().mockResolvedValue({});
const runCodeSpark = vi.fn().mockResolvedValue({
  status: "passed",
  provider: "local_fake",
  stdout: "visible checks passed\n",
  stderr: "",
  exitCode: 0,
  durationMs: 4,
  timedOut: false,
});
let hydratedSession: unknown = null;
let monacoOptions: Record<string, unknown> | null = null;
const scrollIntoView = vi.fn();

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: scrollIntoView,
});

vi.mock("@/convex/_generated/api", () => ({
  api: {
    codeSparks: {
      getSessionForSpark: "codeSparks.getSessionForSpark",
      upsertSessionFromArtifact: "codeSparks.upsertSessionFromArtifact",
      writeFile: "codeSparks.writeFile",
    },
    codeSparkActions: {
      run: "codeSparkActions.run",
    },
  },
}));

vi.mock("convex/react", () => ({
  useAction: () => runCodeSpark,
  useMutation: (reference: string) => {
    if (reference === "codeSparks.upsertSessionFromArtifact") {
      return upsertSession;
    }
    if (reference === "codeSparks.writeFile") {
      return writeFile;
    }
    return vi.fn().mockResolvedValue({});
  },
  useQuery: () => hydratedSession,
}));

vi.mock("@monaco-editor/react", () => ({
  default: ({
    value,
    onChange,
    options,
  }: {
    value?: string;
    onChange?: (value: string | undefined) => void;
    options?: Record<string, unknown>;
  }) => {
    monacoOptions = options ?? null;
    return (
      <textarea
        aria-label="Code editor"
        value={value ?? ""}
        readOnly={Boolean(options?.readOnly)}
        onChange={(event) => {
          if (!options?.readOnly) {
            onChange?.(event.currentTarget.value);
          }
        }}
      />
    );
  },
}));

const payload: CodeSparkPayload = {
  mode: "challenge",
  language: "typescript",
  instructions: "Predict what add(2, 3) should return, then fix the function.",
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
      path: "src/format.ts",
      language: "typescript",
      contents: "export const format = (value: number) => String(value);",
      editable: true,
      role: "starter",
    },
    {
      path: "tests/add.check.ts",
      language: "typescript",
      contents: "import { add } from '../src/add.ts';",
      editable: false,
      role: "test",
    },
  ],
  tests: [
    {
      id: "adds-visible",
      label: "adds visible values",
      command: "node tests/add.check.ts",
      hidden: false,
    },
    {
      id: "formats-visible",
      label: "formats the visible output",
      command: "node tests/format.check.ts",
      hidden: false,
    },
  ],
  hiddenTestCount: 0,
  runCommand: "node tests/add.check.ts",
  testCommand: "node tests/add.check.ts",
  lab: {
    enabled: false,
    reason: "Open in Lab is disabled until a real Lab handoff exists.",
  },
};

function renderScene(overrides: Partial<CodeSparkPayload> = {}) {
  return render(
    <CodeSparkScene
      payload={{ ...payload, ...overrides }}
      title="Add numbers"
      threadId="thread_1"
      sparkId="spark_1"
      isExpanded
    />,
  );
}

function renderInline(overrides: Partial<CodeSparkPayload> = {}) {
  return render(
    <CodeSparkScene
      payload={{ ...payload, ...overrides }}
      title="Add numbers"
      threadId="thread_1"
      sparkId="spark_1"
      isExpanded={false}
    />,
  );
}

describe("CodeSparkScene", () => {
  beforeEach(() => {
    vi.useRealTimers();
    hydratedSession = null;
    monacoOptions = null;
    __resetCodeSparkDraftBuffersForTests();
    upsertSession.mockClear();
    writeFile.mockClear();
    runCodeSpark.mockClear();
    scrollIntoView.mockClear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    });
    runCodeSpark.mockResolvedValue({
      status: "passed",
      provider: "local_fake",
      stdout: "visible checks passed\n",
      stderr: "",
      exitCode: 0,
      durationMs: 4,
      timedOut: false,
    });
  });

  it("renders learner instructions and each visible check as its own runnable item", () => {
    renderScene();

    expect(
      screen.getByText(
        "Predict what add(2, 3) should return, then fix the function.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("adds visible values")).toBeInTheDocument();
    expect(screen.getByText("formats the visible output")).toBeInTheDocument();
    expect(screen.getByText("2 visible checks")).toBeInTheDocument();
    expect(screen.queryByText(/development-only/i)).not.toBeInTheDocument();
  });

  it("labels a challenge spark and never exposes test files or raw check commands", () => {
    renderScene();

    expect(
      screen.getByRole("note", { name: "Challenge guidance" }),
    ).toHaveTextContent(/use test for feedback/i);

    // Learner-editable starter files are visible.
    expect(
      screen.getByRole("button", { name: /src\/add\.ts/ }),
    ).toBeInTheDocument();

    // The `role: "test"` implementation file is not shown as a learner file.
    expect(
      screen.queryByRole("button", { name: /tests\/add\.check\.ts/ }),
    ).not.toBeInTheDocument();

    // Raw check command strings are not rendered as learner-facing criteria.
    expect(
      screen.queryByText("node tests/add.check.ts"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("node tests/format.check.ts"),
    ).not.toBeInTheDocument();
  });

  it("projects challenge inputs before the public session upsert", async () => {
    renderScene({
      files: [
        ...payload.files,
        {
          path: "tests/secret.check.ts",
          language: "typescript",
          contents: "throw new Error('private check');",
          editable: false,
          role: "hidden_test",
        },
      ],
      tests: [
        ...payload.tests,
        {
          id: "hidden-secret",
          label: "hidden secret",
          command: "node tests/secret.check.ts",
          hidden: true,
        },
      ],
    });

    await waitFor(() => expect(upsertSession).toHaveBeenCalledTimes(1));
    const publicInput = upsertSession.mock.calls[0]![0];

    expect(
      publicInput.files.map(
        (file: CodeSparkPayload["files"][number]) => file.path,
      ),
    ).toEqual(["src/add.ts", "src/format.ts"]);
    expect(publicInput.tests).toEqual(payload.tests);
  });

  it("applies the learner-visible file policy to challenge payload files before hydration", () => {
    const leakedFiles = [
      "solutions/answer.ts",
      "tests/answer.ts",
      "checks/answer.ts",
      "src/answer.solution.ts",
      "src/answer.test.ts",
      "src/answer.check.ts",
      "src/../teacher/answer.ts",
      "TESTS\\answer.CHECK.TS",
    ].map((path) => ({
      path,
      language: "typescript" as const,
      contents: `LEAKED PRIVATE CONTENT FROM ${path}`,
      editable: true,
      role: "starter" as const,
    }));

    renderScene({
      activePath: "solutions/answer.ts",
      files: [
        {
          path: "src/index.ts",
          language: "typescript",
          contents: "export const learner = true;",
          editable: true,
          role: "starter",
        },
        {
          path: "support/test-utils.ts",
          language: "typescript",
          contents: "export const visibleSupport = true;",
          editable: true,
          role: "starter",
        },
        ...leakedFiles,
        {
          path: "src/teacher.ts",
          language: "typescript",
          contents: "NONEDITABLE TEACHER CONTENT",
          editable: false,
          role: "starter",
        },
        ...(["solution", "test", "hidden_test"] as const).map((role) => ({
          path: `src/role-${role}.ts`,
          language: "typescript" as const,
          contents: `ROLE ${role} PRIVATE CONTENT`,
          editable: true,
          role,
        })),
      ],
    });

    expect(
      screen.getByRole("button", { name: /src\/index\.ts/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /support\/test-utils\.ts/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Code editor")).toHaveValue(
      "export const learner = true;",
    );

    for (const file of leakedFiles) {
      expect(
        screen.queryByRole("button", { name: file.path }),
      ).not.toBeInTheDocument();
    }
    const learnerSurface = document.body.textContent ?? "";
    expect(learnerSurface).not.toMatch(
      /LEAKED PRIVATE CONTENT|NONEDITABLE TEACHER CONTENT|ROLE (?:solution|test|hidden_test) PRIVATE CONTENT/,
    );
  });

  it("treats a workspace spark as an inspectable sandbox with visible files and commands", () => {
    renderScene({ mode: "workspace" });

    expect(
      screen.getByRole("note", { name: "Sandbox guidance" }),
    ).toHaveTextContent(/inspect the terminal/i);

    // Inspectable: the test file and the command are both visible in a sandbox.
    expect(
      screen.getByRole("button", { name: /tests\/add\.check\.ts/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("node tests/add.check.ts")).toBeInTheDocument();
  });

  it.each([
    ["c", "C", "src/main.c", "historical c source"],
    ["rust", "Rust", "src/main.rs", "historical rust source"],
    ["mixed", "Mixed", "src/main.txt", "historical mixed source"],
  ] as const)(
    "renders archived %s sessions as genuine display-only workspaces",
    (language, languageName, activePath, contents) => {
      const historicalFiles = [
        {
          path: activePath,
          language,
          contents,
          editable: true,
          role: "starter" as const,
        },
        {
          path: "README.md",
          language,
          contents: `${languageName} archive notes`,
          editable: false,
          role: "readme" as const,
        },
      ];
      hydratedSession = {
        provider: "unavailable",
        providerStatus: "unavailable",
        activePath,
        files: historicalFiles,
        tests: payload.tests,
        hiddenTestCount: 0,
      };

      renderScene({
        mode: "workspace",
        language,
        provider: "unavailable",
        providerStatus: "unavailable",
        activePath,
        files: historicalFiles,
      });

      expect(screen.getByLabelText("Code editor")).toHaveValue(contents);
      expect(screen.getByText(/archived.*display only/i)).toBeVisible();
      expect(
        screen.getByText(/editing, run, test, and saving are disabled/i),
      ).toBeVisible();
      expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Test" })).toBeDisabled();
      expect(
        screen.getByRole("button", { name: /run adds visible values/i }),
      ).toBeDisabled();
      expect(monacoOptions).toMatchObject({ readOnly: true });
      expect(screen.getAllByText("read").length).toBeGreaterThan(0);
      expect(
        screen.queryByText(/provider unavailable|runtime unavailable/i),
      ).not.toBeInTheDocument();

      const archivedSource = screen.getByRole("button", {
        name: (name) => name.startsWith(activePath),
      });
      const archivedReadme = screen.getByRole("button", { name: /README\.md/ });
      fireEvent.click(archivedReadme);
      expect(screen.getByLabelText("Code editor")).toHaveValue(
        `${languageName} archive notes`,
      );
      fireEvent.click(archivedSource);

      fireEvent.change(screen.getByLabelText("Code editor"), {
        target: { value: "attempted archived edit" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Run" }));
      fireEvent.click(screen.getByRole("button", { name: "Test" }));

      expect(screen.getByLabelText("Code editor")).toHaveValue(contents);
      expect(screen.queryByText(/unsaved edits/i)).not.toBeInTheDocument();
      expect(upsertSession).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
      expect(runCodeSpark).not.toHaveBeenCalled();
    },
  );

  it("keeps toolbar run controls disabled until the Code Spark session hydrates", () => {
    renderScene();

    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Test" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /run adds visible values/i }),
    ).toBeDisabled();
  });

  it("shows visible workspace-hydration help and describes disabled run controls with it", () => {
    renderScene();

    const savingStatus = screen.getByText(
      "Studi is preparing this Code Spark workspace. Run and check controls will unlock in a moment.",
    );
    const runButton = screen.getByRole("button", { name: "Run" });
    const testButton = screen.getByRole("button", { name: "Test" });
    const checkButton = screen.getByRole("button", {
      name: /run adds visible values/i,
    });

    expect(savingStatus).toBeVisible();
    expect(runButton).toHaveAttribute("aria-describedby", savingStatus.id);
    expect(testButton).toHaveAttribute("aria-describedby", savingStatus.id);
    expect(checkButton).toHaveAttribute("aria-describedby", savingStatus.id);
    expect(runButton).toHaveAttribute("aria-disabled", "true");
    expect(checkButton).toHaveAttribute("aria-disabled", "true");
  });

  it("announces running state and run output from a polite status region", async () => {
    hydratedSession = {
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      files: payload.files,
      tests: payload.tests,
      hiddenTestCount: 0,
    };
    let finishRun: (
      value: Awaited<ReturnType<typeof runCodeSpark>>,
    ) => void = () => {};
    runCodeSpark.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRun = resolve;
        }),
    );

    renderScene();

    const runStatus = screen.getByRole("status", {
      name: "Code Spark run status",
    });
    expect(runStatus).toHaveAttribute("aria-live", "polite");
    expect(runStatus).toHaveTextContent("Not run");

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(runStatus).toHaveTextContent("Running");
    expect(
      screen.getByText(
        "Running Code Spark checks. Output will update when the run finishes.",
      ),
    ).toBeVisible();
    await waitFor(() => {
      expect(runCodeSpark).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      finishRun({
        status: "passed",
        provider: "local_fake",
        stdout: "visible checks passed\n",
        stderr: "",
        exitCode: 0,
        durationMs: 4,
        timedOut: false,
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(runStatus).toHaveTextContent("Passed");
    });
    expect(runStatus).toHaveTextContent("visible checks passed");
  });

  it("masks the raw run command in challenge output but keeps failure text", async () => {
    hydratedSession = {
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      files: payload.files,
      tests: payload.tests,
      hiddenTestCount: 0,
    };
    runCodeSpark.mockResolvedValueOnce({
      status: "failed",
      provider: "local_fake",
      stdout: "",
      stderr: "AssertionError: expected 5 but received 0",
      exitCode: 1,
      durationMs: 4,
      timedOut: false,
    });

    renderScene();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    const runStatus = screen.getByRole("status", {
      name: "Code Spark run status",
    });
    await waitFor(() => {
      expect(runStatus).toHaveTextContent("Failed");
    });

    // Failure output stays visible so the learner can iterate.
    expect(runStatus).toHaveTextContent(
      "AssertionError: expected 5 but received 0",
    );
    // The raw check command path is not echoed into the challenge output.
    expect(runStatus).not.toHaveTextContent("node tests/add.check.ts");
  });

  it("redacts challenge stderr and reason check paths while preserving assertion text", async () => {
    hydratedSession = {
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      files: payload.files,
      tests: payload.tests,
      hiddenTestCount: 0,
    };
    runCodeSpark.mockResolvedValueOnce({
      status: "failed",
      provider: "local_fake",
      stdout: "AssertionError: expected add(2, 3) to equal 5",
      stderr:
        "Command failed: node tests/add.check.ts\n" +
        "    at Object.<anonymous> (/tmp/studi/tests/add.check.ts:7:13)\n" +
        "    at /vercel/sandbox/main.py:6:5\n" +
        "AssertionError: expected 5 but received 0",
      exitCode: 1,
      durationMs: 4,
      timedOut: false,
      reason: "python tests/hidden.check.py failed at tests/add.check.ts:7:13",
    });

    renderScene();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    const runStatus = screen.getByRole("status", {
      name: "Code Spark run status",
    });
    await waitFor(() => {
      expect(runStatus).toHaveTextContent("Failed");
    });

    expect(runStatus).toHaveTextContent(
      "AssertionError: expected add(2, 3) to equal 5",
    );
    expect(runStatus).toHaveTextContent(
      "AssertionError: expected 5 but received 0",
    );
    expect(runStatus).toHaveTextContent("[check details hidden]");
    expect(runStatus).not.toHaveTextContent("node tests/add.check.ts");
    expect(runStatus).not.toHaveTextContent("python tests/hidden.check.py");
    expect(runStatus).not.toHaveTextContent("/tmp/studi/tests/add.check.ts");
    expect(runStatus).not.toHaveTextContent("/vercel/sandbox/main.py");
    expect(runStatus).not.toHaveTextContent("tests/add.check.ts:7:13");
  });

  it("shows the raw run command in workspace output for inspection", async () => {
    hydratedSession = {
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      files: payload.files,
      tests: payload.tests,
      hiddenTestCount: 0,
      runCommand: "node tests/stored-run.check.ts",
      testCommand: "node tests/stored-test.check.ts",
    };

    renderScene({
      mode: "workspace",
      runCommand: "node tests/stale-payload.check.ts",
      testCommand: "node tests/stale-payload.check.ts",
    });

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(runCodeSpark).toHaveBeenCalledTimes(1);
    });
    // Uses the hydrated stored command, not the stale payload command.
    expect(
      within(screen.getByRole("region", { name: "Terminal" })).getByText(
        /\$ node tests\/stored-run\.check\.ts/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/\$ node tests\/stale-payload\.check\.ts/),
    ).not.toBeInTheDocument();
  });

  it("shows raw workspace stderr and reason paths for inspection", async () => {
    hydratedSession = {
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      files: payload.files,
      tests: payload.tests,
      hiddenTestCount: 0,
      testCommand: "node tests/stored-test.check.ts",
    };
    runCodeSpark.mockResolvedValueOnce({
      status: "failed",
      provider: "local_fake",
      stdout: "",
      stderr:
        "Command failed: node tests/add.check.ts\n" +
        "    at Object.<anonymous> (/tmp/studi/tests/add.check.ts:7:13)",
      exitCode: 1,
      durationMs: 4,
      timedOut: false,
      reason: "python tests/hidden.check.py failed",
    });

    renderScene({ mode: "workspace" });

    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    const runStatus = screen.getByRole("status", {
      name: "Code Spark run status",
    });
    await waitFor(() => {
      expect(runStatus).toHaveTextContent("Failed");
    });

    expect(runStatus).toHaveTextContent("$ node tests/stored-test.check.ts");
    expect(runStatus).toHaveTextContent("node tests/add.check.ts");
    expect(runStatus).toHaveTextContent("/tmp/studi/tests/add.check.ts:7:13");
    expect(runStatus).toHaveTextContent("python tests/hidden.check.py");
    expect(runStatus).not.toHaveTextContent("[check details hidden]");
  });

  it("persists every edited file before running a visible check", async () => {
    hydratedSession = {
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      files: payload.files,
      tests: payload.tests,
      hiddenTestCount: 0,
    };
    renderScene();

    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: {
        value: "export function add(a: number, b: number) { return a + b; }",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /src\/format\.ts/ }));
    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: {
        value: "export const format = (value: number) => `answer: ${value}`;",
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /run adds visible values/i }),
    );

    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledTimes(2);
    });
    expect(writeFile).toHaveBeenNthCalledWith(1, {
      threadId: "thread_1",
      sparkId: "spark_1",
      path: "src/add.ts",
      contents: "export function add(a: number, b: number) { return a + b; }",
    });
    expect(writeFile).toHaveBeenNthCalledWith(2, {
      threadId: "thread_1",
      sparkId: "spark_1",
      path: "src/format.ts",
      contents: "export const format = (value: number) => `answer: ${value}`;",
    });
    expect(runCodeSpark).toHaveBeenCalledWith({
      threadId: "thread_1",
      sparkId: "spark_1",
      mode: "test",
      checkId: "adds-visible",
      timeoutMs: 15_000,
    });
  });

  it("uses persisted hydrated checks instead of stale payload-only criteria", async () => {
    hydratedSession = {
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      files: payload.files,
      tests: [
        {
          id: "persisted-visible",
          label: "persisted visible check",
          command: "node tests/persisted.check.ts",
          hidden: false,
        },
      ],
      hiddenTestCount: 0,
    };

    renderScene({
      tests: [
        {
          id: "new-payload-visible",
          label: "new payload check that was never persisted",
          command: "node tests/new-payload.check.ts",
          hidden: false,
        },
      ],
    });

    expect(screen.getByText("persisted visible check")).toBeInTheDocument();
    expect(
      screen.queryByText("new payload check that was never persisted"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    await waitFor(() => {
      expect(runCodeSpark).toHaveBeenCalledTimes(1);
    });
    expect(runCodeSpark).toHaveBeenCalledWith({
      threadId: "thread_1",
      sparkId: "spark_1",
      mode: "test",
      timeoutMs: 15_000,
    });
  });

  it("distills inline chrome around the task, editor, terminal, and test results", () => {
    renderInline({
      files: [payload.files[0]!],
      tests: [payload.tests[0]!],
    });

    // The outer Spark card already carries title and identity. Keep the exact
    // learner objective in the compact workbench so it is usable by itself.
    expect(screen.queryByText("Challenge Spark")).not.toBeInTheDocument();
    expect(screen.queryByText("JS / TypeScript")).not.toBeInTheDocument();
    expect(screen.queryByText(/development-only/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Predict what add(2, 3) should return, then fix the function.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("src/add.ts")).not.toBeInTheDocument();
    expect(screen.queryByText("Editable")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/ready to run visible checks/i),
    ).not.toBeInTheDocument();

    const brief = screen.getByRole("note", { name: "Challenge guidance" });
    expect(brief).toHaveTextContent(/solve the challenge/i);
    expect(brief).toHaveTextContent(/use test for feedback/i);

    // Inline Code Spark remains fully usable without expanding.
    expect(screen.getByLabelText("Code editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /run adds visible values/i }),
    ).not.toBeInTheDocument();

    const terminal = screen.getByRole("region", { name: "Terminal" });
    expect(terminal).toHaveTextContent("Run your code to see output.");
    const testResults = screen.getByRole("region", { name: "Test results" });
    expect(testResults).toHaveTextContent("adds visible values");
    expect(testResults).toHaveTextContent("Not tested yet");
  });

  it("highlights challenge vs sandbox guidance inline without metadata chips", () => {
    const challenge = renderInline();
    expect(
      screen.getByRole("note", { name: "Challenge guidance" }),
    ).toHaveTextContent(/use test for feedback/i);
    challenge.unmount();

    renderInline({ mode: "workspace" });
    expect(
      screen.getByRole("note", { name: "Sandbox guidance" }),
    ).toHaveTextContent(/run code and inspect the terminal/i);
  });

  it("exposes the server-derived runtime provider as nonvisual test metadata", () => {
    hydratedSession = hydratedFor({
      provider: "vercel_sandbox",
      providerStatus: "configured",
    });
    const view = renderInline();

    expect(view.container.querySelector(".code-spark-inline")).toHaveAttribute(
      "data-runtime-provider",
      "vercel_sandbox",
    );
    expect(view.container.querySelector(".code-spark-inline")).toHaveAttribute(
      "data-runtime-hydrated",
      "true",
    );
  });

  const hydratedFor = (overrides: Record<string, unknown> = {}) => ({
    provider: "local_fake",
    providerStatus: "test_only",
    activePath: "src/add.ts",
    files: payload.files,
    tests: payload.tests,
    hiddenTestCount: 0,
    ...overrides,
  });

  it("keeps terminal output and test feedback in separate persistent surfaces", async () => {
    hydratedSession = hydratedFor();
    runCodeSpark
      .mockResolvedValueOnce({
        status: "passed",
        stdout: "program says hello\n",
        stderr: "",
        exitCode: 0,
        durationMs: 4,
        timedOut: false,
        reason: "Program finished.",
      })
      .mockResolvedValueOnce({
        status: "passed",
        reason: "Check passed.",
      });

    renderInline({
      files: [payload.files[0]!],
      tests: [payload.tests[0]!],
    });

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    const terminal = screen.getByRole("region", { name: "Terminal" });
    await waitFor(() => {
      expect(terminal).toHaveTextContent("program says hello");
    });
    expect(
      within(screen.getByRole("region", { name: "Test results" })).queryByText(
        "program says hello",
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    const testResults = screen.getByRole("region", { name: "Test results" });
    await waitFor(() => {
      expect(testResults).toHaveTextContent("Passed");
      expect(testResults).toHaveTextContent("Check passed.");
    });
    expect(terminal).toHaveTextContent("program says hello");
  });

  it("marks terminal output stale after an edit until the current code is run", async () => {
    hydratedSession = hydratedFor();
    runCodeSpark
      .mockResolvedValueOnce({
        status: "passed",
        stdout: "old program output\n",
        stderr: "",
        exitCode: 0,
        durationMs: 4,
        timedOut: false,
        reason: "Program finished.",
      })
      .mockResolvedValueOnce({
        status: "passed",
        reason: "Check passed.",
      });

    renderInline({
      files: [payload.files[0]!],
      tests: [payload.tests[0]!],
    });

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    const terminal = screen.getByRole("region", { name: "Terminal" });
    await waitFor(() => expect(terminal).toHaveTextContent("old program output"));

    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: {
        value: "export function add(a: number, b: number) { return a + b; }",
      },
    });
    expect(terminal).toHaveTextContent("Changes not run");
    expect(terminal).toHaveTextContent(
      "Run the current code to refresh terminal output.",
    );
    expect(terminal).not.toHaveTextContent("old program output");

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Test results" })).toHaveTextContent(
        "Passed",
      ),
    );
    expect(terminal).toHaveTextContent("Changes not run");
    expect(terminal).not.toHaveTextContent("old program output");
  });

  it("keeps an old Test pass invalid after edited code is only Run and remounted", async () => {
    hydratedSession = hydratedFor();
    runCodeSpark
      .mockResolvedValueOnce({
        status: "passed",
        provider: "local_fake",
        reason: "Check passed.",
      })
      .mockResolvedValueOnce({
        status: "passed",
        provider: "local_fake",
        stdout: "new program output\n",
        stderr: "",
        exitCode: 0,
        durationMs: 4,
        timedOut: false,
        reason: "Program finished.",
      });

    const inline = renderInline({
      files: [payload.files[0]!],
      tests: [payload.tests[0]!],
    });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Test results" })).toHaveTextContent(
        "Passed",
      ),
    );

    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: {
        value: "export function add(a: number, b: number) { return a + b; }",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Terminal" })).toHaveTextContent(
        "new program output",
      ),
    );
    expect(screen.getByRole("region", { name: "Test results" })).toHaveTextContent(
      "Changes not tested",
    );
    expect(screen.getByRole("region", { name: "Test results" })).not.toHaveTextContent(
      "Check passed.",
    );

    inline.unmount();
    renderScene({
      files: [payload.files[0]!],
      tests: [payload.tests[0]!],
    });
    expect(screen.getByRole("region", { name: "Test results" })).toHaveTextContent(
      "Changes not tested",
    );
    expect(screen.getByRole("region", { name: "Test results" })).not.toHaveTextContent(
      "Check passed.",
    );
  });

  it("attests the provider returned by a completed execution", async () => {
    hydratedSession = hydratedFor({
      provider: "vercel_sandbox",
      providerStatus: "configured",
    });
    runCodeSpark
      .mockResolvedValueOnce({
        status: "passed",
        provider: "vercel_sandbox",
        stdout: "5\n",
        stderr: "",
        exitCode: 0,
        durationMs: 4,
        timedOut: false,
        reason: "Program finished.",
      })
      .mockResolvedValueOnce({
        status: "unavailable",
        reason: "Run could not start.",
      });
    const view = renderInline({
      files: [payload.files[0]!],
      tests: [payload.tests[0]!],
    });
    const root = view.container.querySelector(".code-spark-inline");
    expect(root).not.toHaveAttribute("data-runtime-execution-provider");

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() =>
      expect(root).toHaveAttribute(
        "data-runtime-execution-provider",
        "vercel_sandbox",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Test results" })).toHaveTextContent(
        "Runtime unavailable",
      ),
    );
    expect(root).not.toHaveAttribute("data-runtime-execution-provider");
    expect(root).not.toHaveAttribute("data-runtime-execution-kind");
  });

  it("brings completed inline feedback above the floating composer", async () => {
    hydratedSession = hydratedFor();
    renderInline({
      files: [payload.files[0]!],
      tests: [payload.tests[0]!],
    });

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(runCodeSpark).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());

    const scrolledElement = scrollIntoView.mock.instances.at(-1);
    expect(scrolledElement).toHaveClass("code-spark-terminal");
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "smooth",
      block: "nearest",
    });
  });

  it("avoids animated feedback scrolling when reduced motion is requested", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    });
    hydratedSession = hydratedFor();
    renderInline({
      files: [payload.files[0]!],
      tests: [payload.tests[0]!],
    });

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "auto",
      block: "nearest",
    });
  });

  it("surfaces a legible unsaved-edit state after editing before a run", () => {
    hydratedSession = hydratedFor();
    renderScene();

    // Baseline: hydrated, no edits → ready, no unsaved-edit language.
    expect(screen.queryByText(/unsaved edits/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: {
        value: "export function add(a: number, b: number) { return a + b; }",
      },
    });

    // The dirty state is announced in text (not color alone) and explains that
    // Studi saves automatically before running.
    const dirtyStatus = screen.getByText(/unsaved edits/i);
    expect(dirtyStatus).toBeVisible();
    expect(dirtyStatus).toHaveTextContent(/saves them automatically/i);
  });

  it("announces a saving phase while persisting edits before the run executes", async () => {
    hydratedSession = hydratedFor();
    let resolveWrite: (value: unknown) => void = () => {};
    writeFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
    );

    renderScene();

    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: {
        value: "export function add(a: number, b: number) { return a + b; }",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    // While the edited file is still being written, the learner sees an honest
    // saving phase — the run action has not reached the provider yet.
    await waitFor(() => {
      expect(screen.getByText(/saving your changes/i)).toBeVisible();
    });
    expect(runCodeSpark).not.toHaveBeenCalled();

    await act(async () => {
      resolveWrite({});
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(runCodeSpark).toHaveBeenCalledTimes(1);
    });
  });

  it("shows an individual pass result on the visible check that was run", async () => {
    hydratedSession = hydratedFor();
    renderScene();

    fireEvent.click(
      screen.getByRole("button", { name: /run adds visible values/i }),
    );

    // Only the check that ran gets a per-check result, announced with its label.
    expect(
      await screen.findByRole("status", {
        name: /adds visible values: passed/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("status", {
        name: /formats the visible output:/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("does not label every criterion failed from one aggregate multi-check result", async () => {
    hydratedSession = hydratedFor();
    runCodeSpark.mockResolvedValueOnce({
      status: "failed",
      reason: "One visible check failed.",
    });
    renderScene();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    const testResults = screen.getByRole("region", { name: "Test results" });
    await waitFor(() => expect(testResults).toHaveTextContent("Failed"));

    expect(
      screen.queryByRole("status", {
        name: /adds visible values: failed/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("status", {
        name: /formats the visible output: failed/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes a cooldown/run-limit result from a generic failure", async () => {
    hydratedSession = hydratedFor();
    runCodeSpark.mockResolvedValueOnce({
      status: "unavailable",
      provider: "local_fake",
      stdout: "",
      stderr: "Code Spark run limit reached. Try again in a few seconds.",
      exitCode: undefined,
      durationMs: 0,
      timedOut: false,
      reason: "Code Spark run limit reached. Try again in a few seconds.",
    });

    renderScene();

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/run limit/i);
    expect(alert).toHaveTextContent(/wait a few seconds/i);
    // Cooldown reads as its own state, not a generic runtime failure.
    const runStatus = screen.getByRole("status", {
      name: "Code Spark run status",
    });
    expect(runStatus).toHaveTextContent(/run limit reached/i);
  });

  it("distinguishes a monthly entitlement limit from a short cooldown", async () => {
    hydratedSession = hydratedFor();
    runCodeSpark.mockResolvedValueOnce({
      status: "unavailable",
      provider: "local_fake",
      stdout: "",
      stderr:
        "Code Spark monthly run limit reached for this billing period. Your edits are saved.",
      exitCode: undefined,
      durationMs: 0,
      timedOut: false,
      reason:
        "Code Spark monthly run limit reached for this billing period. Your edits are saved.",
      code: "CODE_SPARK_MONTHLY_LIMIT",
    });

    renderScene();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/monthly run limit/i);
    expect(alert).toHaveTextContent(/next billing period/i);
    expect(alert).not.toHaveTextContent(/few seconds/i);
  });

  it("distinguishes provider-unavailable from a learner code failure in the alert", async () => {
    hydratedSession = hydratedFor();
    runCodeSpark.mockResolvedValueOnce({
      status: "unavailable",
      provider: "local_fake",
      stdout: "",
      stderr: "Code Spark runtime provider is unavailable.",
      exitCode: undefined,
      durationMs: 0,
      timedOut: false,
      reason: "Code Spark runtime provider is unavailable.",
    });

    renderScene();

    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/runner is unavailable/i);
    expect(alert).not.toHaveTextContent(/run limit/i);
  });

  it("frames a challenge code failure as not-passing-yet in the actionable alert", async () => {
    hydratedSession = hydratedFor();
    runCodeSpark.mockResolvedValueOnce({
      status: "failed",
      provider: "local_fake",
      stdout: "",
      stderr: "AssertionError: expected 5 but received 0",
      exitCode: 1,
      durationMs: 4,
      timedOut: false,
    });

    renderScene();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/not passing yet/i);
    expect(alert).not.toHaveTextContent(/runner is unavailable/i);
  });

  it("labels the initial query phase as workspace hydration, not a completed save", () => {
    renderScene();

    const hydrationStatus = screen.getByText(
      /preparing this code spark workspace/i,
    );
    expect(hydrationStatus).toBeVisible();
    expect(hydrationStatus).toHaveAttribute("data-state", "hydrating");
  });

  it("classifies a rejected run-limit action and redacts challenge internals", async () => {
    hydratedSession = hydratedFor();
    runCodeSpark.mockRejectedValueOnce(
      new Error(
        "[CONVEX A(codeSparkActions:run)] [Request ID: test-request] Server Error " +
          "Uncaught Error: Code Spark run limit reached. Try again in a few seconds.\n" +
          "    at handler (../convex/codeSparkActions.ts:101:18)\n" +
          "Command failed: node tests/add.check.ts\n" +
          "    at /tmp/studi/tests/add.check.ts:7:13",
      ),
    );

    renderScene();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/run limit reached/i);
    expect(alert).toHaveTextContent(/wait a few seconds/i);
    expect(
      screen.getByRole("status", { name: "Code Spark run status" }),
    ).toHaveTextContent(/run limit reached/i);

    const learnerSurface = document.body.textContent ?? "";
    expect(learnerSurface).not.toContain("[CONVEX");
    expect(learnerSurface).not.toContain("convex/codeSparkActions.ts");
    expect(learnerSurface).not.toContain("tests/add.check.ts");
    expect(learnerSurface).not.toContain("/tmp/studi");
  });

  it("keeps workspace syntax diagnostics while marking the caught run as failed", async () => {
    hydratedSession = hydratedFor();
    runCodeSpark.mockRejectedValueOnce(
      new Error("SyntaxError: expected ':' at src/main.py:4:1"),
    );

    renderScene({ mode: "workspace", language: "python" });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "SyntaxError: expected ':' at src/main.py:4:1",
    );
    expect(
      screen.getByRole("status", { name: "Code Spark run status" }),
    ).toHaveTextContent("Failed");
  });

  it("enables Monaco automatic layout so the editor follows its panel width", () => {
    renderInline();

    expect(monacoOptions).toMatchObject({ automaticLayout: true });
  });

  it("preserves the exact unsaved draft across inline unmount and expanded remount", () => {
    hydratedSession = hydratedFor();
    const draft =
      "export function add(a: number, b: number) {\n  return a + b; // exact draft\n}";

    const inline = render(
      <CodeSparkScene
        payload={payload}
        title="Add numbers"
        threadId="thread_draft"
        sparkId="spark_draft"
        isExpanded={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: { value: draft },
    });
    inline.unmount();

    const expanded = render(
      <CodeSparkScene
        payload={payload}
        title="Add numbers"
        threadId="thread_draft"
        sparkId="spark_draft"
        isExpanded
      />,
    );
    expect(screen.getByLabelText("Code editor")).toHaveValue(draft);
    expect(screen.getByText(/unsaved edits/i)).toBeVisible();
    expanded.unmount();

    render(
      <CodeSparkScene
        payload={payload}
        title="Add numbers"
        threadId="thread_draft"
        sparkId="spark_draft"
        isExpanded={false}
      />,
    );
    expect(screen.getByLabelText("Code editor")).toHaveValue(draft);
  });

  it.each([
    {
      actionLabel: "Run" as const,
      expectedStatus: "Failed",
      expectedResult: "CURRENT RUN RESULT",
      rejects: false,
    },
    {
      actionLabel: "Test" as const,
      expectedStatus: "Runtime unavailable",
      expectedResult: "ORIGINAL TEST ERROR",
      rejects: true,
    },
  ])(
    "preserves a deferred $actionLabel across inline-to-expanded remount without allocating twice",
    async ({ actionLabel, expectedStatus, expectedResult, rejects }) => {
      hydratedSession = hydratedFor({
        lastRun: {
          kind: "test",
          status: "passed",
          reason: "STALE RESULT MUST STAY HIDDEN",
          createdAt: 10,
        },
      });
      let finishAction: () => void = () => {};
      runCodeSpark.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finishAction = () => {
              if (rejects) {
                reject(new Error(expectedResult));
                return;
              }
              resolve({ status: "failed", reason: expectedResult });
            };
          }),
      );

      const inline = render(
        <CodeSparkScene
          payload={payload}
          title="Deferred remount"
          threadId="thread_pending"
          sparkId="spark_pending"
          isExpanded={false}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: actionLabel }));

      await waitFor(() => expect(runCodeSpark).toHaveBeenCalledTimes(1));
      expect(
        screen.getByRole("status", { name: "Code Spark run status" }),
      ).toHaveTextContent("Running");
      inline.unmount();

      render(
        <CodeSparkScene
          payload={payload}
          title="Deferred remount"
          threadId="thread_pending"
          sparkId="spark_pending"
          isExpanded
        />,
      );

      const remountedStatus = screen.getByRole("status", {
        name: "Code Spark run status",
      });
      expect(remountedStatus).toHaveTextContent("Running");
      expect(remountedStatus).not.toHaveTextContent(
        "STALE RESULT MUST STAY HIDDEN",
      );
      expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Test" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: actionLabel }));
      expect(runCodeSpark).toHaveBeenCalledTimes(1);

      await act(async () => {
        finishAction();
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(remountedStatus).toHaveTextContent(expectedStatus);
        expect(remountedStatus).toHaveTextContent(expectedResult);
      });
      expect(remountedStatus).not.toHaveTextContent(
        "STALE RESULT MUST STAY HIDDEN",
      );
      expect(
        screen.getAllByRole("status", { name: "Code Spark run status" }),
      ).toHaveLength(1);
      expect(runCodeSpark).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps a remounted editor locked until its deferred save and run finish", async () => {
    hydratedSession = hydratedFor();
    let resolveWrite: (value: unknown) => void = () => {};
    writeFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
    );
    const savedSnapshot = "export const answer = 5; // saved snapshot";
    const newerDraft = "export const answer = 6; // edited after remount";

    const inline = render(
      <CodeSparkScene
        payload={payload}
        title="Deferred save remount"
        threadId="thread_save_remount"
        sparkId="spark_save_remount"
        isExpanded={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: { value: savedSnapshot },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));
    inline.unmount();

    render(
      <CodeSparkScene
        payload={payload}
        title="Deferred save remount"
        threadId="thread_save_remount"
        sparkId="spark_save_remount"
        isExpanded
      />,
    );
    expect(screen.getByText(/saving your changes/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Run" })).toBeDisabled();
    expect(screen.getByLabelText("Code editor")).toHaveValue(savedSnapshot);
    expect(screen.getByLabelText("Code editor")).toHaveAttribute("readonly");

    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: { value: newerDraft },
    });
    expect(screen.getByLabelText("Code editor")).toHaveValue(savedSnapshot);
    await act(async () => {
      resolveWrite({});
      await Promise.resolve();
    });

    await waitFor(() => expect(runCodeSpark).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(
        screen.getByRole("status", { name: "Code Spark run status" }),
      ).toHaveTextContent("Passed");
    });
    expect(screen.getByLabelText("Code editor")).toHaveValue(savedSnapshot);
    expect(screen.getByLabelText("Code editor")).not.toHaveAttribute(
      "readonly",
    );
    expect(screen.queryByText(/unsaved edits/i)).not.toBeInTheDocument();
    expect(writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ contents: savedSnapshot }),
    );
  });

  it("isolates pending run state by both thread and spark key", async () => {
    hydratedSession = hydratedFor();
    let resolveAction: (value: {
      status: "failed";
      reason: string;
    }) => void = () => {};
    runCodeSpark.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAction = resolve;
        }),
    );

    const original = render(
      <CodeSparkScene
        payload={payload}
        title="Original pending run"
        threadId="thread_original"
        sparkId="spark_original"
        isExpanded={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(runCodeSpark).toHaveBeenCalledTimes(1));
    original.unmount();

    const differentSpark = render(
      <CodeSparkScene
        payload={payload}
        title="Different spark"
        threadId="thread_original"
        sparkId="spark_other"
        isExpanded
      />,
    );
    expect(
      screen.getByRole("status", { name: "Code Spark run status" }),
    ).not.toHaveTextContent("Running");
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    differentSpark.unmount();

    const differentThread = render(
      <CodeSparkScene
        payload={payload}
        title="Different thread"
        threadId="thread_other"
        sparkId="spark_original"
        isExpanded
      />,
    );
    expect(
      screen.getByRole("status", { name: "Code Spark run status" }),
    ).not.toHaveTextContent("Running");
    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    differentThread.unmount();

    await act(async () => {
      resolveAction({
        status: "failed",
        reason: "ORIGINAL KEY RESULT",
      });
      await Promise.resolve();
    });

    render(
      <CodeSparkScene
        payload={payload}
        title="Original pending run"
        threadId="thread_original"
        sparkId="spark_original"
        isExpanded
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByRole("status", { name: "Code Spark run status" }),
      ).toHaveTextContent("ORIGINAL KEY RESULT");
    });
    expect(runCodeSpark).toHaveBeenCalledTimes(1);
  });

  it("isolates remount drafts by thread and spark key", () => {
    hydratedSession = hydratedFor();
    const firstDraft = "export const owner = 'first-spark';";

    const first = render(
      <CodeSparkScene
        payload={payload}
        title="First"
        threadId="thread_isolation"
        sparkId="spark_first"
        isExpanded={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: { value: firstDraft },
    });
    first.unmount();

    const second = render(
      <CodeSparkScene
        payload={payload}
        title="Second"
        threadId="thread_isolation"
        sparkId="spark_second"
        isExpanded
      />,
    );
    expect(screen.getByLabelText("Code editor")).toHaveValue(
      payload.files[0].contents,
    );
    second.unmount();

    render(
      <CodeSparkScene
        payload={payload}
        title="First"
        threadId="thread_isolation"
        sparkId="spark_first"
        isExpanded
      />,
    );
    expect(screen.getByLabelText("Code editor")).toHaveValue(firstDraft);
  });

  it("expires an unowned remount draft after its bounded retention window", () => {
    vi.useFakeTimers();
    hydratedSession = hydratedFor();
    const expiringDraft = "export const temporary = 'draft';";

    const first = render(
      <CodeSparkScene
        payload={payload}
        title="Expiring draft"
        threadId="thread_expiring"
        sparkId="spark_expiring"
        isExpanded={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: { value: expiringDraft },
    });
    first.unmount();

    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1_000);
    });

    render(
      <CodeSparkScene
        payload={payload}
        title="Expiring draft"
        threadId="thread_expiring"
        sparkId="spark_expiring"
        isExpanded
      />,
    );
    expect(screen.getByLabelText("Code editor")).toHaveValue(
      payload.files[0].contents,
    );
    vi.useRealTimers();
  });

  it("expires an unowned settled run snapshot after its bounded retention window", async () => {
    hydratedSession = hydratedFor({
      lastRun: {
        kind: "test",
        status: "passed",
        reason: "PERSISTED RESULT AFTER RETENTION",
        createdAt: 50,
      },
    });
    runCodeSpark.mockResolvedValueOnce({
      status: "failed",
      reason: "LOCAL RESULT BEFORE RETENTION",
    });

    const first = render(
      <CodeSparkScene
        payload={payload}
        title="Expiring run"
        threadId="thread_expiring_run"
        sparkId="spark_expiring_run"
        isExpanded={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    await waitFor(() => {
      expect(
        screen.getByRole("status", { name: "Code Spark run status" }),
      ).toHaveTextContent("LOCAL RESULT BEFORE RETENTION");
    });

    vi.useFakeTimers();
    first.unmount();
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1_000);
    });

    render(
      <CodeSparkScene
        payload={payload}
        title="Expiring run"
        threadId="thread_expiring_run"
        sparkId="spark_expiring_run"
        isExpanded
      />,
    );
    const remountedStatus = screen.getByRole("status", {
      name: "Code Spark run status",
    });
    expect(remountedStatus).toHaveTextContent(
      "PERSISTED RESULT AFTER RETENTION",
    );
    expect(remountedStatus).not.toHaveTextContent(
      "LOCAL RESULT BEFORE RETENTION",
    );
    vi.useRealTimers();
  });

  it("replaces a prior successful snapshot and check badge when a retry is rejected", async () => {
    hydratedSession = hydratedFor();
    runCodeSpark
      .mockResolvedValueOnce({
        status: "passed",
        provider: "local_fake",
        stdout: "FIRST SUCCESS MUST DISAPPEAR",
        stderr: "",
        exitCode: 0,
        durationMs: 4,
        timedOut: false,
      })
      .mockRejectedValueOnce(
        new Error(
          "Code Spark runtime provider is unavailable at /workspace/run",
        ),
      );

    renderScene();
    const check = screen.getByRole("button", {
      name: /run adds visible values/i,
    });
    fireEvent.click(check);
    expect(
      await screen.findByRole("status", {
        name: /adds visible values: passed/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Code Spark run status" }),
    ).toHaveTextContent("FIRST SUCCESS MUST DISAPPEAR");

    fireEvent.click(check);

    await waitFor(() => {
      expect(
        screen.getByRole("status", { name: "Code Spark run status" }),
      ).toHaveTextContent(/runtime unavailable/i);
    });
    expect(
      screen.getByRole("status", { name: "Code Spark run status" }),
    ).not.toHaveTextContent("FIRST SUCCESS MUST DISAPPEAR");
    expect(
      screen.getByRole("status", {
        name: /adds visible values: couldn't run/i,
      }),
    ).toBeInTheDocument();
  });

  it("describes only the visible checks without private or hidden count claims", () => {
    renderScene({ hiddenTestCount: 7 });

    expect(screen.getByText("2 visible checks")).toBeInTheDocument();
    expect(
      screen.queryByText(/private checks hidden/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/no hidden checks/i)).not.toBeInTheDocument();
  });

  it("redacts Windows paths and common execution roots while keeping learner diagnostics", async () => {
    hydratedSession = hydratedFor();
    const roots = [
      String.raw`C:\\workspace\\tests\\answer.check.py:7:2`,
      "/app/tests/answer.check.py:7:2",
      "/root/project/main.py:4:1",
      "/opt/runtime/main.py:4:1",
      "/srv/app/main.py:4:1",
      "/workspace/main.py:4:1",
      "/vercel/sandbox/main.py:4:1",
      "/sandbox/main.py:4:1",
      "/var/tmp/studi/main.py:4:1",
      "/test/main.py:4:1",
    ];
    runCodeSpark.mockResolvedValueOnce({
      status: "failed",
      provider: "local_fake",
      stdout: "AssertionError: expected 5 but received 0",
      stderr: roots.join("\n"),
      exitCode: 1,
      durationMs: 4,
      timedOut: false,
    });

    renderScene();
    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    const runStatus = screen.getByRole("status", {
      name: "Code Spark run status",
    });
    await waitFor(() => expect(runStatus).toHaveTextContent("Failed"));
    expect(runStatus).toHaveTextContent(
      "AssertionError: expected 5 but received 0",
    );
    for (const root of roots) {
      expect(runStatus).not.toHaveTextContent(root);
    }
  });

  it("uses ordinary pressed file buttons and omits the non-working Lab control", () => {
    renderScene({ mode: "workspace" });

    const activeFile = screen.getByRole("button", { name: /src\/add\.ts/ });
    const otherFile = screen.getByRole("button", { name: /src\/format\.ts/ });
    expect(activeFile).toHaveAttribute("aria-pressed", "true");
    expect(otherFile).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Lab" }),
    ).not.toBeInTheDocument();
  });

  it("locks editing during save/run so output cannot lag behind visible code", async () => {
    hydratedSession = hydratedFor();
    let resolveWrite: (value: unknown) => void = () => {};
    writeFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
    );

    const view = renderScene();
    const savedSnapshot =
      "export function add(a: number, b: number) { return a + b; }";
    const newerDraft =
      "export function add(a: number, b: number) { return a - b; } // newer edit";

    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: { value: savedSnapshot },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(writeFile).toHaveBeenCalledWith(
        expect.objectContaining({ contents: savedSnapshot }),
      );
      expect(screen.getByText(/saving your changes/i)).toBeVisible();
    });

    expect(screen.getByLabelText("Code editor")).toHaveAttribute("readonly");
    fireEvent.change(screen.getByLabelText("Code editor"), {
      target: { value: newerDraft },
    });
    expect(screen.getByLabelText("Code editor")).toHaveValue(savedSnapshot);

    await act(async () => {
      resolveWrite({});
      await Promise.resolve();
    });
    await waitFor(() => expect(runCodeSpark).toHaveBeenCalledTimes(1));

    await waitFor(() => {
      expect(screen.getByLabelText("Code editor")).not.toHaveAttribute(
        "readonly",
      );
    });
    expect(screen.getByLabelText("Code editor")).toHaveValue(savedSnapshot);

    // A reactive query echo of the just-saved snapshot remains consistent with
    // the code that actually ran.
    hydratedSession = hydratedFor({
      files: payload.files.map((file) =>
        file.path === "src/add.ts"
          ? { ...file, contents: savedSnapshot }
          : file,
      ),
    });
    view.rerender(
      <CodeSparkScene
        payload={payload}
        title="Add numbers"
        threadId="thread_1"
        sparkId="spark_1"
        isExpanded
      />,
    );

    expect(screen.getByLabelText("Code editor")).toHaveValue(savedSnapshot);
  });

  it("does not restore an older hydrated run or check state during or after a new run", async () => {
    const staleHydratedRun = {
      kind: "test" as const,
      status: "passed" as const,
      reason: "Old check passed.",
      createdAt: 10,
    };
    hydratedSession = hydratedFor({ lastRun: staleHydratedRun });

    let resolveSecondRun: (value: unknown) => void = () => {};
    runCodeSpark
      .mockResolvedValueOnce({
        status: "passed",
        reason: "Check passed.",
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondRun = resolve;
          }),
      );

    const view = renderScene();
    const check = screen.getByRole("button", {
      name: /run adds visible values/i,
    });

    fireEvent.click(check);
    expect(
      await screen.findByRole("status", {
        name: /adds visible values: passed/i,
      }),
    ).toBeInTheDocument();

    fireEvent.click(check);
    await waitFor(() => {
      expect(
        screen.queryByRole("status", {
          name: /adds visible values: passed/i,
        }),
      ).not.toBeInTheDocument();
    });

    hydratedSession = hydratedFor({
      lastRun: {
        ...staleHydratedRun,
        reason: "STALE HYDRATED STDOUT MUST STAY HIDDEN",
      },
    });
    view.rerender(
      <CodeSparkScene
        payload={payload}
        title="Add numbers"
        threadId="thread_1"
        sparkId="spark_1"
        isExpanded
      />,
    );

    const runStatus = screen.getByRole("status", {
      name: "Code Spark run status",
    });
    expect(runStatus).toHaveTextContent("Running");
    expect(runStatus).not.toHaveTextContent(
      "STALE HYDRATED STDOUT MUST STAY HIDDEN",
    );

    await act(async () => {
      resolveSecondRun({
        status: "failed",
        reason: "Check failed. Review your code and try again.",
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(runStatus).toHaveTextContent("Failed");
      expect(runStatus).toHaveTextContent(
        "Check failed. Review your code and try again.",
      );
    });
    expect(
      screen.getByRole("status", {
        name: /adds visible values: failed/i,
      }),
    ).toBeInTheDocument();

    // The same lagging query value can arrive once more after the action
    // resolves; it must not replace the local result or badge.
    hydratedSession = hydratedFor({
      lastRun: {
        ...staleHydratedRun,
        reason: "STALE HYDRATED RESULT AFTER COMPLETION",
      },
    });
    view.rerender(
      <CodeSparkScene
        payload={payload}
        title="Add numbers"
        threadId="thread_1"
        sparkId="spark_1"
        isExpanded
      />,
    );
    expect(runStatus).toHaveTextContent(
      "Check failed. Review your code and try again.",
    );
    expect(runStatus).not.toHaveTextContent(
      "STALE HYDRATED RESULT AFTER COMPLETION",
    );
  });

  it("accepts persisted Challenge hydration before any local run even without createdAt", async () => {
    hydratedSession = hydratedFor({
      lastRun: {
        kind: "test",
        status: "failed",
        reason: "Persisted Challenge result is current.",
      },
    });

    renderScene({
      lastRun: {
        kind: "test",
        status: "passed",
        provider: "local_fake",
        stdout: "STALE ARTIFACT RESULT",
        stderr: "",
        createdAt: 1,
      },
    });

    const runStatus = screen.getByRole("status", {
      name: "Code Spark run status",
    });
    await waitFor(() => {
      expect(runStatus).toHaveTextContent("Failed");
      expect(runStatus).toHaveTextContent(
        "Persisted Challenge result is current.",
      );
    });
    expect(runStatus).not.toHaveTextContent("STALE ARTIFACT RESULT");
  });

  it("normalizes the public action union without inventing challenge metadata", () => {
    type Normalizer = (args: {
      kind: "run" | "test";
      command: string;
      createdAt: number;
      result:
        | {
            status: "failed" | "passed";
            reason: string;
            stdout?: string;
            stderr?: string;
            exitCode?: number;
            durationMs?: number;
            timedOut?: boolean;
          }
        | {
            status: "passed";
            provider: "local_fake";
            stdout: string;
            stderr: string;
            exitCode?: number;
            durationMs: number;
            reason?: string;
          };
    }) => Record<string, unknown>;
    const normalizeCodeSparkActionResult = (
      CodeSparkSceneModule as unknown as {
        normalizeCodeSparkActionResult?: Normalizer;
      }
    ).normalizeCodeSparkActionResult;

    expect(normalizeCodeSparkActionResult).toBeTypeOf("function");
    expect(
      normalizeCodeSparkActionResult?.({
        kind: "test",
        command: "node tests/private.check.ts",
        createdAt: 123,
        result: {
          status: "failed",
          reason: "Check failed. Review your code and try again.",
        },
      }),
    ).toEqual({
      kind: "test",
      status: "failed",
      reason: "Check failed. Review your code and try again.",
      createdAt: 123,
    });
    expect(
      normalizeCodeSparkActionResult?.({
        kind: "run",
        command: "node src/add.ts",
        createdAt: 321,
        result: {
          status: "passed",
          reason: "Program finished.",
          stdout: "5\n",
          stderr: "",
          exitCode: 0,
          durationMs: 3,
          timedOut: false,
        },
      }),
    ).toEqual({
      kind: "run",
      status: "passed",
      command: "node src/add.ts",
      stdout: "5\n",
      stderr: "",
      exitCode: 0,
      durationMs: 3,
      reason: "Program finished.",
      createdAt: 321,
    });
    expect(
      normalizeCodeSparkActionResult?.({
        kind: "run",
        command: "node src/add.ts",
        createdAt: 456,
        result: {
          status: "passed",
          provider: "local_fake",
          stdout: "5",
          stderr: "",
          exitCode: 0,
          durationMs: 4,
        },
      }),
    ).toEqual({
      kind: "run",
      status: "passed",
      provider: "local_fake",
      command: "node src/add.ts",
      stdout: "5",
      stderr: "",
      exitCode: 0,
      durationMs: 4,
      reason: undefined,
      createdAt: 456,
    });
  });

  it("keeps file-state tags legible on the dark editor chrome and edited distinct from read", () => {
    // Tabs live inside the dark editor chrome, so both tags must use light
    // tones, and the unsaved "edited" tag must not share the quiet "read" tone.
    expect(codeSparkStyles).toMatch(
      /\.code-spark-file-state\s*{[^}]*color:\s*#8fa0ad/,
    );
    expect(codeSparkStyles).toMatch(
      /\.code-spark-file-state\[data-state="edited"\]\s*{[^}]*color:\s*#e0b568/,
    );
    expect(codeSparkStyles).toMatch(
      /\.code-spark-active-tag\s*{[^}]*color:\s*#8fa0ad/,
    );
  });

  it("keeps one narrow expanded Run/Test action group sticky within the workbench", () => {
    renderScene();
    expect(screen.getAllByRole("button", { name: "Run" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Test" })).toHaveLength(1);

    const narrowContainerStyles = codeSparkStyles.slice(
      codeSparkStyles.indexOf("@container code-spark (max-width: 720px)"),
    );
    expect(narrowContainerStyles).toMatch(
      /\.code-spark-toolbar\s*{[^}]*position:\s*sticky;[^}]*top:\s*0;/,
    );
  });

  it("keeps file tabs and visible-check actions at a 44px touch target", () => {
    expect(codeSparkStyles).toMatch(
      /\.code-spark-filetab\s*{[^}]*min-height:\s*44px/,
    );
    expect(codeSparkStyles).toMatch(
      /\.code-spark-checks \.code-spark-btn-check\s*{[^}]*min-height:\s*44px/,
    );
  });

  it("keeps Spark expansion chrome touch-sized and disables panel motion when requested", () => {
    expect(codeSparkStyles).toMatch(
      /\.spark-card-expand\s*{[^}]*min-height:\s*44px[^}]*min-width:\s*44px/,
    );
    expect(codeSparkStyles).toMatch(
      /\.spark-panel-back\s*{[^}]*min-height:\s*44px[^}]*min-width:\s*44px/,
    );
    expect(codeSparkStyles).toMatch(
      /\.mobile-panel-tab\s*{[^}]*min-height:\s*44px/,
    );
    expect(codeSparkStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.spark-panel\s*{[^}]*animation:\s*none/,
    );
  });

  it("styles the non-live test result status by its stable class", () => {
    expect(codeSparkStyles).toMatch(
      /\.code-spark-terminal-status,\s*\.code-spark-test-results-status\s*{/,
    );
    expect(codeSparkStyles).not.toContain(
      '.code-spark-test-results-head > [role="status"]',
    );
  });
});
