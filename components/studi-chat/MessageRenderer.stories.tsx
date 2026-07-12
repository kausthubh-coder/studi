import type { UIMessage } from "@convex-dev/agent/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { sparkSceneVersion, type SparkArtifact } from "@/lib/sparks/contracts";
import { ArticleMessage } from "./MessageRenderer";

const diagramDataUrl =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#dff4ef"/><path d="M25 145 Q160 15 295 145" fill="none" stroke="#287d6c" stroke-width="8"/><text x="160" y="168" text-anchor="middle" font-family="sans-serif" font-size="18">A changing slope</text></svg>',
  );

const quizArtifact: SparkArtifact = {
  kind: "spark_quiz",
  version: sparkSceneVersion,
  sparkType: "quiz",
  mode: "readonly",
  artifactId: "derivative-check",
  title: "Check your derivative intuition",
  summary: "One question to test the idea you just discovered.",
  payload: {
    instructions: "Choose first, then inspect the explanation.",
    questions: [
      {
        id: "local-slope",
        prompt: "What does a derivative tell you at one point?",
        choices: [
          { id: "height", text: "The graph's height" },
          { id: "slope", text: "Its instantaneous slope" },
          { id: "area", text: "The area under the graph" },
        ],
        correctChoiceId: "slope",
        explanation: "Nearby secant slopes approach the tangent slope.",
      },
    ],
  },
};

function message(
  role: "user" | "assistant",
  text: string,
  parts: UIMessage["parts"],
  options: { key?: string; status?: UIMessage["status"] } = {},
): UIMessage {
  return {
    id: options.key ?? `${role}-story`,
    key: options.key ?? `${role}-story`,
    order: 0,
    stepOrder: 0,
    role,
    text,
    parts,
    status: options.status ?? "done",
    _creationTime: 1_700_000_000_000,
  } as unknown as UIMessage;
}

const meta = {
  component: ArticleMessage,
  tags: ["autodocs", "ai-generated"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <main
        style={{
          minHeight: "100vh",
          padding: "3rem 1.5rem",
          background: "var(--bg)",
        }}
      >
        <div style={{ maxWidth: "var(--column-max)", margin: "0 auto" }}>
          <Story />
        </div>
      </main>
    ),
  ],
  args: {
    message: message("user", "Why does the slope change here?", [
      { type: "text", text: "Why does the slope change here?" } as never,
    ]),
    index: 0,
    threadId: "thread_story",
    onExpandSpark: fn(),
    expandedSparkInstanceId: null,
  },
} satisfies Meta<typeof ArticleMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UserText: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Why does the slope change here?"),
    ).toBeInTheDocument();
  },
};

export const UserImageAndDocument: Story = {
  args: {
    message: message("user", "Can we reason from these notes?", [
      { type: "text", text: "Can we reason from these notes?" } as never,
      {
        type: "file",
        mediaType: "image/svg+xml",
        filename: "slope-diagram.svg",
        url: diagramDataUrl,
      } as never,
      {
        type: "file",
        mediaType: "application/pdf",
        filename: "calculus-notes.pdf",
        url: "data:application/pdf;base64,JVBERi0xLjQK",
      } as never,
    ]),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByAltText("slope-diagram.svg")).toBeInTheDocument();
    await expect(canvas.getByText("calculus-notes.pdf")).toBeInTheDocument();
  },
};

export const AssistantMarkdownMathAndCode: Story = {
  args: {
    message: message(
      "assistant",
      "",
      [
        {
          type: "text",
          text: [
            "### Follow the change, not the formula",
            "",
            "If $f(x)=x^2$, then $f'(x)=2x$.",
            "",
            "| At x | Local slope |",
            "| ---: | ----------: |",
            "| 1 | 2 |",
            "| 3 | 6 |",
            "",
            "```ts",
            "const slopeAt = (x: number) => 2 * x;",
            "```",
            "",
            "What pattern do you notice before we name the rule?",
          ].join("\n"),
        } as never,
      ],
      { key: "assistant-markdown" },
    ),
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByRole("heading", {
        name: "Follow the change, not the formula",
      }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("table")).toBeInTheDocument();
    await expect(canvasElement.querySelector("pre code")).toHaveTextContent(
      "const slopeAt",
    );
  },
};

