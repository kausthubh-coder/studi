import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HtmlCssJsSandboxScene from "./HtmlCssJsSandboxScene";
import {
  sparkSceneV2Version,
  type SceneSparkV2Payload,
} from "@/lib/sparks/contracts";

describe("HtmlCssJsSandboxScene", () => {
  const payload: SceneSparkV2Payload = {
    version: sparkSceneV2Version,
    learningObjective: "Test a visual hypothesis.",
    files: {
      "index.html": '<main><button id="run">Run</button></main>',
      "styles.css": "button { color: teal; }",
      "script.js": "window.StudiScene?.ready();",
    },
    capabilities: {
      usesCanvas: false,
      usesSvg: false,
      needsNetwork: false,
      recordsAnswers: false,
    },
    controls: [],
    checkpoints: [],
  };

  it("renders v2 scene files with CSP and the Studi runtime bridge", () => {
    render(
      <HtmlCssJsSandboxScene
        isExpanded={false}
        payload={payload}
      />,
    );

    const iframe = screen.getByTitle("spark-scene-preview");
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    expect(iframe).not.toHaveAttribute("allow", expect.stringContaining("same-origin"));

    const srcDoc = iframe.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("Content-Security-Policy");
    expect(srcDoc).toContain("script-src 'unsafe-inline'");
    expect(srcDoc).not.toContain("https://cdn.jsdelivr.net");
    expect(srcDoc).toContain("window.StudiScene");
    expect(srcDoc).toContain('data-studi-scene-file="styles.css"');
    expect(srcDoc).toContain('data-studi-scene-file="script.js"');
  });

  it("keeps the v1 Tailwind CDN compatibility path", () => {
    render(
      <HtmlCssJsSandboxScene
        isExpanded={false}
        payload={{
          html: '<!doctype html><html><head><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script></head><body><main>Legacy scene</main></body></html>',
        }}
      />,
    );

    const iframe = screen.getByTitle("spark-scene-preview");
    const srcDoc = iframe.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("https://cdn.jsdelivr.net");
    expect(srcDoc).toContain("window.StudiScene");
  });

  it("accepts scene messages only from the rendered iframe", async () => {
    render(<HtmlCssJsSandboxScene isExpanded={false} payload={payload} />);

    const iframe = screen.getByTitle("spark-scene-preview") as HTMLIFrameElement;
    expect(screen.getByRole("status")).toHaveTextContent("Loading scene");

    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: {
          source: "studi-scene",
          version: 1,
          type: "ready",
          payload: {},
        },
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading scene");

    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        data: {
          source: "studi-scene",
          version: 1,
          type: "resize",
          payload: { height: 612 },
        },
      }),
    );
    await waitFor(() => expect(iframe).toHaveStyle({ height: "612px" }));

    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        data: {
          source: "studi-scene",
          version: 1,
          type: "ready",
          payload: {},
        },
      }),
    );
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});
