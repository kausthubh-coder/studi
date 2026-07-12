import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { FlickeringGrid } from "./FlickeringGrid";

const meta = {
  title: "Studi Chat/FlickeringGrid",
  component: FlickeringGrid,
  tags: ["ai-generated", "autodocs"],
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          padding: "2rem",
          borderRadius: "2rem",
          background: "linear-gradient(135deg, var(--bg-alt), var(--bg-card))",
          boxShadow: "0 18px 50px rgba(28, 18, 8, 0.08)",
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FlickeringGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ResponsiveWarmGrid: Story = {
  args: {
    className: "h-64 w-[min(680px,80vw)] overflow-hidden rounded-3xl",
  },
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector("canvas");
    await expect(canvas).not.toBeNull();
    await expect(canvas!.style.width).not.toBe("");
    await expect(canvas!.style.height).not.toBe("");
  },
};

export const FixedDimensions: Story = {
  args: {
    width: 520,
    height: 260,
    className: "overflow-hidden rounded-3xl",
  },
  play: async ({ canvasElement }) => {
    const canvas = canvasElement.querySelector("canvas");
    await expect(canvas).not.toBeNull();
    await expect(canvas).toHaveStyle({ width: "520px", height: "260px" });
    await expect(canvas!.width).toBeGreaterThanOrEqual(520);
    await expect(canvas!.height).toBeGreaterThanOrEqual(260);
  },
};

export const DenseTealGrid: Story = {
  args: {
    width: 520,
    height: 260,
    squareSize: 3,
    gridGap: 4,
    flickerChance: 0.5,
    maxOpacity: 0.5,
    color: "rgb(58, 158, 138)",
    className: "overflow-hidden rounded-3xl",
  },
};
