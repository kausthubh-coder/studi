import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, waitFor } from "storybook/test";

import {
  addNumbersCodeSparkPayload,
  failedCodeSparkResult,
  hydratedAddNumbersSession,
  passedCodeSparkResult,
  timedOutCodeSparkResult,
  unavailableCodeSparkRun,
} from "../../../.storybook/fixtures/code-spark";
import type {
  CodeSparkPayload,
  CodeSparkRunSummary,
} from "@/lib/sparks/contracts";
import CodeSparkScene, {
  __resetCodeSparkDraftBuffersForTests,
} from "./CodeSparkScene";

const formatFile = {
  path: "src/format.ts",
  language: "typescript",
  contents: "export const format = (value: number) => String(value);",
  editable: true,
  role: "starter",
} as const;

const formatCheck = {
  id: "formats_visible_output",
  label: "formats the visible output",
  command: "bun tests/format.check.ts",
  hidden: false,
} as const;

const multiFileChallengePayload = {
  ...addNumbersCodeSparkPayload,
  instructions:
    "Repair add(), then decide how the result should be formatted for a learner.",
  files: [
    addNumbersCodeSparkPayload.files[0],
    formatFile,
    addNumbersCodeSparkPayload.files[1],
  ],
  tests: [...addNumbersCodeSparkPayload.tests, formatCheck],
} satisfies CodeSparkPayload;

const workspacePayload = {
  ...multiFileChallengePayload,
  mode: "workspace",
  instructions:
    "Explore the tiny TypeScript workspace, run the program, and inspect its visible checks.",
} satisfies CodeSparkPayload;

const archivedRustPayload = {
  ...addNumbersCodeSparkPayload,
  mode: "workspace",
  language: "rust",
  instructions:
    "Inspect this historical Rust workspace from an earlier Code Spark session.",
  provider: "unavailable",
  providerStatus: "unavailable",
  activePath: "src/main.rs",
  files: [
    {
      path: "src/main.rs",
      language: "rust",
      contents: 'fn main() { println!("hello from the archive"); }',
      editable: true,
      role: "starter",
    },
    {
      path: "README.md",
      language: "rust",
      contents: "This workspace is preserved for inspection only.",
      editable: false,
      role: "readme",
    },
  ],
  tests: [],
  runCommand: "cargo run",
  testCommand: "cargo test",
} satisfies CodeSparkPayload<"rust">;

const emptyPayload = {
  ...addNumbersCodeSparkPayload,
  activePath: "",
  files: [],
  tests: [],
} satisfies CodeSparkPayload;

const persistedPass = {
  kind: "run",
  status: "passed",
  provider: "vercel_sandbox",
  command: "bun src/add.ts",
  stdout: "5\n",
  stderr: "",
  exitCode: 0,
  durationMs: 42,
  createdAt: Date.UTC(2026, 6, 10, 16, 0, 0),
  reason: "Program finished.",
} satisfies CodeSparkRunSummary;

const persistedFailure = {
  kind: "test",
  status: "failed",
  provider: "vercel_sandbox",
  command: "bun tests/add.check.ts",
  stdout: "",
  stderr: "AssertionError: expected 5, received 0",
  exitCode: 1,
  durationMs: 38,
  createdAt: Date.UTC(2026, 6, 10, 16, 1, 0),
  reason: "The visible check did not pass yet.",
} satisfies CodeSparkRunSummary;

function hydratedFor<TLanguage extends CodeSparkPayload["language"]>(
  payload: CodeSparkPayload<TLanguage>,
  overrides: Record<string, unknown> = {},
) {
  return {
    provider: payload.provider,
    providerStatus: payload.providerStatus,
    activePath: payload.activePath,
    files: payload.files,
    tests: payload.tests,
    hiddenTestCount: payload.hiddenTestCount,
    runCommand: payload.runCommand,
    testCommand: payload.testCommand,
    lastRun: payload.lastRun ?? null,
    ...overrides,
  };
}

