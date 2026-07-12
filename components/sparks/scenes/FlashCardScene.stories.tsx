import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import type { FlashCardSparkPayload } from "@/lib/sparks/contracts";
import FlashCardScene from "./FlashCardScene";

const deck: FlashCardSparkPayload = {
  instructions: "Predict the back before you flip each card.",
  cards: [
    {
      id: "derivative",
      front: "Derivative",
      back: "The instantaneous rate of change of a function.",
    },
    {
      id: "tangent",
      front: "Tangent line",
      back: "A line whose slope matches the derivative at the point of contact.",
    },
    {
      id: "critical_point",
      front: "Critical point",
      back: "A point where the derivative is zero or undefined.",
    },
  ],
};

const meta = {
  title: "Sparks/Scenes/FlashCardScene",
  component: FlashCardScene,
  tags: ["autodocs", "ai-generated"],
  parameters: {
    docs: {
      description: {
        component:
          "A flash-card Spark with front/back recall, card navigation, shuffling, and an honest empty fallback.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(740px, calc(100vw - 2rem))", padding: "1rem" }}>
        <Story />
      </div>
    ),
  ],
  args: {
    payload: deck,
  },
} satisfies Meta<typeof FlashCardScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Front: Story = {};

export const Flipped: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Flip" }));

    await expect(
      canvas.getByText("The instantaneous rate of change of a function."),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Show front" }),
    ).toBeVisible();
    await expect(
      canvas.queryByText("tap to flip", { exact: true }),
    ).not.toBeInTheDocument();
  },
};

export const NextAndPrevious: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(canvas.getByText("Card 2 / 3")).toBeVisible();
    await expect(canvas.getByText("Tangent line")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Previous" }));
    await expect(canvas.getByText("Card 1 / 3")).toBeVisible();
    await expect(canvas.getByText("Derivative")).toBeInTheDocument();
  },
};

export const DotNavigation: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Go to card 3" }));
    await expect(canvas.getByText("Card 3 / 3")).toBeVisible();
    await expect(canvas.getByText("Critical point")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Next" })).toBeDisabled();
  },
};

export const ShuffleResetsTheDeck: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Go to card 3" }));
    await userEvent.click(canvas.getByRole("button", { name: "Flip" }));
    await userEvent.click(canvas.getByRole("button", { name: "Shuffle" }));

    await expect(canvas.getByText("Card 1 / 3")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Flip" })).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Previous" }),
    ).toBeDisabled();
  },
};

export const SingleCard: Story = {
  args: {
    payload: {
      instructions: "Recall one essential definition.",
      cards: [deck.cards[0]],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Card 1 / 1")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Previous" }),
    ).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Next" })).toBeDisabled();
    await expect(
      canvas.queryByRole("button", { name: "Go to card 1" }),
    ).not.toBeInTheDocument();
  },
};

export const Empty: Story = {
  args: {
    payload: { cards: [] },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No flash cards available.")).toBeVisible();
    await expect(
      canvas.getAllByText("No cards", { selector: "p" }),
    ).toHaveLength(2);
  },
};

export const Mobile: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
};
