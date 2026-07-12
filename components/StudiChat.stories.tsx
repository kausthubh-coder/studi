import type { UIMessage } from "@convex-dev/agent/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, waitFor } from "storybook/test";

import {
  exhaustedPreviewBilling,
  freePreviewBilling,
} from "../.storybook/fixtures/billing";
import {
  derivativeConversation,
  tutorStreamingReasoning,
} from "../.storybook/fixtures/messages";
import { slopeSceneArtifact } from "../.storybook/fixtures/sparks";
import { storyThreads } from "../.storybook/fixtures/threads";
import StudiChat from "./StudiChat";

const sendFirstMessage = fn(async () => ({
  threadId: "thread_story_created",
}));
const sendFirstMessageFailure = fn(async () => {
  throw new Error("The tutor could not start this thread. Your draft is safe.");
});
const sendFollowupMessage = fn(async () => null);
const sendFollowupFailure = fn(async () => {
  throw new Error("The follow-up could not be sent. Try again.");
});
const deleteThreadFailure = fn(async () => {
  throw new Error("This thread could not be deleted.");
});

function assistantMessage(
  key: string,
  parts: UIMessage["parts"],
  status: UIMessage["status"] | "done" = "done",
): UIMessage {
  return {
    id: key,
    key,
    order: 10,
    stepOrder: 0,
    role: "assistant",
    text: "",
    parts,
    status,
    _creationTime: Date.UTC(2026, 6, 10, 16, 1, 0),
  } as unknown as UIMessage;
}

const sparkBuildingMessage = assistantMessage(
  "message_story_spark_building",
  [
    {
      type: "tool-create_spark",
      toolCallId: "spark-story-building",
      state: "input-available",
      input: {
        sparkId: "secant_to_tangent",
        context: "Build a draggable secant-to-tangent scene.",
      },
    } as never,
  ],
  "streaming",
);

const sceneSparkMessage = assistantMessage("message_story_scene_spark", [
  {
    type: "tool-create_spark",
    toolCallId: "spark-story-ready",
    state: "output-available",
    input: { sparkId: "secant_to_tangent" },
    output: {
      status: "success",
      workerSummary: "Built a safe secant-line scene.",
      warnings: [],
      artifact: slopeSceneArtifact,
    },
  } as never,
  {
    type: "text",
    text: "Move the point first. What slope do you predict it will approach?",
  } as never,
]);

const baseStudiParameters = {
  convex: {
    queries: {
      "chat:listThreads": storyThreads,
      "billing:getViewerBillingState": freePreviewBilling,
    },
    actions: {
      "chatActions:sendFirstMessage": sendFirstMessage,
      "chatActions:sendMessage": sendFollowupMessage,
    },
  },
  agent: { results: derivativeConversation, status: "Exhausted" as const },
};

function installMobileMatchMedia() {
  const original = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: fn((query: string) => ({
      matches: query.includes("max-width"),
      media: query,
      onchange: null,
      addListener: fn(),
      removeListener: fn(),
      addEventListener: fn(),
      removeEventListener: fn(),
      dispatchEvent: fn(() => true),
    })),
  });
  return () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: original,
    });
  };
}

const meta = {
  component: StudiChat,
  tags: ["autodocs", "ai-generated"],
  parameters: {
    layout: "fullscreen",
    studi: baseStudiParameters,
  },
  beforeEach: () => {
    sendFirstMessage.mockClear();
    sendFirstMessageFailure.mockClear();
    sendFollowupMessage.mockClear();
    sendFollowupFailure.mockClear();
    deleteThreadFailure.mockClear();
  },
} satisfies Meta<typeof StudiChat>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openDerivativeThread(
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"],
  userEvent: Parameters<NonNullable<Story["play"]>>[0]["userEvent"],
) {
  const threadButton = canvas
    .getByText("Understanding derivatives")
    .closest("button");
  await expect(threadButton).not.toBeNull();
  await userEvent.click(threadButton!);
  await expect(
    canvas.getByLabelText("Conversation messages"),
  ).toBeInTheDocument();
}

async function fillComposer(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
  await expect(field).toHaveValue(value);
}

export const Welcome: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Ada")).toBeInTheDocument();
    await expect(
      canvas.getByPlaceholderText("What would you like to learn?"),
    ).toBeEnabled();
  },
};

export const WelcomeBillingLocked: Story = {
  parameters: {
    studi: {
      ...baseStudiParameters,
      convex: {
        ...baseStudiParameters.convex,
        queries: {
          ...baseStudiParameters.convex.queries,
          "billing:getViewerBillingState": exhaustedPreviewBilling,
        },
      },
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/used your free onboarding chats/i),
    ).toBeInTheDocument();
    await fillComposer(
      canvas.getByPlaceholderText("What would you like to learn?"),
      "A saved draft",
    );
    await expect(
      canvas.getByRole("button", { name: "Send message" }),
    ).toBeDisabled();
  },
};

