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

  it("removes redacted and provider thinking blocks without dropping visible content", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "redacted-reasoning",
            data: "opaque-provider-thinking",
          },
          {
            type: "thinking",
            text: "provider-only thinking",
            signature: "stale-thinking-signature",
          },
          {
            type: "text",
            text: "Try checking what changes after each loop iteration.",
          },
        ],
      },
    ];

    const sanitized = sanitizeStudiModelMessages(messages);

    expect(sanitized).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Try checking what changes after each loop iteration.",
          },
        ],
      },
    ]);
    expect(JSON.stringify(sanitized)).not.toContain("signature");
    expect(JSON.stringify(sanitized)).not.toContain("provider-thinking");
  });

  it("removes signed thinking and reasoning blocks from parts arrays", () => {
    const messages = [
      {
        role: "assistant",
        parts: [
          {
            type: "thinking",
            text: "provider private plan",
            signature: "stale-parts-thinking-signature",
          },
          {
            type: "reasoning",
            text: "provider private reasoning",
            signature: "stale-parts-reasoning-signature",
          },
          {
            type: "text",
            text: "What would change if the loop started at 1?",
          },
          {
            type: "tool-call",
            toolName: "create_spark",
            toolCallId: "call-1",
            args: { kind: "code_challenge" },
          },
        ],
      },
    ];

    const sanitized = sanitizeStudiModelMessages(messages);

    expect(sanitized).toEqual([
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "What would change if the loop started at 1?",
          },
          {
            type: "tool-call",
            toolName: "create_spark",
            toolCallId: "call-1",
            args: { kind: "code_challenge" },
          },
        ],
      },
    ]);
    expect(JSON.stringify(sanitized)).not.toContain("signature");
    expect(JSON.stringify(sanitized)).not.toContain("provider private");
  });

  it("removes top-level reasoning and signed reasoning details", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Try tracing the value of total after each iteration.",
          },
        ],
        reasoning: "hidden chain of thought",
        reasoningDetails: [
          {
            type: "reasoning",
            text: "private detail",
            signature: "stale-top-level-reasoning-signature",
          },
          {
            type: "text",
            text: "provider summary",
            signature: "stale-top-level-text-signature",
          },
          {
            type: "redacted",
            data: "opaque-provider-private-data",
          },
        ],
      },
    ];

    const sanitized = sanitizeStudiModelMessages(messages);

    expect(sanitized).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Try tracing the value of total after each iteration.",
          },
        ],
      },
    ]);
    expect(JSON.stringify(sanitized)).not.toContain("reasoning");
    expect(JSON.stringify(sanitized)).not.toContain("signature");
    expect(JSON.stringify(sanitized)).not.toContain("opaque-provider-private-data");
  });

  it("removes thinking blocks from persisted Convex message wrappers before replay", () => {
    const messages = [
      {
        _id: "message_1",
        threadId: "thread_1",
        status: "success",
        message: {
          role: "user",
          content: [{ type: "text", text: "Create a code challenge." }],
        },
      },
      {
        _id: "message_2",
        threadId: "thread_1",
        status: "success",
        message: {
          role: "assistant",
          content: [
            {
              type: "thinking",
              text: "provider private chain",
              signature: "stale-anthropic-thinking-signature",
            },
            {
              type: "text",
              text: "Try running the loop and watching total change.",
            },
          ],
        },
      },
      {
        _id: "message_3",
        threadId: "thread_1",
        status: "success",
        message: {
          role: "user",
          content: [{ type: "text", text: "Now test it." }],
        },
      },
    ];

    const sanitized = sanitizeStudiModelMessages(messages);
    const outboundMessages = sanitized.map((entry) => entry.message);

    expect(outboundMessages[1]?.content[0]).toEqual({
      type: "text",
      text: "Try running the loop and watching total change.",
    });
    expect(JSON.stringify(sanitized)).not.toContain("thinking");
    expect(JSON.stringify(sanitized)).not.toContain("signature");
    expect(JSON.stringify(sanitized)).not.toContain("provider private chain");
  });
});
