import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
    render(<HtmlCssJsSandboxScene isExpanded={false} payload={payload} />);

    const iframe = screen.getByTitle("spark-scene-preview");
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    expect(iframe).not.toHaveAttribute(
      "allow",
      expect.stringContaining("same-origin"),
    );

    const srcDoc = iframe.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("Content-Security-Policy");
    expect(srcDoc).toContain("script-src 'unsafe-inline'");
    expect(srcDoc).not.toContain("https://cdn.jsdelivr.net");
    expect(srcDoc).toContain("window.StudiScene");
    expect(srcDoc).toContain("data-studi-scene-theme");
    expect(srcDoc).toContain("data-studi-scene-contrast-guard");
    expect(srcDoc).toContain("--studi-scene-ink");
    expect(srcDoc).toContain("--studi-scene-bg");
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
    expect(srcDoc).toContain("data-studi-scene-theme");
  });

  it("accepts scene messages only from the rendered iframe", async () => {
    render(<HtmlCssJsSandboxScene isExpanded={false} payload={payload} />);

    const iframe = screen.getByTitle(
      "spark-scene-preview",
    ) as HTMLIFrameElement;
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

  it("restores interaction and checkpoint progress when the scene remounts", async () => {
    const firstMount = render(
      <HtmlCssJsSandboxScene
        isExpanded={false}
        payload={payload}
        sessionKey="thread_1:spark_1"
      />,
    );
    const firstFrame = screen.getByTitle(
      "spark-scene-preview",
    ) as HTMLIFrameElement;

    window.dispatchEvent(
      new MessageEvent("message", {
        source: firstFrame.contentWindow,
        data: {
          source: "studi-scene",
          version: 1,
          type: "interaction",
          payload: { id: "outlier", value: 14 },
        },
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        source: firstFrame.contentWindow,
        data: {
          source: "studi-scene",
          version: 1,
          type: "checkpoint",
          payload: { id: "mean_moves", value: "mean", correct: true },
        },
      }),
    );
    firstMount.unmount();

    render(
      <HtmlCssJsSandboxScene
        isExpanded
        payload={payload}
        sessionKey="thread_1:spark_1"
      />,
    );
    const restoredFrame = screen.getByTitle(
      "spark-scene-preview",
    ) as HTMLIFrameElement;
    const postMessage = vi.spyOn(restoredFrame.contentWindow!, "postMessage");

    window.dispatchEvent(
      new MessageEvent("message", {
        source: restoredFrame.contentWindow,
        data: {
          source: "studi-scene",
          version: 1,
          type: "ready",
          payload: {},
        },
      }),
    );

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "studi-host",
          version: 1,
          type: "restore",
          payload: expect.objectContaining({ state: expect.any(String) }),
        }),
        "*",
      );
    });
    const state = JSON.parse(
      postMessage.mock.calls.at(-1)?.[0].payload.state as string,
    );
    expect(state.interactions.outlier).toBe(14);
    expect(state.checkpoints.mean_moves).toEqual({
      value: "mean",
      correct: true,
    });

    const srcDoc = restoredFrame.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("onRestore");
    expect(srcDoc).toContain("studi:restore");
  });
});
