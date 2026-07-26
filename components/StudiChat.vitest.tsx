import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudiChat from "@/components/StudiChat";

const mocks = vi.hoisted(() => ({
  sendFirstMessage: vi.fn(),
  sendFollowupMessage: vi.fn(),
  rawSendMessageMutation: vi.fn(),
  deleteThread: vi.fn(),
  cancelGeneration: vi.fn(),
  backfillThreadActivity: vi.fn(),
  generateUploadUrl: vi.fn(),
  saveAttachment: vi.fn(),
  syncBillingProfile: vi.fn(),
  uiMessages: [] as Array<Record<string, unknown>>,
  threads: [] as Array<Record<string, unknown>>,
  chatAdmission: {
    canSend: true,
    reason: null,
    activeThread: null,
  } as Record<string, unknown> | undefined,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({ user: { firstName: "Ada" } }),
}));

vi.mock("@convex-dev/agent/react", () => ({
  useUIMessages: () => ({
    results: mocks.uiMessages,
    status: "Exhausted",
    loadMore: vi.fn(),
  }),
}));

vi.mock("convex/react", () => ({
  useAction: (reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "chatActions:sendFirstMessage") {
      return mocks.sendFirstMessage;
    }
    if (name === "chatActions:sendMessage") {
      return mocks.sendFollowupMessage;
    }
    if (name === "chatActions:deleteThread") {
      return mocks.deleteThread;
    }
    if (name === "billingActions:syncCurrentUserBillingProfile") {
      return mocks.syncBillingProfile;
    }
    throw new Error(`Unexpected action reference: ${name}`);
  },
  useMutation: (reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "chat:sendMessage") {
      return mocks.rawSendMessageMutation;
    }
    if (name === "chat:backfillThreadActivityForCurrentUser") {
      return mocks.backfillThreadActivity;
    }
    if (name === "chat:cancelGeneration") {
      return mocks.cancelGeneration;
    }
    if (name === "chat:generateUploadUrl") {
      return mocks.generateUploadUrl;
    }
    if (name === "chat:saveAttachment") {
      return mocks.saveAttachment;
    }
    throw new Error(`Unexpected mutation reference: ${name}`);
  },
  useQuery: (reference: unknown) => {
    const name = getFunctionName(reference as never);
    if (name === "chat:listThreads") {
      return mocks.threads;
    }
    if (name === "chat:getChatAdmissionState") {
      return mocks.chatAdmission;
    }
    if (name === "billing:getViewerBillingState") {
      return {
        lockedSurfaces: {
          chat: false,
          attachments: false,
        },
      };
    }
    throw new Error(`Unexpected query reference: ${name}`);
  },
}));

