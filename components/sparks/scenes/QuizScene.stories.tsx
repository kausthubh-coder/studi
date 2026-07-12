import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import type { QuizSparkPayload } from "@/lib/sparks/contracts";
import QuizScene from "./QuizScene";

const quiz: QuizSparkPayload = {
  instructions: "Choose an answer, then check the reasoning.",
  questions: [
    {
      id: "derivative_meaning",
      prompt: "What does a derivative describe at a point?",
      choices: [
        { id: "height", text: "The function's total height" },
        { id: "slope", text: "Its instantaneous rate of change" },
        { id: "area", text: "The area beneath the curve" },
      ],
      correctChoiceId: "slope",
      explanation:
        "The derivative is the limiting slope of secant lines near that point.",
    },
    {
      id: "constant_derivative",
      prompt: "What is the derivative of a constant?",
      choices: [
        { id: "zero", text: "Zero" },
        { id: "one", text: "One" },
        { id: "constant", text: "The same constant" },
      ],
      correctChoiceId: "zero",
      explanation: "A constant never changes, so its rate of change is zero.",
    },
  ],
};

const meta = {
  title: "Sparks/Scenes/QuizScene",
  component: QuizScene,
  tags: ["autodocs", "ai-generated"],
  parameters: {
    docs: {
      description: {
        component:
          "A self-contained quiz Spark with question navigation, answer feedback, scoring, results, and retry behavior.",
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
    payload: quiz,
  },
} satisfies Meta<typeof QuizScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CorrectAnswer: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("radio", { name: "Its instantaneous rate of change" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Check answer" }));

    await expect(canvas.getByText("Correct!")).toHaveAttribute(
      "data-correct",
      "true",
    );
    await expect(
      canvas.getByText(/limiting slope of secant lines/i),
    ).toBeInTheDocument();
  },
};

export const IncorrectAnswer: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("radio", { name: "The function's total height" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Check answer" }));

    await expect(canvas.getByText("Not quite.")).toHaveAttribute(
      "data-correct",
      "false",
    );
    await expect(
      canvas.getByText(/limiting slope of secant lines/i),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("The function's total height").closest("label"),
    ).toHaveAttribute("data-result", "incorrect");
    await expect(
      canvas.getByText("Its instantaneous rate of change").closest("label"),
    ).toHaveAttribute("data-result", "correct");
  },
};

export const QuestionNavigation: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Go to question 2" }),
    );
    await expect(canvas.getByText("Question 2/2")).toBeVisible();
    await expect(
      canvas.getByText("What is the derivative of a constant?"),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(canvas.getByText("Question 1/2")).toBeVisible();
  },
};

export const PerfectResultsAndRetry: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("radio", { name: "Its instantaneous rate of change" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Check answer" }));
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await userEvent.click(canvas.getByRole("radio", { name: "Zero" }));
    await userEvent.click(canvas.getByRole("button", { name: "Check answer" }));

    await expect(canvas.getByText("Perfect score!")).toBeInTheDocument();
    await expect(canvas.getByText("2 out of 2 correct")).toBeInTheDocument();

    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(canvas.getByText("Question 1/2")).toBeVisible();
    await expect(canvas.queryByText("Perfect score!")).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Check answer" }),
    ).toBeDisabled();
  },
};

export const PartialResults: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("radio", { name: "The function's total height" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Check answer" }));
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await userEvent.click(canvas.getByRole("radio", { name: "Zero" }));
    await userEvent.click(canvas.getByRole("button", { name: "Check answer" }));

    await expect(canvas.getByText("Good effort!")).toBeInTheDocument();
    await expect(canvas.getByText("1 out of 2 correct")).toBeInTheDocument();
  },
};

export const SingleQuestion: Story = {
  args: {
    payload: {
      instructions: "Answer one focused check.",
      questions: [quiz.questions[0]],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Question 1/1")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Back" })).toBeDisabled();
  },
};

export const Empty: Story = {
  args: {
    payload: { questions: [] },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("No quiz questions available."),
    ).toBeVisible();
    await expect(canvas.getByText("Question 1/1")).toBeVisible();
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
