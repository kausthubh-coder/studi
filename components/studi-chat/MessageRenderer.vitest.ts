import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import {
  ArticleMessage,
  deriveAgentUiState,
  deriveAssistantRenderSequence,
} from "@/components/studi-chat/MessageRenderer";
import type { UIMessage } from "@convex-dev/agent/react";

function assistantMessage(parts: UIMessage["parts"], status?: UIMessage["status"]) {
  return {
    id: "assistant-1",
    key: "assistant-1",
    order: 0,
    stepOrder: 0,
    role: "assistant",
    text: "",
    parts,
    status: status ?? "done",
    _creationTime: 0,
  } as unknown as UIMessage;
}

describe("deriveAgentUiState", () => {
  it("prefers spark creation over generic tool activity", () => {
    const state = deriveAgentUiState([
      assistantMessage([
        {
          type: "tool-create_spark",
          state: "input-streaming",
          input: { context: "Build a slope visual" },
        } as never,
      ]),
    ]);

    expect(state.phase).toBe("spark");
  });

  it("reports reasoning and generic tool activity", () => {
    expect(
      deriveAgentUiState([
        assistantMessage([
          { type: "reasoning", state: "streaming", text: "Planning" } as never,
        ]),
      ]).phase,
    ).toBe("reasoning");

    expect(
      deriveAgentUiState([
        assistantMessage([
          {
            type: "tool-run",
            state: "input-available",
            input: { command: "test" },
          } as never,
        ]),
      ]).phase,
    ).toBe("tool");
  });

  it("returns idle when no assistant activity is in progress", () => {
    expect(
      deriveAgentUiState([
        {
          id: "user-1",
          key: "user-1",
          order: 0,
          stepOrder: 0,
          role: "user",
          status: "done",
          text: "hello",
          _creationTime: 0,
          parts: [{ type: "text", text: "hello" }] as never,
        } as unknown as UIMessage,
      ]).phase,
    ).toBe("idle");
  });
});

describe("deriveAssistantRenderSequence", () => {
  it("locks intro, pending spark, rendered spark, final text order", () => {
    const message = assistantMessage([
      { type: "text", text: "Try this tiny visual first." } as never,
      {
        type: "tool-create_spark",
        toolCallId: "spark-1",
        state: "input-available",
        input: { sparkId: "scene", context: "Slope visual" },
      } as never,
      {
        type: "tool-create_spark",
        toolCallId: "spark-1",
        state: "output-available",
        input: { sparkId: "quiz", context: "Check slope intuition" },
        output: {
          status: "success",
          workerSummary: "Created quiz.",
          warnings: [],
          artifact: {
            kind: "spark_quiz",
            version: 1,
            sparkType: "quiz",
            mode: "readonly",
            title: "Slope Check",
            payload: {
              questions: [
                {
                  id: "q1",
                  prompt: "What does slope compare?",
                  choices: [
                    { id: "a", text: "Rise and run" },
                    { id: "b", text: "Only y-values" },
                  ],
                  correctChoiceId: "a",
                },
              ],
            },
          },
        },
      } as never,
      { type: "text", text: "Now use it to test your guess." } as never,
    ]);

    expect(deriveAssistantRenderSequence(message).map((item) => item.kind)).toEqual([
      "intro_text",
      "spark_pending",
      "spark_artifact",
      "final_text",
    ]);
  });

  it("suppresses duplicate intro and final text around a tool boundary", () => {
    const message = assistantMessage([
      { type: "text", text: "Let's build a quick spark." } as never,
      {
        type: "tool-create_spark",
        state: "output-available",
        input: { sparkId: "scene", context: "Quick visual" },
        output: {
          status: "failed",
          workerSummary: "Provider failed.",
          warnings: [],
          error: "Provider fault.",
        },
      } as never,
      { type: "text", text: "Let's build a quick spark." } as never,
    ]);

    expect(deriveAssistantRenderSequence(message).map((item) => item.kind)).toEqual([
      "intro_text",
      "spark_failure",
    ]);
  });
});

describe("ArticleMessage Spark rendering", () => {
  it("does not show a failure card while a Spark is still pending", () => {
    const message = assistantMessage([
      { type: "text", text: "I'll build a quick visual." } as never,
      {
        type: "tool-create_spark",
        state: "input-available",
        input: { sparkId: "scene", context: "Slope visual" },
      } as never,
    ]);

    render(
      createElement(ArticleMessage, {
        message,
        index: 0,
        threadId: null,
        onExpandSpark: () => undefined,
        expandedSparkInstanceId: null,
      }),
    );

    expect(screen.getByText("Building spark")).toBeInTheDocument();
    expect(screen.queryByText(/failed to build/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText("Spark returned an unexpected output shape."),
    ).not.toBeInTheDocument();
  });
});
