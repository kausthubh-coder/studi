import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, waitFor } from "storybook/test";

import type { DesmosGraphPayload } from "@/lib/sparks/contracts";
import DesmosGraphScene from "./DesmosGraphScene";

const parabolaGraph: DesmosGraphPayload = {
  expressions: [
    {
      id: "curve",
      latex: "y=x^2",
      color: "#3a9e8a",
      label: "curve",
      showLabel: true,
    },
    {
      id: "tangent",
      latex: "y=2x-1",
      color: "#e05a3a",
      lineStyle: "DASHED",
      label: "tangent at x=1",
      showLabel: true,
    },
  ],
  settings: {
    expressionsCollapsed: false,
    showGrid: true,
    xAxisLabel: "x",
    yAxisLabel: "y",
  },
  viewport: {
    left: -5,
    right: 5,
    bottom: -4,
    top: 10,
  },
  hint: "Zoom near x = 1 and compare the slopes.",
};

type FakeCalculator = {
  setBlank: ReturnType<typeof fn>;
  setExpressions: ReturnType<typeof fn>;
  updateSettings: ReturnType<typeof fn>;
  setMathBounds: ReturnType<typeof fn>;
  destroy: ReturnType<typeof fn>;
};

let calculator: FakeCalculator;
let graphingCalculator: ReturnType<typeof fn>;

function installReadyDesmos() {
  calculator = {
    setBlank: fn(),
    setExpressions: fn(),
    updateSettings: fn(),
    setMathBounds: fn(),
    destroy: fn(),
  };
  graphingCalculator = fn(() => calculator);
  window.__studiDesmosLoader = undefined;
  window.Desmos = { GraphingCalculator: graphingCalculator };

  return () => {
    window.Desmos = undefined;
    window.__studiDesmosLoader = undefined;
  };
}

function interceptDesmosScript(mode: "stall" | "fail") {
  window.Desmos = undefined;
  window.__studiDesmosLoader = undefined;

  const originalAppendChild = document.head.appendChild;
  document.head.appendChild = function appendChild<T extends Node>(node: T): T {
    if (
      node instanceof HTMLScriptElement &&
      node.src.startsWith("https://www.desmos.com/api/")
    ) {
      if (mode === "fail") {
        queueMicrotask(() => node.onerror?.(new Event("error")));
      }
      return node;
    }
    return originalAppendChild.call(this, node) as T;
  };

  return () => {
    document.head.appendChild = originalAppendChild;
    window.Desmos = undefined;
    window.__studiDesmosLoader = undefined;
  };
}

const meta = {
  title: "Sparks/Scenes/DesmosGraphScene",
  component: DesmosGraphScene,
  tags: ["autodocs", "ai-generated"],
  parameters: {
    docs: {
      description: {
        component:
          "A deterministic Desmos graph host. Storybook supplies a non-secret placeholder key and an in-memory calculator so the stories never contact desmos.com.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: "min(820px, calc(100vw - 2rem))",
          minHeight: 500,
          padding: "1rem",
          background: "var(--bg)",
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    payload: parabolaGraph,
    isExpanded: false,
  },
} satisfies Meta<typeof DesmosGraphScene>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  beforeEach: installReadyDesmos,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(graphingCalculator).toHaveBeenCalledOnce());
    await expect(calculator.setBlank).toHaveBeenCalledWith({
      allowUndo: false,
    });
    await expect(calculator.updateSettings).toHaveBeenCalledWith(
      parabolaGraph.settings,
    );
    await expect(calculator.setExpressions).toHaveBeenCalledWith(
      parabolaGraph.expressions,
    );
    await expect(calculator.setMathBounds).toHaveBeenCalledWith(
      parabolaGraph.viewport,
    );

    const graphMount = canvasElement.querySelector(
      ".spark-scene-content > div:last-child",
    );
    await expect(graphMount).toHaveStyle({ height: "460px", display: "block" });
  },
};

export const ExpressionsOnly: Story = {
  args: {
    payload: {
      expressions: [{ id: "wave", latex: "y=\\sin(x)" }],
      hint: "Pan along the wave.",
    },
  },
  beforeEach: installReadyDesmos,
  play: async () => {
    await waitFor(() => expect(graphingCalculator).toHaveBeenCalledOnce());
    await expect(calculator.setBlank).toHaveBeenCalledWith({
      allowUndo: false,
    });
    await expect(calculator.setExpressions).toHaveBeenCalledWith([
      { id: "wave", latex: "y=\\sin(x)" },
    ]);
    await expect(calculator.updateSettings).not.toHaveBeenCalled();
    await expect(calculator.setMathBounds).not.toHaveBeenCalled();
  },
};

export const LoadingScript: Story = {
  beforeEach: () => interceptDesmosScript("stall"),
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.queryByText(/failed|missing|unable/i),
    ).not.toBeInTheDocument();
    const graphMount = canvasElement.querySelector(
      ".spark-scene-content > div:last-child",
    );
    await expect(graphMount).toHaveStyle({ height: "460px", display: "block" });
  },
};

export const ScriptFailure: Story = {
  beforeEach: () => interceptDesmosScript("fail"),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText("Failed to load Desmos API script."),
    ).toBeVisible();
    await expect(window.__studiDesmosLoader).toBeUndefined();
  },
};

export const Expanded: Story = {
  args: { isExpanded: true },
  beforeEach: installReadyDesmos,
  decorators: [
    (Story) => (
      <div style={{ width: "min(980px, 100vw)", height: 720 }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(graphingCalculator).toHaveBeenCalledOnce());
    const graphMount = canvasElement.querySelector(
      ".spark-scene-content > div:last-child",
    ) as HTMLDivElement;
    await expect(graphMount.style.height).toBe("100%");
    await expect(graphMount.style.display).toBe("block");
  },
};

export const Mobile: Story = {
  beforeEach: installReadyDesmos,
  decorators: [
    (Story) => (
      <div style={{ width: 360, minHeight: 500 }}>
        <Story />
      </div>
    ),
  ],
  play: async () => {
    await waitFor(() => expect(graphingCalculator).toHaveBeenCalledOnce());
    await expect(calculator.setExpressions).toHaveBeenCalledWith(
      parabolaGraph.expressions,
    );
  },
};
