import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import {
  createAssistantGenerationFailureError,
  getAssistantGenerationFailureMetadata,
  hasMeaningfulAssistantGenerationSteps,
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

  it("aborts local provider work when cancellation arrives before a component stream exists", async () => {
    const abortController = new AbortController();
    const abortComponentStream = vi.fn();

    await expect(
      pollGenerationCancellation({
        abortController,
        order: 7,
        readControl: async () => ({ order: 7, state: "cancel_requested" }),
        listStreams: async () => [],
        abortComponentStream,
      }),
    ).resolves.toBe(true);

    expect(abortComponentStream).not.toHaveBeenCalled();
    expect(abortController.signal.aborted).toBe(true);
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
    expect(
      shouldRetryAssistantGeneration(
        new DOMException("Learner stopped response generation", "AbortError"),
        false,
      ),
    ).toBe(false);
  });
});

describe("hasMeaningfulAssistantGenerationSteps", () => {
  it("rejects an empty successful provider step so cross-provider fallback can run", () => {
    expect(
      hasMeaningfulAssistantGenerationSteps([
        {
          text: "",
          toolResults: [],
        },
      ]),
    ).toBe(false);
  });

  it("accepts learner-visible text or a completed tool result", () => {
    expect(
      hasMeaningfulAssistantGenerationSteps([
        {
          text: "What do you predict the function returns?",
          toolResults: [],
        },
      ]),
    ).toBe(true);
    expect(
      hasMeaningfulAssistantGenerationSteps([
        {
          text: "",
          toolResults: [{ toolName: "create_spark" }],
        },
      ]),
    ).toBe(true);
  });
});

describe("assistant generation failure privacy", () => {
  it("keeps provider secrets out of telemetry metadata and the public error", () => {
    const providerError = Object.assign(
      new Error("sk-private prompt=learner-secret"),
      {
        name: "AI_APICallError",
        statusCode: 503,
        code: "upstream_unavailable",
        requestId: "req_safe_123",
        responseBody: "api-key-private-response",
      },
    );

    const metadata = getAssistantGenerationFailureMetadata(providerError);
    const publicError = createAssistantGenerationFailureError();

    expect(metadata).toEqual({
      kind: "provider",
      statusCode: 503,
      code: "upstream_unavailable",
      requestId: "req_safe_123",
    });
    expect(JSON.stringify(metadata)).not.toMatch(/private|prompt|secret|api-key/i);
    expect(publicError.message).toBe(
      "Assistant generation failed after model provider attempts.",
    );
    expect(publicError.message).not.toMatch(/private|prompt|secret|api-key/i);
  });
});
