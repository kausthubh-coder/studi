import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, waitFor } from "storybook/test";

import {
  sparkSceneV2Version,
  type SceneSparkV2Payload,
} from "@/lib/sparks/contracts";
import HtmlCssJsSandboxScene from "./HtmlCssJsSandboxScene";

const interactiveScene: SceneSparkV2Payload = {
  version: sparkSceneV2Version,
  learningObjective:
    "See how the slope changes as a point moves along a curve.",
  estimatedInteractionSeconds: 45,
  capabilities: {
    usesCanvas: false,
    usesSvg: true,
    needsNetwork: false,
    recordsAnswers: true,
  },
  files: {
    "index.html": `
      <main class="studi-scene">
        <h2>Move the point</h2>
        <p class="instructions">Predict whether the tangent gets steeper.</p>
        <label for="position">Position</label>
        <input id="position" type="range" min="-4" max="4" value="1" />
        <output id="slope">Slope: 2</output>
      </main>
    `,
    "styles.css": `
      main { display: grid; gap: 16px; }
      output { font-weight: 700; color: var(--studi-scene-teal); }
    `,
    "script.js": `
      const slider = document.querySelector('#position');
      const output = document.querySelector('#slope');
      slider?.addEventListener('input', () => {
        output.textContent = 'Slope: ' + (2 * Number(slider.value));
        window.StudiScene?.interaction('position', slider.value);
      });
    `,
  },
  controls: [
    {
      id: "position",
      type: "slider",
      label: "Position",
      min: -4,
      max: 4,
      step: 1,
      defaultValue: 1,
    },
  ],
  checkpoints: [
    {
      id: "slope_direction",
      prompt: "Does the slope increase as x increases?",
      answerType: "boolean",
    },
  ],
};

function sceneFrame(
  canvas: Parameters<NonNullable<Story["play"]>>[0]["canvas"],
) {
  return canvas.getByTitle("spark-scene-preview") as HTMLIFrameElement;
}

function postSceneMessage(
  frame: HTMLIFrameElement,
  type: "ready" | "resize" | "error",
  payload: Record<string, string | number | boolean> = {},
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      source: frame.contentWindow,
      data: {
        source: "studi-scene",
        version: 1,
        type,
        payload,
      },
    }),
  );
}

const meta = {
  title: "Sparks/Scenes/HtmlCssJsSandboxScene",
  component: HtmlCssJsSandboxScene,
  tags: ["autodocs", "ai-generated"],
  parameters: {
    docs: {
      description: {
        component:
          "The isolated Scene Spark renderer. It builds a CSP-protected srcDoc, runs it with scripts-only iframe permissions, and accepts ready, resize, and error messages from that exact frame.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: "min(820px, calc(100vw - 2rem))",
          minHeight: 520,
          padding: "1rem",
          background: "var(--bg)",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    payload: interactiveScene,
    isExpanded: false,
  },
} satisfies Meta<typeof HtmlCssJsSandboxScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveV2: Story = {
  play: async ({ canvas }) => {
    const frame = sceneFrame(canvas);
    await expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");

    const srcDoc = frame.getAttribute("srcdoc") ?? "";
    await expect(srcDoc).toContain("Content-Security-Policy");
    await expect(srcDoc).toContain("window.StudiScene");
    await expect(srcDoc).toContain('data-studi-scene-file="styles.css"');
    await expect(srcDoc).toContain('data-studi-scene-file="script.js"');

    postSceneMessage(frame, "ready");
    await waitFor(() => {
      expect(canvas.queryByRole("status")).not.toBeInTheDocument();
    });
  },
};

export const LegacyV1: Story = {
  args: {
    payload: {
      html: `
        <!doctype html>
        <html>
          <head><style>main { padding: 24px; font-family: sans-serif; }</style></head>
          <body><main><h2>Legacy force diagram</h2><p>Saved Scene v1 content remains readable.</p></main></body>
        </html>
      `,
    },
  },
  play: async ({ canvas }) => {
    const frame = sceneFrame(canvas);
    const srcDoc = frame.getAttribute("srcdoc") ?? "";
    await expect(srcDoc).toContain("Legacy force diagram");
    await expect(srcDoc).toContain("window.StudiScene");
    await expect(srcDoc).toContain("https://cdn.jsdelivr.net");
  },
};

export const ResizesWithinSafeBounds: Story = {
  play: async ({ canvas }) => {
    const frame = sceneFrame(canvas);

    postSceneMessage(frame, "resize", { height: 80 });
    await waitFor(() => expect(frame).toHaveStyle({ height: "220px" }));

    postSceneMessage(frame, "resize", { height: 760 });
    await waitFor(() => expect(frame).toHaveStyle({ height: "760px" }));

    postSceneMessage(frame, "resize", { height: 4_000 });
    await waitFor(() => expect(frame).toHaveStyle({ height: "1200px" }));
  },
};

export const RuntimeError: Story = {
  play: async ({ canvas }) => {
    const frame = sceneFrame(canvas);
    postSceneMessage(frame, "ready");
    postSceneMessage(frame, "error", {
      message: "The slope control could not update.",
    });

    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "The slope control could not update.",
    );
  },
};

export const Expanded: Story = {
  args: {
    isExpanded: true,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "min(980px, 100vw)", height: 720 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    const frame = sceneFrame(canvas);
    await expect(frame.style.height).toBe("100%");

    postSceneMessage(frame, "resize", { height: 680 });
    await waitFor(() => expect(frame.style.height).toBe("100%"));
  },
};

export const EmptyLegacyDocument: Story = {
  args: {
    payload: { html: "" },
  },
  play: async ({ canvas }) => {
    const frame = sceneFrame(canvas);
    const srcDoc = frame.getAttribute("srcdoc") ?? "";
    await expect(srcDoc).toContain("<!doctype html>");
    await expect(srcDoc).toContain("window.StudiScene");
  },
};