export const Conversation: Story = {
  play: async ({ canvas, userEvent }) => {
    await openDerivativeThread(canvas, userEvent);
    await expect(
      canvas.getByText("Why is a derivative a slope?"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/secant line as the points move together/i),
    ).toBeInTheDocument();
  },
};

export const AgentReasoning: Story = {
  parameters: {
    studi: {
      ...baseStudiParameters,
      agent: {
        results: [...derivativeConversation, tutorStreamingReasoning],
        status: "Exhausted",
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await openDerivativeThread(canvas, userEvent);
    await expect(
      canvas.getByRole("button", { name: /working/i }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      canvas.getByRole("button", { name: "Send message" }),
    ).toBeDisabled();
  },
};

export const SparkBuilding: Story = {
  parameters: {
    studi: {
      ...baseStudiParameters,
      agent: {
        results: [...derivativeConversation, sparkBuildingMessage],
        status: "Exhausted",
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await openDerivativeThread(canvas, userEvent);
    await expect(canvas.getByText("Building spark")).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Send message" }),
    ).toBeDisabled();
  },
};

export const FirstSendSuccess: Story = {
  play: async ({ canvas, userEvent }) => {
    await fillComposer(
      canvas.getByPlaceholderText("What would you like to learn?"),
      "Help me understand a derivative",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(sendFirstMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Help me understand a derivative",
          attachmentIds: [],
        }),
      ),
    );
    await expect(
      await canvas.findByPlaceholderText("Ask a follow-up..."),
    ).toBeInTheDocument();
  },
};

export const SendFailureRestoresDraft: Story = {
  parameters: {
    studi: {
      ...baseStudiParameters,
      convex: {
        ...baseStudiParameters.convex,
        actions: {
          ...baseStudiParameters.convex.actions,
          "chatActions:sendFirstMessage": sendFirstMessageFailure,
        },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    const composer = canvas.getByPlaceholderText(
      "What would you like to learn?",
    );
    await fillComposer(composer, "Keep this draft if sending fails");
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));
    await expect(await canvas.findByText(/draft is safe/i)).toBeInTheDocument();
    await expect(composer).toHaveValue("Keep this draft if sending fails");
  },
};

export const FollowupSendSuccess: Story = {
  play: async ({ canvas, userEvent }) => {
    await openDerivativeThread(canvas, userEvent);
    await fillComposer(
      canvas.getByPlaceholderText("Ask a follow-up..."),
      "What should I notice first?",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));
    await waitFor(() =>
      expect(sendFollowupMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: "thread_story_derivatives",
          prompt: "What should I notice first?",
          attachmentIds: [],
        }),
      ),
    );
  },
};

export const FollowupFailureRestoresDraft: Story = {
  parameters: {
    studi: {
      ...baseStudiParameters,
      convex: {
        ...baseStudiParameters.convex,
        actions: {
          ...baseStudiParameters.convex.actions,
          "chatActions:sendMessage": sendFollowupFailure,
        },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await openDerivativeThread(canvas, userEvent);
    const composer = canvas.getByPlaceholderText("Ask a follow-up...");
    await fillComposer(composer, "Keep this follow-up too");
    await userEvent.click(canvas.getByRole("button", { name: "Send message" }));
    await expect(
      await canvas.findByText(/follow-up could not be sent/i),
    ).toBeInTheDocument();
    await expect(composer).toHaveValue("Keep this follow-up too");
  },
};

export const DeleteFailureBanner: Story = {
  parameters: {
    studi: {
      ...baseStudiParameters,
      convex: {
        ...baseStudiParameters.convex,
        actions: {
          ...baseStudiParameters.convex.actions,
          "chatActions:deleteThread": deleteThreadFailure,
        },
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole("button", { name: "Delete Understanding derivatives" }),
    );
    await expect(
      await canvas.findByText("This thread could not be deleted."),
    ).toBeInTheDocument();
  },
};

export const ExpandedSparkDesktop: Story = {
  parameters: {
    studi: {
      ...baseStudiParameters,
      agent: {
        results: [...derivativeConversation, sceneSparkMessage],
        status: "Exhausted",
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await openDerivativeThread(canvas, userEvent);
    await userEvent.click(canvas.getByRole("button", { name: "Expand spark" }));
    await expect(
      canvas.getByRole("button", { name: "Close spark panel" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("Viewing →")).toBeInTheDocument();
  },
};

export const ExpandedSparkMobile: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    studi: {
      ...baseStudiParameters,
      agent: {
        results: [...derivativeConversation, sceneSparkMessage],
        status: "Exhausted",
      },
    },
  },
  beforeEach: installMobileMatchMedia,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Open sidebar" }));
    await openDerivativeThread(canvas, userEvent);
    await userEvent.click(canvas.getByRole("button", { name: "Expand spark" }));
    await expect(canvas.getByRole("button", { name: "Spark" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Chat" }));
    await expect(canvas.getByRole("button", { name: "Chat" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
};
