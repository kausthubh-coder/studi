import { describe, expect, it } from "vitest";
import {
  classifyModelFailure,
  getPublicSparkFailureMessage,
  getSafeModelFailureMetadata,
  isCrossProviderFallbackEligible,
  isCrossProviderFallbackKind,
  isRetriableModelFailure,
  shouldPublishModelAttemptStream,
} from "@/lib/model-provider-guardrails";

describe("model provider guardrails", () => {
  it("allowlists provider diagnostics without retaining raw messages or response bodies", () => {
    const error = Object.assign(new Error("prompt=private learner context"), {
      name: "AI_APICallError",
      statusCode: 429,
      code: "rate_limit_exceeded",
      requestId: "req_safe_123",
      responseBody: '{"error":"sk-secret private learner context"}',
      cause: new Error("upstream secret"),
    });

    const metadata = getSafeModelFailureMetadata(error);

    expect(metadata).toEqual({
      kind: "provider",
      statusCode: 429,
      code: "rate_limit_exceeded",
      requestId: "req_safe_123",
    });
    expect(JSON.stringify(metadata)).not.toMatch(
      /private|secret|prompt|response/i,
    );
  });

  it("does not misclassify ordinary application errors as provider failures", () => {
    const error = new Error("Database invariant failed for lesson state");

    expect(classifyModelFailure(error)).toBe("other");
    expect(isRetriableModelFailure(error)).toBe(false);
  });

  it("stops on cancellation but permits transient provider and timeout retries", () => {
    const cancelled = new DOMException(
      "The operation was aborted",
      "AbortError",
    );
    const timedOut = Object.assign(new Error("request timed out"), {
      name: "TimeoutError",
    });
    const provider = Object.assign(new Error("upstream unavailable"), {
      name: "AI_APICallError",
      statusCode: 503,
    });

    expect(classifyModelFailure(cancelled)).toBe("cancelled");
    expect(isRetriableModelFailure(cancelled)).toBe(false);
    expect(classifyModelFailure(timedOut)).toBe("timeout");
    expect(isRetriableModelFailure(timedOut)).toBe(true);
    expect(classifyModelFailure(provider)).toBe("provider");
    expect(isRetriableModelFailure(provider)).toBe(true);
  });

  it("does not retry permanent provider failures against the same endpoint", () => {
    const unauthorized = Object.assign(new Error("unauthorized"), {
      name: "AI_APICallError",
      statusCode: 401,
    });

    expect(isRetriableModelFailure(unauthorized)).toBe(false);
    expect(isCrossProviderFallbackEligible(unauthorized)).toBe(true);
  });

  it("recognizes provider auth errors after the agent stream wrapper drops status metadata", () => {
    const wrappedProviderError = new Error("Unauthorized");

    expect(classifyModelFailure(wrappedProviderError)).toBe("provider");
    expect(isRetriableModelFailure(wrappedProviderError)).toBe(true);
    expect(isCrossProviderFallbackEligible(wrappedProviderError)).toBe(true);
    expect(getSafeModelFailureMetadata(wrappedProviderError)).toEqual({
      kind: "provider",
    });
  });

  it("uses a second provider when the first provider returns invalid output", () => {
    const streamWithoutOutput = Object.assign(
      new Error("No output generated. Check the stream for errors."),
      { name: "AI_NoOutputGeneratedError" },
    );

    expect(classifyModelFailure(streamWithoutOutput)).toBe("invalid_output");
    expect(isCrossProviderFallbackEligible(streamWithoutOutput)).toBe(true);
    expect(isCrossProviderFallbackKind("invalid_output")).toBe(true);
    expect(isCrossProviderFallbackKind("cancelled")).toBe(false);
    expect(isCrossProviderFallbackKind("other")).toBe(false);
  });

  it("hides only cross-provider probe streams from the learner", () => {
    expect(
      shouldPublishModelAttemptStream("openrouter", "openrouter"),
    ).toBe(true);
    expect(
      shouldPublishModelAttemptStream("freemodel_anthropic", "openrouter"),
    ).toBe(false);
    expect(shouldPublishModelAttemptStream("openrouter", undefined)).toBe(
      true,
    );
  });

  it("returns generic learner copy that cannot echo provider payloads", () => {
    const publicMessage = getPublicSparkFailureMessage("provider");

    expect(publicMessage).toBe(
      "The model provider could not generate this Spark. Please try again.",
    );
    expect(publicMessage).not.toMatch(/status|response|cause|request|api key/i);
  });
});
