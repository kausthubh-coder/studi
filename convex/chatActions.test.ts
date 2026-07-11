import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import {
  pollGenerationCancellation,
  prepareStudiStreamStep,
  shouldRetryAssistantGeneration,
} from "./chatActions";

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

describe("pollGenerationCancellation", () => {
  it("propagates an exact-order cancellation into the running provider/tool signal", async () => {
    const abortController = new AbortController();
    const abortComponentStream = vi.fn().mockResolvedValue(true);

    await expect(
      pollGenerationCancellation({
        abortController,
        order: 7,
        readControl: async () => ({ order: 7, state: "cancel_requested" }),
        listStreams: async () => [
          { streamId: "older", order: 6, status: "streaming" },
          { streamId: "current", order: 7, status: "aborted" },
        ],
        abortComponentStream,
      }),
    ).resolves.toBe(true);

    expect(abortComponentStream).toHaveBeenCalledWith("current");
    expect(abortController.signal.aborted).toBe(true);
  });

  it("waits for the current stream instead of faking a pre-stream cancellation", async () => {
    const abortController = new AbortController();
    const abortComponentStream = vi.fn();

    await expect(
      pollGenerationCancellation({
        abortController,
        order: 7,
        readControl: async () => ({ order: 7, state: "cancel_requested" }),
        listStreams: async () => [
          { streamId: "older", order: 6, status: "streaming" },
        ],
        abortComponentStream,
      }),
    ).resolves.toBe(false);

    expect(abortComponentStream).not.toHaveBeenCalled();
    expect(abortController.signal.aborted).toBe(false);
  });

  it("aborts local provider work when the generation lease is removed", async () => {
    const abortController = new AbortController();
    const abortComponentStream = vi.fn();

    await expect(
      pollGenerationCancellation({
        abortController,
        order: 7,
        readControl: async () => null,
        listStreams: async () => [],
        abortComponentStream,
      }),
    ).resolves.toBe(true);

    expect(abortComponentStream).not.toHaveBeenCalled();
    expect(abortController.signal.aborted).toBe(true);
  });
});

describe("shouldRetryAssistantGeneration", () => {
  it("never retries a learner-canceled turn even when the provider error looks transient", () => {
    expect(
      shouldRetryAssistantGeneration(new Error("temporary provider failure"), true),
    ).toBe(false);
    expect(
      shouldRetryAssistantGeneration(
        new Error("temporary provider failure"),
        false,
      ),
    ).toBe(true);
  });
});
