import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SparkSceneRenderer from "./SparkSceneRenderer";
import {
  sparkSceneV2Version,
  sparkSceneVersion,
  type SparkArtifact,
} from "@/lib/sparks/contracts";

vi.mock("@monaco-editor/react", () => ({
  default: () => <textarea aria-label="monaco editor" readOnly />,
}));

vi.mock("convex/react", () => ({
  useAction: () => vi.fn(),
  useMutation: () => vi.fn().mockResolvedValue({}),
  useQuery: () => null,
}));

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

  it("renders runnable inline Code Spark controls and expands through the shared panel model", async () => {
    const onExpandSpark = vi.fn();
    const artifact: SparkArtifact = {
      kind: "spark_code",
      version: sparkSceneVersion,
      sparkType: "code",
      mode: "editable",
      artifactId: "code_add",
      title: "Add numbers",
      summary: "Fix the function, then run visible checks.",
      payload: {
        mode: "challenge",
        language: "typescript",
        instructions: "Return the sum.",
        provider: "local_fake",
        providerStatus: "test_only",
        activePath: "src/add.ts",
        files: [
          {
            path: "src/add.ts",
            language: "typescript",
            contents: "export function add(a: number, b: number) { return 0; }",
            editable: true,
            role: "starter",
          },
        ],
        tests: [
          {
            id: "visible",
            label: "adds visible numbers",
            command: "node tests/add.check.ts",
            hidden: false,
          },
        ],
        hiddenTestCount: 0,
        runCommand: "node tests/add.check.ts",
        testCommand: "node tests/add.check.ts",
        lab: {
          enabled: false,
          reason: "Open in Lab is disabled until a real Lab handoff exists.",
        },
      },
    };

    render(
      <SparkSceneRenderer
        artifact={artifact}
        expandedSparkInstanceId={null}
        onExpandSpark={onExpandSpark}
        sparkInstanceId="spark-instance"
        threadId="thread"
      />,
    );

    expect(screen.getByText("Add numbers")).toBeInTheDocument();
    // Inline is compact, but still directly usable without opening the panel.
    expect(
      screen.getByRole("note", { name: "Challenge guidance" }),
    ).toHaveTextContent("Return the sum.");
    expect(screen.queryByText("Challenge Spark")).not.toBeInTheDocument();
    expect(screen.getByText("Return the sum.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /run adds visible numbers/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Terminal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Test results" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("monaco editor")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expand/i }));
    expect(onExpandSpark).toHaveBeenCalledWith(
      artifact,
      "thread",
      "spark-instance",
    );
  });
});
