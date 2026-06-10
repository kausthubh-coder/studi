import { describe, expect, it } from "vitest";
import { deriveAgentUiState } from "@/components/studi-chat/MessageRenderer";
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
