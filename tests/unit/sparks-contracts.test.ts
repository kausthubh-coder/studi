import { describe, expect, it } from "vitest";
import {
  isCreateSparkToolResult,
  isSparkArtifact,
  normalizeCreateSparkInput,
  normalizeSparkQuizDraft,
  normalizeSparkSceneDraft,
} from "@/lib/sparks/contracts";
import type { CreateSparkToolInput } from "@/lib/sparks/contracts";

describe("spark contracts", () => {
  it("normalizes create spark input to stable supported values", () => {
    const input = {
      sparkId: "not_a_real_spark",
      context: ` ${"Explain slope. ".repeat(80)} `,
      title: "  Linear intuition  ",
      summary: "",
    } as unknown as CreateSparkToolInput;

    const normalized = normalizeCreateSparkInput(input);

    expect(normalized.sparkId).toBe("scene");
    expect(normalized.context.length).toBeLessThanOrEqual(400);
    expect(normalized.context).toMatch(/^Explain slope/);
    expect(normalized.title).toBe("Linear intuition");
    expect(normalized.summary).toBeUndefined();
  });

  it("validates normalized scene artifacts and tool results", () => {
    const artifact = normalizeSparkSceneDraft({
      html: "<!doctype html><html><body><h1>Slope</h1></body></html>",
      artifactId: "slope-scene",
      title: "Slope Scene",
      summary: "A quick slope visual.",
    });

    expect(isSparkArtifact(artifact)).toBe(true);
    expect(
      isCreateSparkToolResult({
        status: "success",
        workerSummary: "Created a scene.",
        warnings: [],
        artifact,
      }),
    ).toBe(true);
  });

  it("falls back to a usable quiz when a draft is underspecified", () => {
    const artifact = normalizeSparkQuizDraft({
      title: "",
      payload: {
        questions: [
          {
            id: "too_thin",
            prompt: "Only one option?",
            choices: [{ id: "a", text: "Yes" }],
            correctChoiceId: "a",
          },
        ],
      },
    });

    expect(artifact.title).toBe("Quiz");
    expect(artifact.payload.questions).toHaveLength(3);
    expect(artifact.payload.questions[0]?.choices.length).toBeGreaterThanOrEqual(
      2,
    );
  });
});
