import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";
import { prepareStudiStreamStep } from "./chatActions";

describe("prepareStudiStreamStep", () => {
  it("strips signed thinking blocks from AI SDK multi-step replay messages", () => {
    const step = prepareStudiStreamStep({
      stepNumber: 1,
      steps: [],
      model: {} as never,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Create a tiny add(a,b) challenge." }],
        },
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              text: "provider-private tool plan",
              signature: "stale-thinking-signature",
            },
            {
              type: "text",
              text: "Let's make this a tiny visible-check challenge.",
            },
            {
              type: "tool-call",
              toolCallId: "call_1",
              toolName: "create_spark",
              input: { kind: "code_challenge" },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_1",
              toolName: "create_spark",
              output: {
                type: "json",
                value: { ok: true },
              },
            },
          ],
        },
      ] as unknown as ModelMessage[],
    });

    expect(step.messages[1]?.content[0]).toEqual({
      type: "text",
      text: "Let's make this a tiny visible-check challenge.",
    });
    expect(JSON.stringify(step.messages)).not.toContain("thinking");
    expect(JSON.stringify(step.messages)).not.toContain("signature");
    expect(JSON.stringify(step.messages)).not.toContain("provider-private");
  });
});
