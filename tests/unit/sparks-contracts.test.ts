import { describe, expect, it } from "vitest";
import {
  isCreateSparkToolResult,
  isSparkArtifact,
  isSparkType,
  normalizeCreateSparkInput,
  normalizeSparkQuizDraft,
  normalizeSparkSceneDraft,
  sparkSceneV2Version,
  sparkTypes,
} from "@/lib/sparks/contracts";
import type { CreateSparkToolInput } from "@/lib/sparks/contracts";

describe("spark contracts", () => {
  it("only exposes the remaining supported spark types", () => {
    expect(sparkTypes).toEqual([
      "scene",
      "quiz",
      "flash_card",
      "desmos_graph",
      "code",
      "test",
    ]);
    expect(isSparkType("code_playground")).toBe(false);
    expect(isSparkType("web_playground")).toBe(false);
  });

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

  it("normalizes removed playground spark ids back to the default scene", () => {
    expect(
      normalizeCreateSparkInput({
        sparkId: "code_playground",
        context: "Practice Python",
      } as unknown as CreateSparkToolInput).sparkId,
    ).toBe("scene");
    expect(
      normalizeCreateSparkInput({
        sparkId: "web_playground",
        context: "Practice CSS",
      } as unknown as CreateSparkToolInput).sparkId,
    ).toBe("scene");
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

  it("normalizes scene v2 drafts with files and learning metadata", () => {
    const artifact = normalizeSparkSceneDraft({
      version: sparkSceneV2Version,
      title: "Slope Explorer",
      summary: "Move the run and rise to feel slope.",
      learningObjective: "Help the learner connect rise over run to steepness.",
      files: {
        "index.html": '<main><button id="step">Step</button></main>',
        "styles.css": "main { min-height: 240px; }",
        "script.js": "document.querySelector('#step')?.addEventListener('click', () => window.StudiScene?.interaction('step'));",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: true,
        needsNetwork: true,
        recordsAnswers: true,
      },
      controls: [
        {
          id: "rise",
          type: "slider",
          label: "Rise",
          min: -5,
          max: 5,
          defaultValue: 2,
        },
      ],
      checkpoints: [
        {
          id: "predict",
          prompt: "What happens when rise increases?",
          answerType: "choice",
          choices: ["steeper", "flatter"],
        },
      ],
    });

    if (artifact.version !== sparkSceneV2Version) {
      throw new Error("Expected a scene v2 artifact.");
    }

    expect(artifact.mode).toBe("editable");
    expect(artifact.payload.files["index.html"]).toContain("button");
    expect(artifact.payload.learningObjective).toMatch(/rise over run/i);
    expect(artifact.payload.capabilities.needsNetwork).toBe(true);
    expect(artifact.payload.controls).toHaveLength(1);
    expect(artifact.payload.checkpoints).toHaveLength(1);
    expect(isSparkArtifact(artifact)).toBe(true);
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