export const ReasoningStreaming: Story = {
  args: {
    message: message(
      "assistant",
      "",
      [
        {
          type: "reasoning",
          state: "streaming",
          text: "Connect the learner's secant-line observation to a tangent without giving away the conclusion.",
        } as never,
        { type: "text", text: "Compare the two nearby slopes first." } as never,
      ],
      { key: "assistant-reasoning", status: "streaming" },
    ),
  },
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole("button", { name: /working/i });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getAllByText(/secant-line observation/i)).toHaveLength(
      2,
    );
  },
};

export const CompletedToolDetails: Story = {
  args: {
    message: message(
      "assistant",
      "",
      [
        { type: "text", text: "Let me inspect the learner's notes." } as never,
        {
          type: "tool-search_notes",
          toolCallId: "search-story",
          state: "output-available",
          input: { query: "instantaneous rate of change" },
          output: {
            status: "success",
            summary: "Found the secant-line sketch.",
          },
        } as never,
        {
          type: "text",
          text: "Which two points would you move closer together?",
        } as never,
      ],
      { key: "assistant-tool" },
    ),
  },
  play: async ({ canvas, userEvent }) => {
    const toggle = canvas.getByRole("button", { name: /drafted response/i });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas.getByText("Found the secant-line sketch."),
    ).toBeInTheDocument();
  },
};

export const SparkBuilding: Story = {
  args: {
    message: message(
      "assistant",
      "",
      [
        {
          type: "tool-create_spark",
          toolCallId: "spark-building-story",
          state: "input-available",
          input: {
            sparkId: "moving_secant",
            context:
              "Build a draggable secant-line scene that reveals the tangent.",
          },
        } as never,
      ],
      { key: "assistant-spark-building", status: "streaming" },
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Building spark")).toBeInTheDocument();
    await expect(
      canvas.getByText(/draggable secant-line scene/i),
    ).toBeInTheDocument();
  },
};

export const SparkSuccess: Story = {
  args: {
    message: message(
      "assistant",
      "",
      [
        {
          type: "tool-create_spark",
          toolCallId: "spark-success-story",
          state: "output-available",
          input: { sparkId: "derivative_check" },
          output: {
            status: "success",
            workerSummary: "Created one focused check.",
            warnings: [],
            artifact: quizArtifact,
          },
        } as never,
        {
          type: "text",
          text: "Commit to an answer before checking it.",
        } as never,
      ],
      { key: "assistant-spark-success" },
    ),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Check your derivative intuition"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Commit to an answer before checking it."),
    ).toBeInTheDocument();
  },
};

export const SparkFailure: Story = {
  args: {
    message: message(
      "assistant",
      "",
      [
        {
          type: "tool-create_spark",
          toolCallId: "spark-failure-story",
          state: "output-available",
          input: { sparkId: "slope_scene" },
          output: {
            status: "failed",
            workerSummary: "The interactive scene could not be validated.",
            warnings: [],
            error:
              "Scene validation timed out before a safe artifact was produced.",
          },
        } as never,
      ],
      { key: "assistant-spark-failure" },
    ),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Slope Scene failed to build"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("timeout")).toBeInTheDocument();
  },
};

export const SparkUnexpectedOutput: Story = {
  args: {
    message: message(
      "assistant",
      "",
      [
        {
          type: "tool-create_spark",
          state: "output-available",
          input: { sparkId: "unexpected_scene" },
          output: { message: "not a valid Spark result" },
        } as never,
      ],
      { key: "assistant-spark-unexpected" },
    ),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Spark returned an unexpected output shape."),
    ).toBeInTheDocument();
  },
};

export const IntroAndFinalOrdering: Story = {
  args: {
    message: message(
      "assistant",
      "",
      [
        { type: "text", text: "First, inspect the two points." } as never,
        { type: "step-start" } as never,
        {
          type: "tool-measure_slope",
          state: "output-available",
          output: { status: "success", summary: "Measured both slopes." },
        } as never,
        {
          type: "text",
          text: "Now move them closer. What stays predictable?",
        } as never,
      ],
      { key: "assistant-ordering" },
    ),
  },
  play: async ({ canvas }) => {
    const intro = canvas.getAllByText("First, inspect the two points.")[0];
    const final = canvas.getByText(
      "Now move them closer. What stays predictable?",
    );
    await expect(
      Boolean(
        intro.compareDocumentPosition(final) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
  },
};
