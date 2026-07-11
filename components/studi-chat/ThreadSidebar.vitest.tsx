import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadSidebar } from "@/components/studi-chat/ThreadSidebar";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

const thread = {
  threadId: "thread_1",
  title: "Mean and median with a very specific outlier example",
  lastMessageAt: Date.UTC(2026, 6, 11),
};

describe("ThreadSidebar destructive actions", () => {
  it("requires confirmation before deleting and preserves the full title", () => {
    const onDeleteThread = vi.fn();

    render(
      <ThreadSidebar
        threads={[thread]}
        selectedThreadId="thread_1"
        onSelectThread={vi.fn()}
        onCreateThread={vi.fn()}
        onDeleteThread={onDeleteThread}
        deletingThreadId={null}
      />,
    );

    const threadButton = screen.getByText(thread.title).closest("button");
    expect(threadButton).not.toBeNull();
    expect(threadButton).toHaveAttribute("title", thread.title);

    fireEvent.click(
      screen.getByRole("button", { name: `Delete ${thread.title}` }),
    );
    expect(onDeleteThread).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent(thread.title);
    fireEvent.click(screen.getByRole("button", { name: "Delete thread" }));

    expect(onDeleteThread).toHaveBeenCalledWith(thread);
  });

  it("traps focus, makes the background inert, and restores the trigger", async () => {
    render(
      <ThreadSidebar
        threads={[thread]}
        selectedThreadId="thread_1"
        onSelectThread={vi.fn()}
        onCreateThread={vi.fn()}
        onDeleteThread={vi.fn()}
        deletingThreadId={null}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: `Delete ${thread.title}`,
    });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("alertdialog");
    const keep = screen.getByRole("button", { name: "Keep thread" });
    const confirm = screen.getByRole("button", { name: "Delete thread" });
    expect(confirm).toHaveFocus();
    expect(dialog.closest("body")?.querySelector("aside")).toHaveAttribute(
      "inert",
    );

    fireEvent.keyDown(document, { key: "Tab" });
    expect(keep).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
