import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import { SparksShowcase } from "./SparksShowcase";

const meta = {
  component: SparksShowcase,
  tags: ["autodocs", "ai-generated"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <main
        style={{
          minHeight: "100vh",
          padding: "3rem 1rem",
          background: "#fdf8f2",
        }}
      >
        <Story />
      </main>
    ),
  ],
} satisfies Meta<typeof SparksShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveScene: Story = {
  play: async ({ canvas }) => {
    const active = canvas.getByRole("button", { name: /Interactive Scene/i });
    await expect(active).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByText("Collision Physics")).toBeInTheDocument();
  },
};

export const ManualSparkSelection: Story = {
  play: async ({ canvas, userEvent }) => {
    const graph = canvas.getByRole("button", { name: /Desmos Graph/i });
    await userEvent.click(graph);
    await expect(graph).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(canvas.getByText("y = sin(x) + cos(2x)")).toBeInTheDocument(),
    );

    const quiz = canvas.getByRole("button", { name: /Adaptive Quiz/i });
    await userEvent.click(quiz);
    await expect(quiz).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(
        canvas.getByText("What is the time complexity of QuickSort?"),
      ).toBeInTheDocument(),
    );

    const flashcards = canvas.getByRole("button", { name: /Flashcards/i });
    await userEvent.click(flashcards);
    await expect(flashcards).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(canvas.getByText("Mitochondria")).toBeInTheDocument(),
    );
  },
};

export const MobileNavigation: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: async ({ canvas, userEvent }) => {
    const graph = canvas.getByRole("button", { name: /Desmos Graph/i });
    await userEvent.click(graph);
    await expect(graph).toHaveAttribute("aria-pressed", "true");
  },
};