const runInteractiveFlow = fn(async () => ({
  ...passedCodeSparkResult,
  reason: "The latest learner draft ran successfully.",
}));
const saveInteractiveFile = fn(async () => ({}));
const runCooldown = fn(async () => ({
  status: "unavailable" as const,
  provider: "local_fake" as const,
  stdout: "",
  stderr: "Code Spark run limit reached. Try again in a few seconds.",
  durationMs: 0,
  reason: "Code Spark run limit reached. Try again in a few seconds.",
  code: "CODE_SPARK_COOLDOWN" as const,
  retryAfterMs: 5_000,
}));
const runMonthlyLimit = fn(async () => ({
  status: "unavailable" as const,
  provider: "local_fake" as const,
  stdout: "",
  stderr:
    "Code Spark monthly run limit reached for this billing period. Your edits are saved.",
  durationMs: 0,
  reason:
    "Code Spark monthly run limit reached for this billing period. Your edits are saved.",
  code: "CODE_SPARK_MONTHLY_LIMIT" as const,
}));
const runTimedOut = fn(async () => timedOutCodeSparkResult);
const runRejected = fn(async () => {
  throw new Error("The execution service could not accept this run.");
});

const storyHandlers = [
  runInteractiveFlow,
  saveInteractiveFile,
  runCooldown,
  runMonthlyLimit,
  runTimedOut,
  runRejected,
];

function resetCodeSparkStories() {
  __resetCodeSparkDraftBuffersForTests();
  for (const handler of storyHandlers) handler.mockClear();
  return () => __resetCodeSparkDraftBuffersForTests();
}

const meta = {
  title: "Sparks/Scenes/CodeSparkScene",
  component: CodeSparkScene,
  tags: ["autodocs", "ai-generated"],
  beforeEach: resetCodeSparkStories,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The editable Code Spark workbench. These stories isolate Convex and Monaco, exercise honest provider states, and preserve the challenge boundary that hides implementation checks from learners.",
      },
    },
    studi: {
      convex: {
        queries: {
          "codeSparks:getSessionForSpark": hydratedAddNumbersSession,
        },
      },
    },
  },
  decorators: [
    (Story) => (
      <main
        style={{
          minHeight: "100vh",
          padding: "1rem",
          background: "var(--bg)",
        }}
      >
        <div style={{ width: "min(1120px, 100%)", margin: "0 auto" }}>
          <Story />
        </div>
      </main>
    ),
  ],
  args: {
    payload: addNumbersCodeSparkPayload,
    title: "Repair add()",
    threadId: "thread_story_code_spark",
    sparkId: "spark_story_code_spark",
    isExpanded: false,
  },
} satisfies Meta<typeof CodeSparkScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChallengeReadyInline: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("note", { name: "Challenge guidance" }),
    ).toHaveTextContent(/use test for feedback/i);
    await expect(canvas.getByRole("button", { name: "Run" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "Test" })).toBeEnabled();
    await expect(
      canvas.queryByRole("button", { name: /tests\/add\.check\.ts/i }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("region", { name: "Terminal" }),
    ).toHaveTextContent("Run your code to see output.");
    await expect(
      canvasElement.querySelector(".code-spark-inline"),
    ).toHaveAttribute("data-layout", "inline");
  },
};

export const ChallengeReadyExpanded: Story = {
  args: {
    isExpanded: true,
    sparkId: "spark_story_challenge_expanded",
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("complementary", {
        name: "Code Spark task and criteria",
      }),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Code editor")).not.toHaveAttribute(
      "readonly",
    );
    await expect(
      canvasElement.querySelector(".code-spark-shell"),
    ).toHaveAttribute("data-layout", "expanded");
  },
};

export const WorkspaceReady: Story = {
  args: {
    payload: workspacePayload,
    title: "Explore add()",
    sparkId: "spark_story_workspace",
    isExpanded: true,
  },
  parameters: {
    studi: {
      convex: {
        queries: {
          "codeSparks:getSessionForSpark": hydratedFor(workspacePayload),
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("note", { name: "Sandbox guidance" }),
    ).toHaveTextContent(/inspect the terminal/i);
    await expect(
      canvas.getByRole("button", { name: /tests\/add\.check\.ts/i }),
    ).toBeVisible();
    await expect(canvas.getByText("bun tests/add.check.ts")).toBeVisible();
  },
};

export const DetachedFromThread: Story = {
  args: {
    threadId: null,
    sparkId: "spark_story_detached",
  },
  play: async ({ canvas }) => {
    const guidance = canvas.getByText(
      "Open this thread to run this Code Spark.",
    );
    await expect(guidance).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Run" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Test" })).toBeDisabled();
  },
};

