import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor } from "storybook/test";

import type { ExpandedSpark } from "@/components/studi-chat/types";
import {
  sparkSceneV2Version,
  sparkSceneVersion,
  type SparkArtifact,
} from "@/lib/sparks/contracts";
import { SparkPanel } from "./SparkPanel";

const sceneArtifact: SparkArtifact = {
  kind: "spark_scene",
  version: sparkSceneV2Version,
  sparkType: "scene",
  mode: "editable",
  artifactId: "vector-scene",
  title: "Vector addition workbench",
  summary: "Drag two vectors and inspect their resultant.",
  payload: {
    version: sparkSceneV2Version,
    learningObjective: "Build geometric intuition for vector addition.",
    capabilities: {
      usesCanvas: false,
      usesSvg: true,
      needsNetwork: false,
      recordsAnswers: false,
    },
    files: {
      "index.html":
        "<main><h2>Vector addition</h2><p>Drag the arrows, then predict the resultant.</p></main>",
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
  artifactId: "vectors-quiz",
  title: "Vector intuition check",
  payload: {
    instructions: "Use the head-to-tail rule.",
    questions: [
      {
        id: "direction",
        prompt: "Where does the resultant vector end?",
        choices: [
          { id: "tail", text: "At the first vector's tail" },
          { id: "head", text: "At the second vector's head" },
        ],
        correctChoiceId: "head",
        explanation:
          "Head-to-tail addition joins the first tail to the final head.",
      },
    ],
  },
};

const flashArtifact: SparkArtifact = {
  kind: "spark_flash_card",
  version: sparkSceneVersion,
  sparkType: "flash_card",
  mode: "readonly",
  artifactId: "vectors-cards",
  title: "Vector vocabulary",
  payload: {
    instructions: "Predict each definition before flipping.",
    cards: [
      {
        id: "magnitude",
        front: "Magnitude",
        back: "The length or size of a vector.",
      },
      {
        id: "resultant",
        front: "Resultant",
        back: "The single vector equivalent to a vector sum.",
      },
    ],
  },
};

const desmosArtifact: SparkArtifact = {
  kind: "spark_desmos_graph",
  version: sparkSceneVersion,
  sparkType: "desmos_graph",
  mode: "editable",
  artifactId: "intersection-graph",
  title: "Find the intersections",
  summary: "Compare a line and parabola near their crossing points.",
  payload: {
    expressions: [
      { id: "parabola", latex: "y=x^2-2" },
      { id: "line", latex: "y=x" },
    ],
    viewport: { left: -5, right: 5, bottom: -5, top: 8 },
  },
};

function expandedSpark(artifact: SparkArtifact): ExpandedSpark {
  return {
    artifact,
    threadId: "thread_story",
    sparkInstanceId: artifact.artifactId ?? "spark_story",
  };
}

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
  title: "Sparks/SparkPanel",
  component: SparkPanel,
  tags: ["autodocs", "ai-generated"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The expanded Spark surface used beside chat. It preserves the artifact title and type while giving the selected interactive scene the full panel body.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: "100%",
          height: "min(780px, 100vh)",
          background: "var(--bg)",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    spark: expandedSpark(sceneArtifact),
    onClose: fn(),
  },
} satisfies Meta<typeof SparkPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scene: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Vector addition workbench"),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Scene")).toBeInTheDocument();
    const frame = canvas.getByTitle("spark-scene-preview") as HTMLIFrameElement;
    await expect(frame.style.height).toBe("100%");
  },
};

export const Quiz: Story = {
  args: { spark: expandedSpark(quizArtifact) },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Quiz")).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("radio", { name: "At the second vector's head" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Check answer" }));
    await expect(canvas.getByText("Correct!")).toBeInTheDocument();
  },
};

export const FlashCards: Story = {
  args: { spark: expandedSpark(flashArtifact) },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText("Flash Card")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Flip" }));
    await expect(
      canvas.getByRole("button", { name: "Show front" }),
    ).toBeInTheDocument();
  },
};

export const DesmosGraph: Story = {
  args: { spark: expandedSpark(desmosArtifact) },
  beforeEach: installFakeDesmos,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Desmos Graph")).toBeInTheDocument();
    await expect(
      canvas.getByText("Find the intersections"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(window.Desmos?.GraphingCalculator).toHaveBeenCalled();
    });
  },
};

export const LongTitle: Story = {
  args: {
    spark: expandedSpark({
      ...sceneArtifact,
      title:
        "Explore how changing vector magnitude and direction changes the resultant",
    }),
  },
};

export const CloseInteraction: Story = {
  args: { onClose: fn() },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Close spark panel" }),
    );
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};

export const Mobile: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 390, height: 720, background: "var(--bg)" }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Close spark panel" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("Vector addition workbench"),
    ).toBeInTheDocument();
  },
};
