import { describe, expect, it } from "vitest";
import { sceneWorkerOutputSchema } from "@/convex/sparks/schemas";
import { loadPrompt, renderPrompt } from "@/lib/prompts";
import { getSparkWorkerOutputRequirements } from "@/lib/sparks/worker-output-requirements";

describe("scene worker generation contract", () => {
  it("renders scene worker prompts with v2 file output requirements", () => {
    const outputRequirements =
      getSparkWorkerOutputRequirements("scene").join("\n");
    const rendered = renderPrompt("sparks/worker-build.md", {
      sparkType: "scene",
      outputRequirements,
      context: "Show slope as rise over run.",
      skillInstructions: loadPrompt("sparks/skills/scene.md"),
    });

    expect(rendered).toContain("Set version to 2");
    expect(rendered).toContain("files.index.html");
    expect(rendered).toContain('<main class="studi-scene">');
    expect(rendered).toContain("--studi-scene-ink");
    expect(rendered).toContain("Never use pale text");
    expect(rendered).toContain("Do not make the whole scene a dark UI");
    expect(rendered).toContain("window.StudiScene.onRestore");
    expect(rendered).toContain("Arrow keys");
    expect(rendered).toContain('role="slider"');
    expect(rendered).toContain("Legacy html-only scene output is invalid");
    expect(rendered).not.toContain(
      "Return strict JSON with keys: title, summary, workerSummary, html.",
    );
  });

  it("requires fresh scene worker output to use the v2 file contract", () => {
    const valid = sceneWorkerOutputSchema.safeParse({
      title: "Slope Explorer",
      summary: "Move rise and run to compare slope.",
      workerSummary: "Created a v2 scene.",
      version: 2,
      learningObjective: "Connect rise over run to steepness.",
      estimatedInteractionSeconds: 45,
      capabilities: {
        usesCanvas: false,
        usesSvg: true,
        needsNetwork: false,
        recordsAnswers: false,
      },
      files: {
        "index.html": "<main>Slope scene</main>",
        "styles.css": "main { min-height: 240px; }",
        "script.js": "window.StudiScene?.ready();",
      },
      controls: [],
      checkpoints: [],
    });
    expect(valid.success).toBe(true);

    const legacyHtmlOnly = sceneWorkerOutputSchema.safeParse({
      title: "Legacy Scene",
      summary: "Old scene.",
      workerSummary: "Created a legacy scene.",
      html: "<!doctype html><html><body>Legacy</body></html>",
    });
    expect(legacyHtmlOnly.success).toBe(false);

    const mixedHtmlAndV2 = sceneWorkerOutputSchema.safeParse({
      title: "Mixed Scene",
      summary: "Should not include html.",
      workerSummary: "Created a mixed scene.",
      version: 2,
      learningObjective: "Use files only.",
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: false,
        recordsAnswers: false,
      },
      files: {
        "index.html": "<main>Scene</main>",
      },
      controls: [],
      checkpoints: [],
      html: "<main>Legacy</main>",
    });
    expect(mixedHtmlAndV2.success).toBe(false);
  });
});