describe("StudiChat follow-up sending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendFirstMessage.mockResolvedValue({ threadId: "thread_1" });
    mocks.sendFollowupMessage.mockResolvedValue(null);
    mocks.rawSendMessageMutation.mockResolvedValue({
      promptMessageId: "message_raw",
      deduped: false,
    });
    mocks.deleteThread.mockResolvedValue({ deleted: true });
    mocks.cancelGeneration.mockResolvedValue({ stopped: true });
    mocks.backfillThreadActivity.mockResolvedValue({ scanned: 0, patched: 0 });
    mocks.generateUploadUrl.mockResolvedValue("http://localhost/upload");
    mocks.saveAttachment.mockResolvedValue({
      attachmentId: "attachment_1",
      filename: "diagram.png",
      mimeType: "image/png",
      size: 1,
    });
    mocks.syncBillingProfile.mockResolvedValue({
      planKey: "free_onboarding",
      status: "onboarding",
    });
    mocks.uiMessages = [];
    mocks.threads = [];
    mocks.chatAdmission = {
      canSend: true,
      reason: null,
      activeThread: null,
    };

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  it("sends follow-up messages through the chat action, not the raw mutation", async () => {
    render(<StudiChat />);

    fireEvent.change(
      screen.getByPlaceholderText("What would you like to learn?"),
      {
        target: { value: "Explain slope" },
      },
    );
    fireEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(mocks.sendFirstMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Explain slope",
          attachmentIds: [],
        }),
      );
    });

    const followupComposer =
      await screen.findByPlaceholderText("Ask a follow-up...");
    fireEvent.change(followupComposer, {
      target: { value: "Can you give another example?" },
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Send message")).not.toBeDisabled();
    });
    fireEvent.click(screen.getByLabelText("Send message"));

    await waitFor(() => {
      expect(mocks.sendFollowupMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "thread_1",
          prompt: "Can you give another example?",
          attachmentIds: [],
        }),
      );
    });
    expect(mocks.rawSendMessageMutation).not.toHaveBeenCalled();
  });

  it("explains a cross-thread Starter block and returns to the active lesson", async () => {
    mocks.threads = [
      {
        threadId: "thread_active",
        title: "Understanding derivatives",
        lastMessageAt: 2,
      },
    ];
    mocks.chatAdmission = {
      canSend: false,
      reason: "another_thread_active",
      activeThread: {
        threadId: "thread_active",
        title: "Understanding derivatives",
      },
    };

    render(<StudiChat />);
    fireEvent.change(
      screen.getByPlaceholderText("What would you like to learn?"),
      { target: { value: "Teach me vectors" } },
    );

    expect(screen.getByLabelText("Send message")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      /finish your active lesson before starting another one/i,
    );
    expect(screen.getByRole("link", { name: /view pro/i })).toHaveAttribute(
      "href",
      "/pricing?entry_point=chat_concurrency&plan=pro",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /return to understanding derivatives/i }),
    );
    expect(
      await screen.findByPlaceholderText("Ask a follow-up..."),
    ).toBeInTheDocument();
  });

  it("keeps the welcome composer available for Pro cross-thread work", () => {
    mocks.chatAdmission = {
      canSend: true,
      reason: null,
      activeThread: {
        threadId: "thread_active",
        title: "Understanding derivatives",
      },
    };

    render(<StudiChat />);
    fireEvent.change(
      screen.getByPlaceholderText("What would you like to learn?"),
      { target: { value: "Teach me vectors" } },
    );

    expect(screen.getByLabelText("Send message")).not.toBeDisabled();
    expect(screen.queryByText(/finish your active lesson/i)).not.toBeInTheDocument();
  });

  it("ignores cached streaming messages from the previous thread on the Pro welcome screen", () => {
    mocks.uiMessages = [
      {
        key: "cached_stream",
        role: "assistant",
        status: "streaming",
        parts: [],
      },
    ];
    mocks.chatAdmission = { canSend: true, reason: null, activeThread: null };

    render(<StudiChat />);
    fireEvent.change(
      screen.getByPlaceholderText("What would you like to learn?"),
      { target: { value: "Teach me vectors" } },
    );

    expect(screen.getByLabelText("Send message")).toBeEnabled();
    expect(screen.queryByText(/working on your next step/i)).not.toBeInTheDocument();
  });

  it("explains admission loading instead of silently disabling send", () => {
    mocks.chatAdmission = undefined;
    render(<StudiChat />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /checking lesson availability/i,
    );
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  it("keeps a durable live status above the composer while agent work is active", async () => {
    const view = render(<StudiChat />);

    fireEvent.change(
      screen.getByPlaceholderText("What would you like to learn?"),
      {
        target: { value: "Build a visual explanation" },
      },
    );
    fireEvent.click(screen.getByLabelText("Send message"));

    await screen.findByPlaceholderText("Ask a follow-up...");
    mocks.uiMessages = [
      {
        key: "assistant_streaming",
        role: "assistant",
        status: "streaming",
        parts: [],
      },
    ];
    view.rerender(<StudiChat />);

    expect(await screen.findByRole("status")).toHaveTextContent(
      /working on your next step/i,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Studi is working on your next step.",
    );
    expect(
      screen.getByRole("button", { name: "Stop response" }),
    ).toBeVisible();
  });

  it("stops the selected thread generation and reports cancellation failures in place", async () => {
    const view = render(<StudiChat />);

    fireEvent.change(
      screen.getByPlaceholderText("What would you like to learn?"),
      { target: { value: "Build a visual explanation" } },
    );
    fireEvent.click(screen.getByLabelText("Send message"));
    await screen.findByPlaceholderText("Ask a follow-up...");

    mocks.uiMessages = [
      {
        key: "assistant_streaming",
        role: "assistant",
        status: "streaming",
        parts: [],
      },
    ];
    mocks.cancelGeneration.mockRejectedValueOnce(
      new Error("The response finished before it could be stopped."),
    );
    view.rerender(<StudiChat />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Stop response",
      }),
    );

    await waitFor(() => {
      expect(mocks.cancelGeneration).toHaveBeenCalledWith({
        threadId: "thread_1",
      });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /finished before it could be stopped/i,
    );
  });
});
