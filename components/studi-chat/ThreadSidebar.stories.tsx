import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import type { ThreadSummary } from "./types";
import { ThreadSidebar } from "./ThreadSidebar";

const THREADS: ThreadSummary[] = [
  {
    threadId: "thread_derivatives",
    title: "Discovering derivatives",
    lastMessageAt: Date.UTC(2026, 6, 11, 16),
  },
  {
    threadId: "thread_recursion",
    title: "Recursion and base cases",
    lastMessageAt: Date.UTC(2026, 6, 10, 16),
  },
  {
    threadId: "thread_new",
    title: "New Thread",
  },
];

const meta = {
  title: "Studi Chat/ThreadSidebar",
  component: ThreadSidebar,
  tags: ["ai-generated", "autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          background: "var(--bg)",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    threads: THREADS,
    selectedThreadId: "thread_derivatives",
    onSelectThread: fn(),
    onCreateThread: fn(),
    onDeleteThread: fn(),
    deletingThreadId: null,
    isMobileOpen: false,
    onCloseMobile: fn(),
  },
} satisfies Meta<typeof ThreadSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    threads: [],
    selectedThreadId: null,
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByText("No threads yet")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "New thread" }));
    await expect(args.onCreateThread).toHaveBeenCalledTimes(1);
  },
};

export const ConversationHistory: Story = {
  play: async ({ args, canvas, userEvent }) => {
    const selected = canvas.getByRole("button", {
      name: "Discovering derivatives Jul 11",
    });
    await expect(selected).toHaveAttribute("data-active", "true");
    await expect(canvas.getAllByText("New thread")).toHaveLength(2);

    await userEvent.click(
      canvas.getByRole("button", { name: "Recursion and base cases Jul 10" }),
    );
    await expect(args.onSelectThread).toHaveBeenCalledWith("thread_recursion");

    await userEvent.click(
      canvas.getByRole("button", { name: "Delete Recursion and base cases" }),
    );
    await expect(canvas.getByRole("alertdialog")).toHaveTextContent(
      "Recursion and base cases",
    );
    await expect(args.onDeleteThread).not.toHaveBeenCalled();
    await userEvent.click(
      canvas.getByRole("button", { name: "Delete thread" }),
    );
    await expect(args.onDeleteThread).toHaveBeenCalledWith(THREADS[1]);
  },
};

export const DeletingThread: Story = {
  args: {
    deletingThreadId: "thread_recursion",
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Recursion and base cases Jul 10" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Delete Recursion and base cases" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Discovering derivatives Jul 11" }),
    ).toBeEnabled();
  },
};

export const MobileOpen: Story = {
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  args: {
    isMobileOpen: true,
  },
  play: async ({ args, canvas, userEvent }) => {
    const sidebar = canvas.getByRole("complementary");
    await expect(sidebar).toHaveAttribute("data-mobile-open", "true");

    await userEvent.click(
      canvas.getByRole("button", { name: "Close sidebar" }),
    );
    await expect(args.onCloseMobile).toHaveBeenCalledTimes(1);
  },
};
