import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SparkSceneRenderer from "./SparkSceneRenderer";
import {
  sparkSceneV2Version,
  sparkSceneVersion,
  type SparkArtifact,
} from "@/lib/sparks/contracts";

function renderSpark(artifact: SparkArtifact) {
  render(
    <SparkSceneRenderer
      artifact={artifact}
      expandedSparkInstanceId={null}
      onExpandSpark={vi.fn()}
      sparkInstanceId="spark-instance"
      threadId="thread"
    />,
  );
}

describe("SparkSceneRenderer", () => {
  it("renders legacy scene html artifacts through the sandbox scene", () => {
    renderSpark({
      kind: "spark_scene",
      version: sparkSceneVersion,
      sparkType: "scene",
      mode: "readonly",
      title: "Legacy scene",
      payload: {
        html: "<main>Legacy slope scene</main>",
      },
    });

    const iframe = screen.getByTitle("spark-scene-preview");
    expect(iframe.getAttribute("srcdoc") ?? "").toContain(
      "Legacy slope scene",
    );
  });

  it("renders scene v2 file artifacts through the sandbox scene", () => {
    renderSpark({
      kind: "spark_scene",
      version: sparkSceneV2Version,
      sparkType: "scene",
      mode: "editable",
      title: "V2 scene",
      payload: {
        version: sparkSceneV2Version,
        learningObjective: "Explore how changing one variable moves another.",
        files: {
          "index.html": "<main>V2 slope scene</main>",
          "script.js": "window.StudiScene?.ready();",
        },
        capabilities: {
          usesCanvas: false,
          usesSvg: true,
          needsNetwork: false,
          recordsAnswers: false,
        },
        controls: [],
        checkpoints: [],
      },
    });

    const iframe = screen.getByTitle("spark-scene-preview");
    const srcDoc = iframe.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("V2 slope scene");
    expect(srcDoc).toContain('data-studi-scene-file="script.js"');
  });
});
