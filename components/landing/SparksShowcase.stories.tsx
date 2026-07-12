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
    const active = canvas.getByRole("tab", { name: /Interactive Scene/i });
    await expect(active).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByText("Collision Physics")).toBeInTheDocument();
  },
};

export const ManualSparkSelection: Story = {
  play: async ({ canvas, userEvent }) => {
    const graph = canvas.getByRole("tab", { name: /Live Graph/i });
    await userEvent.click(graph);
    await expect(graph).toHaveAttribute("aria-selected", "true");
    await waitFor(() =>
      expect(canvas.getByText("y = sin(x) + cos(2x)")).toBeInTheDocument(),
    );

    const quiz = canvas.getByRole("tab", { name: /Adaptive Quiz/i });
    await userEvent.click(quiz);
    await expect(quiz).toHaveAttribute("aria-selected", "true");
    await waitFor(() =>
      expect(
        canvas.getByText("What is the average time complexity of QuickSort?"),
      ).toBeInTheDocument(),
    );

    const flashcards = canvas.getByRole("tab", { name: /Flashcards/i });
    await userEvent.click(flashcards);
    await expect(flashcards).toHaveAttribute("aria-selected", "true");
    await waitFor(() =>
      expect(canvas.getByText("Mitochondria")).toBeInTheDocument(),
    );
  },
};

export const MobileNavigation: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: async ({ canvas, userEvent }) => {
    const graph = canvas.getByRole("tab", { name: /Live Graph/i });
    await userEvent.click(graph);
    await expect(graph).toHaveAttribute("aria-selected", "true");
  },
};
