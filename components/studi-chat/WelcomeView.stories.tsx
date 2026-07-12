import { useRef, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import type { Id } from "@/convex/_generated/dataModel";
import { WelcomeView as WelcomeViewComponent } from "./WelcomeView";

type StoryProps = Omit<
  ComponentProps<typeof WelcomeViewComponent>,
  "textareaRef"
>;

function WelcomeView(props: StoryProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  return <WelcomeViewComponent {...props} textareaRef={textareaRef} />;
}

const meta = {
  component: WelcomeView,
  tags: ["autodocs", "ai-generated"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <main className="flex min-h-screen bg-bg">
        <Story />
      </main>
    ),
  ],
  args: {
    pendingAttachments: [],
    input: "",
    canSend: false,
    isComposerBusy: false,
    onInputChange: fn(),
    onSubmit: fn((event) => event.preventDefault()),
    onPaste: fn(async () => undefined),
    onUpload: fn(async () => undefined),
    onRemoveAttachment: fn(),
    onSuggestionClick: fn(),
  },
} satisfies Meta<typeof WelcomeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NamedLearner: Story = {
  parameters: {
    studi: {
      auth: {
        user: {
          id: "user_story_ada",
          firstName: "Ada",
          lastName: "Lovelace",
          fullName: "Ada Lovelace",
          primaryEmailAddress: { emailAddress: "ada@learner.test" },
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ada")).toBeInTheDocument();
    await expect(
      canvas.getByText("What would you like to learn today?"),
    ).toBeInTheDocument();
  },
};

export const FallbackGreeting: Story = {
  parameters: {
    studi: {
      auth: {
        user: {
          id: "user_story_no_name",
          firstName: null,
          lastName: null,
          fullName: null,
          primaryEmailAddress: { emailAddress: "learner@studi.test" },
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("there")).toBeInTheDocument();
  },
};

export const SuggestionSelection: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /practice/i }));
    await expect(args.onSuggestionClick).toHaveBeenCalledWith(
      "Quiz me on calculus basics and explain what I miss",
    );
  },
};

export const DraftReadyToSend: Story = {
  args: {
    input: "Help me discover why completing the square works.",
    canSend: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Send message" }),
    ).toBeEnabled();
  },
};

export const AttachmentReady: Story = {
  args: {
    pendingAttachments: [
      {
        attachmentId: "attachment_story_notes" as Id<"attachments">,
        filename: "quadratics-notes.pdf",
        mimeType: "application/pdf",
        size: 84_200,
      },
    ],
    canSend: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("quadratics-notes.pdf")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Send message" }),
    ).toBeEnabled();
  },
};

export const Busy: Story = {
  args: {
    input: "Working through a graph…",
    isComposerBusy: true,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole("button", { name: "Send message" }),
    ).toBeDisabled();
  },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
  args: {
    input: "Give me a question about limits.",
    canSend: true,
  },
};