export const NoFiles: Story = {
  args: {
    payload: emptyPayload,
    sparkId: "spark_story_no_files",
    isExpanded: true,
  },
  parameters: {
    studi: {
      convex: {
        queries: {
          "codeSparks:getSessionForSpark": hydratedFor(emptyPayload),
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Code Spark has no files.",
    );
    await expect(
      canvas.queryByLabelText("Code editor"),
    ).not.toBeInTheDocument();
  },
};

export const ArchivedLanguage: Story = {
  args: {
    payload: archivedRustPayload,
    title: "Archived Rust greeting",
    sparkId: "spark_story_archived",
    isExpanded: true,
  },
  parameters: {
    studi: {
      convex: {
        queries: {
          "codeSparks:getSessionForSpark": hydratedFor(archivedRustPayload),
        },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText(/archived rust code spark/i)).toBeVisible();
    await expect(canvas.getByLabelText("Code editor")).toHaveAttribute(
      "readonly",
    );
    await expect(canvas.getByRole("button", { name: "Run" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: /README\.md/i }));
    await expect(canvas.getByLabelText("Code editor")).toHaveValue(
      "This workspace is preserved for inspection only.",
    );
  },
};

export const PersistedPassingRun: Story = {
  args: {
    sparkId: "spark_story_persisted_pass",
  },
  parameters: {
    studi: {
      convex: {
        queries: {
          "codeSparks:getSessionForSpark": hydratedFor(
            addNumbersCodeSparkPayload,
            {
              provider: "vercel_sandbox",
              providerStatus: "configured",
              lastRun: persistedPass,
            },
          ),
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("status", { name: "Code Spark run status" }),
    ).toHaveTextContent("Passed");
    await expect(
      canvas.getByRole("region", { name: "Terminal" }),
    ).toHaveTextContent("5");
  },
};

export const PersistedFailingTest: Story = {
  args: {
    sparkId: "spark_story_persisted_failure",
  },
  parameters: {
    studi: {
      convex: {
        queries: {
          "codeSparks:getSessionForSpark": hydratedFor(
            addNumbersCodeSparkPayload,
            {
              provider: "vercel_sandbox",
              providerStatus: "configured",
              lastRun: persistedFailure,
            },
          ),
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("region", { name: "Test results" }),
    ).toHaveTextContent("Failed");
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      /not passing yet/i,
    );
    await expect(canvas.getByText(/expected 5, received 0/i)).toBeVisible();
  },
};

export const ProviderUnavailable: Story = {
  args: {
    payload: {
      ...addNumbersCodeSparkPayload,
      provider: "unavailable",
      providerStatus: "unavailable",
    },
    sparkId: "spark_story_provider_unavailable",
    isExpanded: true,
  },
  parameters: {
    studi: {
      convex: {
        queries: {
          "codeSparks:getSessionForSpark": hydratedFor(
            addNumbersCodeSparkPayload,
            {
              provider: "unavailable",
              providerStatus: "unavailable",
              lastRun: unavailableCodeSparkRun,
            },
          ),
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/runtime provider is unavailable/i),
    ).toBeVisible();
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      /runner is unavailable/i,
    );
    await expect(
      canvas.getByRole("status", { name: "Code Spark run status" }),
    ).toHaveTextContent("Runtime unavailable");
  },
};

export const CooldownAfterRun: Story = {
  args: { sparkId: "spark_story_cooldown" },
  parameters: {
    studi: {
      convex: {
        actions: { "codeSparkActions:run": runCooldown },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Run" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      /wait a few seconds/i,
    );
    await expect(runCooldown).toHaveBeenCalledWith({
      threadId: "thread_story_code_spark",
      sparkId: "spark_story_cooldown",
      mode: "run",
      timeoutMs: 15_000,
    });
  },
};

export const MonthlyLimitAfterRun: Story = {
  args: { sparkId: "spark_story_monthly_limit" },
  parameters: {
    studi: {
      convex: {
        actions: { "codeSparkActions:run": runMonthlyLimit },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Run" }));
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(/monthly run limit/i);
    await expect(alert).toHaveTextContent(/next billing period/i);
    await expect(alert).not.toHaveTextContent(/few seconds/i);
  },
};

export const TimedOutRun: Story = {
  args: { sparkId: "spark_story_timeout" },
  parameters: {
    studi: {
      convex: {
        actions: { "codeSparkActions:run": runTimedOut },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Run" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      /run took too long/i,
    );
    await expect(
      canvas.getByRole("region", { name: "Terminal" }),
    ).toHaveTextContent("Execution timed out.");
  },
};

export const RejectedRunError: Story = {
  args: { sparkId: "spark_story_rejected" },
  parameters: {
    studi: {
      convex: {
        actions: { "codeSparkActions:run": runRejected },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Run" }));
    const alert = await canvas.findByRole("alert");
    await expect(alert).toHaveTextContent(/runner is unavailable/i);
    await expect(alert).toHaveTextContent(
      "The execution service could not accept this run.",
    );
  },
};

export const FileEditingRunAndTestFlow: Story = {
  args: {
    payload: multiFileChallengePayload,
    title: "Repair and format add()",
    sparkId: "spark_story_interactions",
    isExpanded: true,
  },
  parameters: {
    studi: {
      convex: {
        queries: {
          "codeSparks:getSessionForSpark": hydratedFor(
            multiFileChallengePayload,
          ),
        },
        actions: { "codeSparkActions:run": runInteractiveFlow },
        mutations: { "codeSparks:writeFile": saveInteractiveFile },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    const editor = canvas.getByLabelText("Code editor");
    await userEvent.click(
      canvas.getByRole("button", { name: /src\/format\.ts/i }),
    );
    await expect(editor).toHaveValue(formatFile.contents);
    fireEvent.change(editor, {
      target: { value: "export const format = String;" },
    });
    await expect(editor).toHaveValue("export const format = String;");
    await expect(
      canvas.getByRole("button", { name: /src\/format\.ts edited/i }),
    ).toBeVisible();

    await userEvent.click(
      canvas.getByRole("button", { name: /src\/add\.ts/i }),
    );
    fireEvent.change(editor, {
      target: { value: "export const add = Number;" },
    });
    await expect(editor).toHaveValue("export const add = Number;");
    await expect(canvas.getByText(/unsaved edits/i)).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Run" }));
    await waitFor(() => expect(saveInteractiveFile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(runInteractiveFlow).toHaveBeenCalledTimes(1));
    await expect(saveInteractiveFile).toHaveBeenNthCalledWith(1, {
      threadId: "thread_story_code_spark",
      sparkId: "spark_story_interactions",
      path: "src/format.ts",
      contents: "export const format = String;",
    });
    await expect(saveInteractiveFile).toHaveBeenNthCalledWith(2, {
      threadId: "thread_story_code_spark",
      sparkId: "spark_story_interactions",
      path: "src/add.ts",
      contents: "export const add = Number;",
    });
    await expect(
      canvas.getByRole("region", { name: "Terminal" }),
    ).toHaveTextContent("visible check passed");

    await userEvent.click(canvas.getByRole("button", { name: "Test" }));
    await waitFor(() => expect(runInteractiveFlow).toHaveBeenCalledTimes(2));
    await expect(runInteractiveFlow).toHaveBeenNthCalledWith(2, {
      threadId: "thread_story_code_spark",
      sparkId: "spark_story_interactions",
      mode: "test",
      timeoutMs: 15_000,
    });
    await expect(
      canvas.getByRole("region", { name: "Test results" }),
    ).toHaveTextContent("Passed");
  },
};

export const FailedVisibleCheckInteraction: Story = {
  args: { sparkId: "spark_story_failed_check" },
  parameters: {
    studi: {
      convex: {
        actions: {
          "codeSparkActions:run": fn(async () => failedCodeSparkResult),
        },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Test" }));
    await expect(
      await canvas.findByRole("status", {
        name: /adds visible numbers: failed/i,
      }),
    ).toBeVisible();
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      /not passing yet/i,
    );
  },
};

export const MobileInline: Story = {
  args: {
    sparkId: "spark_story_mobile",
  },
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360, minHeight: 720, margin: "0 auto" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("button", { name: "Run" })).toBeVisible();
    await expect(canvas.getByLabelText("Code editor")).toBeVisible();
    await expect(
      canvasElement.querySelector(".code-spark-inline"),
    ).toHaveAttribute("data-layout", "inline");
  },
};
