import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { OrbitalActivity } from "./OrbitalActivity";

const reasoningStep = {
  id: "reasoning-story",
  kind: "reasoning" as const,
  label: "Thinking it through",
  status: "active" as const,
};

const sparkStep = {
  id: "spark-story",
  kind: "spark" as const,
  label: "Building an interactive Spark",
  status: "active" as const,
};

const meta = {
  title: "Studi Chat/Orbital Activity",
  component: OrbitalActivity,
  tags: ["ai-generated", "autodocs"],
  parameters: {
    layout: "fullscreen",
  },
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
    messageKey: "orbital-story",
    phase: "idle",
    steps: [],
    isStreaming: false,
    finalText: "",
  },
} satisfies Meta<typeof OrbitalActivity>;

export default meta;
type Story = StoryObj<typeof meta>;

export const IdleNoActivity: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.queryByTestId("orbital-scene")).not.toBeInTheDocument();
  },
};

export const ActiveReasoning: Story = {
  args: {
    phase: "reasoning",
    steps: [reasoningStep],
    isStreaming: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Thinking it through" }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByTestId("orbital-scene")).toBeVisible();
  },
};

export const ActiveSpark: Story = {
  args: {
    phase: "spark",
    steps: [sparkStep],
    isStreaming: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", {
        name: "Building an interactive Spark",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(canvas.getByTestId("orbital-scene")).toBeVisible();
  },
};

export const CollapsedAfterStreaming: Story = {
  args: {
    phase: "idle",
    steps: [{ ...reasoningStep, status: "complete" }],
    finalText: "Now compare the two nearby slopes.",
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Studi's steps" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByTestId("orbital-scene")).not.toBeInTheDocument();
  },
};

export const CollapsedSparkError: Story = {
  args: {
    phase: "idle",
    steps: [
      {
        id: "spark-error-story",
        kind: "spark",
        label: "Spark failed to build",
        status: "error",
      },
    ],
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Spark failed to build" }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByTestId("orbital-scene")).not.toBeInTheDocument();
  },
};
