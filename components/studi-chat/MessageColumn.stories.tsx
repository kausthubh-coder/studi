import type { UIMessage } from "@convex-dev/agent/react";
import { useRef, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import {
  sparkSceneVersion,
  type CreateSparkToolResult,
  type SparkArtifact,
} from "@/lib/sparks/contracts";
import { MessageColumn as MessageColumnComponent } from "./MessageColumn";

const sceneArtifact: SparkArtifact = {
  kind: "spark_scene",
  version: sparkSceneVersion,
  sparkType: "scene",
  mode: "readonly",
  artifactId: "secant-scene",
  title: "Move the secant points",
  summary: "Drag the points together and watch the slope settle.",
  payload: {
    html: "<!doctype html><html><body><main style='font:16px system-ui;padding:24px'>Move A toward B. What value does the slope approach?<script>window.StudiScene?.ready()</script></main></body></html>",
  },
};

function uiMessage(
  role: "user" | "assistant",
  text: string,
  parts: UIMessage["parts"],
  order: number,
): UIMessage {
  return {
    id: `${role}-${order}`,
    key: `${role}-${order}`,
    order,
    stepOrder: 0,
    role,
    text,
    parts,
    status: "done",
    _creationTime: 1_700_000_000_000 + order,
  } as unknown as UIMessage;
}

const conversation: UIMessage[] = [
  uiMessage(
    "user",
    "Why does a derivative use a limit?",
    [{ type: "text", text: "Why does a derivative use a limit?" } as never],
    0,
  ),
  uiMessage(
    "assistant",
    "What happens to a secant line when its two points get closer?",
    [
      {
        type: "text",
        text: "What happens to a secant line when its two points get closer?",
      } as never,
    ],
    1,
  ),
  uiMessage(
    "user",
    "It starts looking like the tangent line.",
    [
      {
        type: "text",
        text: "It starts looking like the tangent line.",
      } as never,
    ],
    2,
  ),
  uiMessage(
    "assistant",
    "Exactly. The limit names the slope that those secant slopes approach.",
    [
      {
        type: "text",
        text: "Exactly. The limit names the slope that those secant slopes approach.",
      } as never,
    ],
    3,
  ),
];

const sparkResult: CreateSparkToolResult = {
  status: "success",
  workerSummary: "Built a safe, self-contained scene.",
  warnings: [],
  artifact: sceneArtifact,
};

const conversationWithSpark: UIMessage[] = [
  ...conversation,
  uiMessage(
    "assistant",
    "",
    [
      {
        type: "tool-create_spark",
        toolCallId: "secant-scene-call",
        state: "output-available",
        input: { sparkId: "secant-scene" },
        output: sparkResult,
      } as never,
      {
        type: "text",
        text: "Try moving the points before you predict the final slope.",
      } as never,
    ],
    4,
  ),
];

type StoryProps = Omit<
  ComponentProps<typeof MessageColumnComponent>,
  "listRef"
>;

function MessageColumn(props: StoryProps) {
  const listRef = useRef<HTMLDivElement>(null);
  return <MessageColumnComponent {...props} listRef={listRef} />;
}

const meta = {
  component: MessageColumn,
  tags: ["autodocs", "ai-generated"],
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <main className="flex h-screen flex-col bg-bg" style={{ minHeight: 620 }}>
        <Story />
      </main>
    ),
  ],
  args: {
    selectedThreadId: "thread_derivatives",
    messages: conversation,
    onExpandSpark: fn(),
    expandedSparkInstanceId: null,
  },
} satisfies Meta<typeof MessageColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoThreadBlank: Story = {
  args: { selectedThreadId: null, messages: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByText("Start by asking a question below."),
    ).not.toBeInTheDocument();
  },
};

export const SelectedThreadEmpty: Story = {
  args: { messages: [] },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Start by asking a question below."),
    ).toBeInTheDocument();
  },
};

export const Conversation: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText("Why does a derivative use a limit?"),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(/limit names the slope/i),
    ).toBeInTheDocument();
  },
};

export const MixedConversationWithSpark: Story = {
  args: { messages: conversationWithSpark },
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByText("Move the secant points"),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Expand spark" }));
    await expect(args.onExpandSpark).toHaveBeenCalledWith(
      sceneArtifact,
      "thread_derivatives",
      "secant-scene",
    );
  },
};

export const ExpandedSparkMinimized: Story = {
  args: {
    messages: conversationWithSpark,
    expandedSparkInstanceId: "secant-scene",
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Viewing →")).toBeInTheDocument();
    await expect(
      canvas.queryByRole("button", { name: "Expand spark" }),
    ).not.toBeInTheDocument();
  },
};

export const LongMobileConversation: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  args: {
    messages: Array.from({ length: 4 }, (_, index) =>
      conversation.map((item) => ({
        ...item,
        id: `${item.id}-${index}`,
        key: `${item.key}-${index}`,
        order: item.order + index * conversation.length,
      })),
    ).flat() as UIMessage[],
  },
};
