import { describe, expect, it } from "vitest";
import { deriveAgentUiState } from "@/components/studi-chat/MessageRenderer";
import type { UIMessage } from "@convex-dev/agent/react";

function assistantMessage(
  parts: UIMessage["parts"],
  status?: UIMessage["status"] | "done",
  order = 0,
) {
  return {
    id: `assistant-${order}`,
    key: `assistant-${order}`,
    order,
    stepOrder: 0,
    role: "assistant",
    text: "",
    parts,
    status: status ?? "done",
    _creationTime: 0,
  } as unknown as UIMessage;
}

function userMessage(text: string, order = 1) {
  return {
    id: "user-1",
    key: "user-1",
    order,
    stepOrder: 0,
    role: "user",
    status: "done",
    text,
    _creationTime: order,
    parts: [{ type: "text", text }] as never,
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
    expect(deriveAgentUiState([userMessage("hello", 0)]).phase).toBe("idle");
  });

  it("keeps active assistant work after the latest user even when it is not the last assistant message", () => {
    expect(
      deriveAgentUiState([
        userMessage("Build a graph", 0),
        assistantMessage(
          [
            {
              type: "tool-create_spark",
              state: "input-available",
              input: { context: "Build a slope visual" },
            } as never,
          ],
          "done",
          1,
        ),
        assistantMessage(
          [{ type: "text", text: "Working on it..." }] as never,
          "done",
          2,
        ),
      ]).phase,
    ).toBe("spark");
  });

  it("ignores stale assistant tool activity after a newer user turn", () => {
    expect(
      deriveAgentUiState([
        assistantMessage([
          {
            type: "tool-create_spark",
            state: "input-available",
            input: { context: "Build a slope visual" },
          } as never,
        ]),
        userMessage("Can you explain that another way?", 1),
      ]).phase,
    ).toBe("idle");
  });
});
