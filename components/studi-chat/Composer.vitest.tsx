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
  it("disables send until the caller allows submission", () => {
    renderComposer();

    expect(screen.getByLabelText("Send message")).toBeDisabled();
    expect(screen.getByPlaceholderText("Ask a follow-up...")).toBeInTheDocument();
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
