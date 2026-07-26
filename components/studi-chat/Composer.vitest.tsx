import { createRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "@/components/studi-chat/Composer";
import type { PendingAttachment } from "@/components/studi-chat/types";

function renderComposer(
  overrides: Partial<React.ComponentProps<typeof Composer>> = {},
) {
  const props: React.ComponentProps<typeof Composer> = {
    pendingAttachments: [],
    input: "",
    canSend: false,
    isComposerBusy: false,
    textareaRef: createRef<HTMLTextAreaElement>(),
    onInputChange: vi.fn(),
    onSubmit: vi.fn((event) => event.preventDefault()),
    onPaste: vi.fn(),
    onUpload: vi.fn(),
    onRemoveAttachment: vi.fn(),
    ...overrides,
  };

  const result = render(<Composer {...props} />);
  return { ...result, props };
}

describe("Composer", () => {
  it("shows the idle send control without an activity status", () => {
    renderComposer();

    expect(screen.getByLabelText("Send message")).toBeDisabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask a follow-up...")).toBeInTheDocument();
  });

  it("morphs to Stop and announces active generation", () => {
    renderComposer({ agentPhase: "spark" });

    expect(screen.queryByLabelText("Send message")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Stop response")).toBeEnabled();
    expect(screen.getByTestId("composer-stop-icon")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Studi is building your interactive Spark",
    );
  });

  it("stops active generation without submitting the form", () => {
    const onSubmit = vi.fn((event) => event.preventDefault());
    const onStopGeneration = vi.fn();
    renderComposer({
      agentPhase: "reasoning",
      canSend: true,
      onSubmit,
      onStopGeneration,
    });

    fireEvent.click(screen.getByLabelText("Stop response"));

    expect(onStopGeneration).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps local composer work as a non-cancellable spinner", () => {
    const onStopGeneration = vi.fn();
    renderComposer({
      agentPhase: "idle",
      isComposerBusy: true,
      onStopGeneration,
    });

    const sendButton = screen.getByLabelText("Send message");
    expect(sendButton).toBeDisabled();
    expect(sendButton.querySelector(".status-loader-ring")).toBeInTheDocument();
    expect(screen.queryByTestId("composer-stop-icon")).not.toBeInTheDocument();
    fireEvent.click(sendButton);
    expect(onStopGeneration).not.toHaveBeenCalled();
  });

  it("prevents duplicate stop requests while stopping", () => {
    const onStopGeneration = vi.fn();
    renderComposer({
      agentPhase: "tool",
      isStoppingGeneration: true,
      onStopGeneration,
    });

    const stopButton = screen.getByLabelText("Stopping response");
    expect(stopButton).toBeDisabled();
    expect(stopButton.querySelector(".status-loader-ring")).toBeInTheDocument();
    fireEvent.click(stopButton);
    expect(onStopGeneration).not.toHaveBeenCalled();
  });

  it("renders stop failures inline as an alert", () => {
    renderComposer({
      agentPhase: "reasoning",
      stopGenerationError: "Could not stop the response.",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not stop the response.",
    );
  });

  it("renders attachment previews and removes selected attachments", () => {
    const attachment = {
      attachmentId: "attachment_1",
      filename: "diagram.png",
      mimeType: "image/png",
      size: 128,
      previewUrl: "blob:http://localhost/diagram",
    } as PendingAttachment;
    const onRemoveAttachment = vi.fn();

    renderComposer({
      pendingAttachments: [attachment],
      onRemoveAttachment,
    });

    expect(screen.getByText("diagram.png")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove diagram.png" }));

    expect(onRemoveAttachment).toHaveBeenCalledWith("attachment_1");
  });

  it("wires file input changes to the upload callback", async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    const { container } = renderComposer({ onUpload });

    fireEvent.click(screen.getByLabelText("More options"));
    fireEvent.click(screen.getByRole("button", { name: /upload file/i }));

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();

    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => {
      expect(onUpload).toHaveBeenCalledTimes(1);
    });
    expect(onUpload.mock.calls[0]?.[0][0]).toBe(file);
  });
});
