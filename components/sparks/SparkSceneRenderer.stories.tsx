import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor } from "storybook/test";

import {
  sparkSceneV2Version,
  sparkSceneVersion,
  type SparkArtifact,
} from "@/lib/sparks/contracts";
import SparkSceneRenderer from "./SparkSceneRenderer";

const sceneArtifact: SparkArtifact = {
  kind: "spark_scene",
  version: sparkSceneV2Version,
  sparkType: "scene",
  mode: "editable",
  artifactId: "slope-scene",
  title: "Tangent slope explorer",
  summary: "Move a point and watch the tangent slope respond.",
  payload: {
    version: sparkSceneV2Version,
    learningObjective: "Connect tangent steepness to derivative value.",
    capabilities: {
      usesCanvas: false,
      usesSvg: true,
      needsNetwork: false,
      recordsAnswers: false,
    },
    files: {
      "index.html":
        "<main><h2>Tangent slope</h2><p>Move the point to compare slopes.</p></main>",
      "styles.css": "main { padding: 24px; }",
    },
    controls: [],
    checkpoints: [],
  },
};

const quizArtifact: SparkArtifact = {
  kind: "spark_quiz",
  version: sparkSceneVersion,
  sparkType: "quiz",
  mode: "readonly",
  artifactId: "slope-quiz",
  title: "Check your slope intuition",
  summary: "One focused question before moving on.",
  payload: {
    instructions: "Choose the statement that best describes a derivative.",
    questions: [
      {
        id: "meaning",
        prompt: "What does a derivative describe at a point?",
        choices: [
          { id: "height", text: "Only the function's height" },
          { id: "slope", text: "Its instantaneous rate of change" },
        ],
        correctChoiceId: "slope",
        explanation: "A derivative is the local rate of change.",
      },
    ],
  },
};

const flashCardArtifact: SparkArtifact = {
  kind: "spark_flash_card",
  version: sparkSceneVersion,
  sparkType: "flash_card",
  mode: "readonly",
  artifactId: "slope-cards",
  title: "Calculus recall cards",
  summary: "Predict each definition before flipping.",
  payload: {
    instructions: "Say the definition aloud, then flip.",
    cards: [
      {
        id: "derivative",
        front: "Derivative",
        back: "The instantaneous rate of change of a function.",
      },
      {
        id: "tangent",
        front: "Tangent line",
        back: "A line whose slope matches the derivative at one point.",
      },
    ],
  },
};

const desmosArtifact: SparkArtifact = {
  kind: "spark_desmos_graph",
  version: sparkSceneVersion,
  sparkType: "desmos_graph",
  mode: "editable",
  artifactId: "parabola-graph",
  title: "Compare a curve and tangent",
  summary: "Zoom near the contact point and compare their slopes.",
  payload: {
    expressions: [
      { id: "curve", latex: "y=x^2" },
      { id: "tangent", latex: "y=2x-1" },
    ],
    settings: { expressionsCollapsed: false },
    viewport: { left: -5, right: 5, bottom: -4, top: 10 },
  },
};

function installFakeDesmos() {
  const calculator = {
    setBlank: fn(),
    setExpressions: fn(),
    updateSettings: fn(),
    setMathBounds: fn(),
    destroy: fn(),
  };

  window.__studiDesmosLoader = undefined;
  window.Desmos = {
    GraphingCalculator: fn(() => calculator),
  };

  return () => {
    window.Desmos = undefined;
    window.__studiDesmosLoader = undefined;
  };
}

const meta = {
  title: "Sparks/SparkSceneRenderer",
  component: SparkSceneRenderer,
  tags: ["autodocs", "ai-generated"],
  parameters: {
    docs: {
      description: {
        component:
          "The inline Spark card used inside a chat message. It selects the scene renderer, applies type-specific chrome, and hands expandable Sparks to the shared side panel model.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: "min(760px, calc(100vw - 2rem))",
          padding: "1rem",
          background: "var(--bg)",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    artifact: sceneArtifact,
    threadId: "thread_story",
    sparkInstanceId: "spark_instance_story",
    onExpandSpark: fn(),
    expandedSparkInstanceId: null,
  },
} satisfies Meta<typeof SparkSceneRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SceneInline: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Tangent slope explorer"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/move a point and watch/i),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Expand spark" }),
    ).toBeInTheDocument();
    await expect(canvas.getByTitle("spark-scene-preview")).toHaveAttribute(
      "sandbox",
      "allow-scripts",
    );
  },
};

export const SceneWithoutSummary: Story = {
  args: {
    artifact: { ...sceneArtifact, summary: undefined },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Tangent slope explorer"),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByText(/move a point and watch/i),
    ).not.toBeInTheDocument();
  },
};

export const QuizInline: Story = {
  args: { artifact: quizArtifact },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.queryByRole("button", { name: "Expand spark" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("radio", { name: "Its instantaneous rate of change" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Check answer" }));
    await expect(canvas.getByText("Correct!")).toBeInTheDocument();
  },
};

export const FlashCardsInline: Story = {
  args: { artifact: flashCardArtifact },
  play: async ({ canvas, userEvent }) => {
    await expect(
      canvas.queryByRole("button", { name: "Expand spark" }),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Flip" }));
    await expect(
      canvas.getByRole("button", { name: "Show front" }),
    ).toBeInTheDocument();
  },
};

export const DesmosInline: Story = {
  args: { artifact: desmosArtifact },
  beforeEach: installFakeDesmos,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Compare a curve and tangent"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Expand spark" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(window.Desmos?.GraphingCalculator).toHaveBeenCalled();
    });
  },
};

export const ViewingExpandedScene: Story = {
  args: {
    expandedSparkInstanceId: "spark_instance_story",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Viewing →")).toBeInTheDocument();
    await expect(
      canvas.queryByTitle("spark-scene-preview"),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Expand spark" }),
    ).not.toBeInTheDocument();
  },
};

export const ViewingExpandedDesmos: Story = {
  args: {
    artifact: desmosArtifact,
    expandedSparkInstanceId: "spark_instance_story",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Viewing →")).toBeInTheDocument();
    await expect(
      canvas.queryByText(/NEXT_PUBLIC_DESMOS_API_KEY/),
    ).not.toBeInTheDocument();
  },
};

export const ExpandInteraction: Story = {
  args: { onExpandSpark: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Expand spark" }));
    await expect(args.onExpandSpark).toHaveBeenCalledWith(
      sceneArtifact,
      "thread_story",
      "spark_instance_story",
    );
  },
};
