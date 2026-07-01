import { describe, expect, it } from "vitest";
import { sanitizeStudiModelMessages } from "../lib/agent-message-sanitizer";

describe("sanitizeStudiModelMessages", () => {
  it("removes provider-private reasoning blocks from follow-up context", () => {
    const messages = [
      {
        role: "user",
        content: [{ type: "text", text: "Teach me machine learning." }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "private model reasoning",
            providerOptions: {
              anthropic: {
                signature: "stale-signature",
              },
            },
          },
          {
            type: "text",
            text: "Machine learning means learning patterns from examples.",
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "text", text: "I know algebra. Continue." }],
      },
    ];

    const sanitized = sanitizeStudiModelMessages(messages);

    expect(sanitized).toEqual([
      messages[0],
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Machine learning means learning patterns from examples.",
          },
        ],
      },
      messages[2],
    ]);
    expect(JSON.stringify(sanitized)).not.toContain("signature");
    expect(JSON.stringify(sanitized)).not.toContain("private model reasoning");
  });

  it("drops assistant messages that only contain reasoning after pruning", () => {
    const messages = [
      {
        role: "user",
        content: [{ type: "text", text: "Start a lesson." }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "hidden setup",
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "text", text: "Follow up." }],
      },
    ];

    expect(sanitizeStudiModelMessages(messages)).toEqual([
      messages[0],
      messages[2],
    ]);
  });
});
