import { useRef } from "react";
import type { ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import type { Id } from "@/convex/_generated/dataModel";
import { Composer as ComposerComponent } from "./Composer";

const IMAGE_PREVIEW =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Crect width='48' height='48' rx='10' fill='%23dceee9'/%3E%3Cpath d='M8 34l10-10 7 7 5-5 10 10H8z' fill='%233a9e8a'/%3E%3Ccircle cx='31' cy='16' r='5' fill='%23e8a030'/%3E%3C/svg%3E";

type ComposerStoryProps = Omit<
  ComponentProps<typeof ComposerComponent>,
  "textareaRef"
>;

function Composer(props: ComposerStoryProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return <ComposerComponent {...props} textareaRef={textareaRef} />;
}

const meta = {
  title: "Studi Chat/Composer",
  component: Composer,
  tags: ["ai-generated", "autodocs"],
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: "100vh",
          padding: "4rem 1.5rem",
          background: "var(--bg)",
        }}
      >
        <div
          style={{
            position: "relative",
            minHeight: 360,
            maxWidth: "var(--column-max)",
            margin: "0 auto",
          }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    pendingAttachments: [],
    input: "",
    canSend: false,
    isComposerBusy: false,
    onInputChange: fn<ComposerStoryProps["onInputChange"]>(),
    onSubmit: fn<ComposerStoryProps["onSubmit"]>((event) =>
      event.preventDefault(),
    ),
    onPaste: fn<ComposerStoryProps["onPaste"]>(async () => undefined),
    onUpload: fn<ComposerStoryProps["onUpload"]>(async () => undefined),
    onRemoveAttachment: fn<ComposerStoryProps["onRemoveAttachment"]>(),
    variant: "welcome",
  },
} satisfies Meta<typeof Composer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WelcomeEmpty: Story = {
  play: async ({ canvas, userEvent }) => {
    const textarea = canvas.getByPlaceholderText(
      "What would you like to learn?",
    );
    const form = textarea.closest("form");
    const sendButton = canvas.getByRole("button", { name: "Send message" });
    const optionsButton = canvas.getByRole("button", { name: "More options" });

    await expect(sendButton).toBeDisabled();
    await expect(form).not.toBeNull();
    await expect(getComputedStyle(form!).borderTopWidth).toBe("4px");
    await expect(optionsButton).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(optionsButton);

    await expect(optionsButton).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas.getByRole("button", { name: "Upload file" }),
    ).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    await expect(optionsButton).toHaveAttribute("aria-expanded", "false");
    await expect(
      canvas.queryByRole("button", { name: "Upload file" }),
    ).not.toBeInTheDocument();
  },
};

export const ReadyToSend: Story = {
  args: {
    input: "Help me discover why the derivative is a local slope.",
    canSend: true,
  },
  play: async ({ args, canvas, userEvent }) => {
    const textarea = canvas.getByPlaceholderText(
      "What would you like to learn?",
    );

    await userEvent.click(textarea);
    await userEvent.keyboard("!");
    await expect(args.onInputChange).toHaveBeenCalledWith(
      "Help me discover why the derivative is a local slope.!",
    );

    await userEvent.paste("A note from class");
    await expect(args.onPaste).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await expect(args.onSubmit).not.toHaveBeenCalled();

    await userEvent.keyboard("{Enter}");
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
  },
};

export const ChatFollowUp: Story = {
  args: {
    input: "Can you give me one smaller hint?",
    canSend: true,
    variant: "chat",
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByPlaceholderText("Ask a follow-up..."),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        "Studi may make mistakes — verify important information",
      ),
    ).toBeVisible();

    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));
    await expect(args.onSubmit).toHaveBeenCalledTimes(1);
  },
};

export const ActiveResponse: Story = {
  args: {
    input: "Give me a hint about the chain rule.",
    agentPhase: "reasoning",
    onStopGeneration: fn(),
    variant: "chat",
  },
  play: async ({ args, canvas, userEvent }) => {
    const stopButton = canvas.getByRole("button", { name: "Stop response" });

    await expect(canvas.getByRole("status")).toBeInTheDocument();
    await expect(
      canvas.getByText("Studi is working on your next step."),
    ).toBeVisible();
    await userEvent.click(stopButton);
    await expect(args.onStopGeneration).toHaveBeenCalledTimes(1);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

export const AttachmentOnlyReady: Story = {
  args: {
    canSend: true,
    pendingAttachments: [
      {
        attachmentId: "attachment_image" as Id<"attachments">,
        filename: "tangent-diagram.png",
        mimeType: "image/png",
        size: 42_000,
        previewUrl: IMAGE_PREVIEW,
      },
      {
        attachmentId: "attachment_notes" as Id<"attachments">,
        filename: "derivatives-notes.pdf",
        mimeType: "application/pdf",
        size: 128_000,
      },
    ],
  },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByRole("img", { name: "tangent-diagram.png" }),
    ).toBeVisible();
    await expect(canvas.getByText("derivatives-notes.pdf")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Send message" }),
    ).toBeEnabled();

    await userEvent.click(
      canvas.getByRole("button", { name: "Remove tangent-diagram.png" }),
    );
    await expect(args.onRemoveAttachment).toHaveBeenCalledWith(
      "attachment_image",
    );
  },
};

export const UploadFromOptions: Story = {
  play: async ({ args, canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "More options" }));
    await userEvent.click(canvas.getByRole("button", { name: "Upload file" }));

    const fileInput =
      canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
    await expect(fileInput).not.toBeNull();

    const worksheet = new File(["slope,rate\n1,2"], "slope-data.csv", {
      type: "text/csv",
    });
    await userEvent.upload(fileInput!, worksheet);

    await expect(args.onUpload).toHaveBeenCalledTimes(1);
    const [files] = args.onUpload.mock.calls[0] ?? [];
    await expect(files).toHaveLength(1);
    await expect(files?.item(0)?.name).toBe("slope-data.csv");
  },
};
