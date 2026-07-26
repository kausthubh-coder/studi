import { act, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildActivitySteps,
  deriveAgentUiState,
} from "@/components/studi-chat/MessageRenderer";
import { OrbitalActivity } from "@/components/studi-chat/OrbitalActivity";
import type { UIMessage } from "@convex-dev/agent/react";

function assistantMessage(
  parts: UIMessage["parts"],
  status?: UIMessage["status"] | "done",
  order = 0,
) {
  return {
    id: `assistant-${order}`,
    key: `assistant-${order}`,
    order,
    stepOrder: 0,
    role: "assistant",
    text: "",
    parts,
    status: status ?? "done",
    _creationTime: 0,
  } as unknown as UIMessage;
}

function userMessage(text: string, order = 1) {
  return {
    id: "user-1",
    key: "user-1",
    order,
    stepOrder: 0,
    role: "user",
    status: "done",
    text,
    _creationTime: order,
    parts: [{ type: "text", text }] as never,
  } as unknown as UIMessage;
}

beforeEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

describe("deriveAgentUiState", () => {
  it("prefers spark creation over generic tool activity", () => {
    const state = deriveAgentUiState([
      assistantMessage([
        {
          type: "tool-create_spark",
          state: "input-streaming",
          input: { context: "Build a slope visual" },
        } as never,
      ]),
    ]);

    expect(state.phase).toBe("spark");
  });

  it("reports reasoning and generic tool activity", () => {
    expect(
      deriveAgentUiState([
        assistantMessage([
          { type: "reasoning", state: "streaming", text: "Planning" } as never,
        ]),
      ]).phase,
    ).toBe("reasoning");

    expect(
      deriveAgentUiState([
        assistantMessage([
          {
            type: "tool-run",
            state: "input-available",
            input: { command: "test" },
          } as never,
        ]),
      ]).phase,
    ).toBe("tool");
  });

  it("returns idle when no assistant activity is in progress", () => {
    expect(deriveAgentUiState([userMessage("hello", 0)]).phase).toBe("idle");
  });

  it("keeps active assistant work after the latest user even when it is not the last assistant message", () => {
    expect(
      deriveAgentUiState([
        userMessage("Build a graph", 0),
        assistantMessage(
          [
            {
              type: "tool-create_spark",
              state: "input-available",
              input: { context: "Build a slope visual" },
            } as never,
          ],
          "done",
          1,
        ),
        assistantMessage(
          [{ type: "text", text: "Working on it..." }] as never,
          "done",
          2,
        ),
      ]).phase,
    ).toBe("spark");
  });

  it("ignores stale assistant tool activity after a newer user turn", () => {
    expect(
      deriveAgentUiState([
        assistantMessage([
          {
            type: "tool-create_spark",
            state: "input-available",
            input: { context: "Build a slope visual" },
          } as never,
        ]),
        userMessage("Can you explain that another way?", 1),
      ]).phase,
    ).toBe("idle");
  });

  it("prefers active reasoning over an active generic tool", () => {
    expect(
      deriveAgentUiState([
        assistantMessage([
          {
            type: "tool-some_internal_tool_v2",
            state: "input-available",
          } as never,
          { type: "reasoning", state: "streaming", text: "Planning" } as never,
        ]),
      ]).phase,
    ).toBe("reasoning");
  });

  it("uses the streaming fallback for an assistant message with no parts", () => {
    expect(deriveAgentUiState([assistantMessage([], "streaming")]).phase).toBe(
      "reasoning",
    );
    expect(deriveAgentUiState([assistantMessage([], "done")]).phase).toBe(
      "idle",
    );
  });
});

describe("buildActivitySteps", () => {
  it("uses a curated fallback for unknown tools without leaking identifiers", () => {
    const steps = buildActivitySteps(
      assistantMessage([
        {
          type: "tool-some_internal_tool_v2",
          state: "input-available",
          input: { prompt: "private payload" },
        } as never,
      ]),
    );

    expect(steps[0]?.label).toBe("Looking into it");
    expect(
      steps.flatMap((step) => [step.label, step.detail ?? ""]).join(" "),
    ).not.toContain("some_internal_tool_v2");
    expect(
      steps.flatMap((step) => [step.label, step.detail ?? ""]).join(" "),
    ).not.toContain("private payload");
  });

  it("maps create_spark to the curated spark vocabulary", () => {
    expect(
      buildActivitySteps(
        assistantMessage([
          {
            type: "tool-create_spark",
            state: "input-streaming",
          } as never,
        ]),
      )[0],
    ).toMatchObject({
      kind: "spark",
      label: "Building an interactive Spark",
      status: "active",
    });
  });

  it("maps a structured create_spark failure to error activity", () => {
    const steps = buildActivitySteps(
      assistantMessage([
        {
          type: "tool-create_spark",
          toolCallId: "spark-failure",
          state: "output-available",
          input: {
            sparkId: "scene",
            context: "Explain orbital motion",
          },
          output: {
            status: "failed",
            workerSummary: "The Spark worker could not validate the scene.",
            warnings: [],
            error: "Generated scene failed validation.",
          },
        } as never,
      ]),
    );

    expect(steps[0]).toMatchObject({
      kind: "spark",
      label: "Spark failed to build",
      status: "error",
    });
    expect(steps[0]?.label).not.toBe("Built a Spark");
  });

  it("treats legacy text-only create_spark success as complete activity", () => {
    expect(
      buildActivitySteps(
        assistantMessage([
          {
            type: "tool-create_spark",
            state: "output-available",
            output: "Spark created successfully",
          } as never,
        ]),
      )[0],
    ).toMatchObject({
      kind: "spark",
      label: "Built a Spark",
      status: "complete",
    });
  });

  it("treats malformed create_spark output as error activity", () => {
    expect(
      buildActivitySteps(
        assistantMessage([
          {
            type: "tool-create_spark",
            state: "output-available",
            output: { unexpected: true },
          } as never,
        ]),
      )[0],
    ).toMatchObject({
      label: "Spark failed to build",
      status: "error",
    });
  });
});

describe("OrbitalActivity", () => {
  const reasoningStep = {
    id: "reasoning-1",
    kind: "reasoning" as const,
    label: "Thought it through",
    status: "complete" as const,
  };
  const renderActivity = (
    props: ComponentProps<typeof OrbitalActivity>,
  ) => render(createElement(OrbitalActivity, props));

  it("mounts historical messages already collapsed", () => {
    renderActivity({
      messageKey: "historical",
      phase: "idle",
      steps: [reasoningStep],
      isStreaming: false,
      finalText: "Here is the explanation.",
    });

    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByTestId("orbital-scene")).not.toBeInTheDocument();
  });

  it("collapses a streaming activity after final text arrives", () => {
    vi.useFakeTimers();
    const view = renderActivity({
      messageKey: "streaming",
      phase: "reasoning",
      steps: [{ ...reasoningStep, status: "active" }],
      isStreaming: true,
      finalText: "",
    });
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    view.rerender(
      createElement(OrbitalActivity, {
        messageKey: "streaming",
        phase: "reasoning",
        steps: [{ ...reasoningStep, status: "active" }],
        isStreaming: true,
        finalText: "A first answer token",
      }),
    );
    act(() => vi.advanceTimersByTime(899));
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    vi.useRealTimers();
  });

  it("uses a static correctly-toned frame with reduced motion", () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.mocked(window.requestAnimationFrame).mockClear();

    const { container } = renderActivity({
      messageKey: "reduced",
      phase: "spark",
      steps: [
        {
          id: "spark",
          kind: "spark",
          label: "Building an interactive Spark",
          status: "active",
        },
      ],
      isStreaming: true,
      finalText: "",
    });

    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLElement>(".activity-orbital-core")?.style
        .background,
    ).toBe("rgb(232, 160, 48)");
  });

  it("renders Spark errors with text and error tone without leaking payloads", () => {
    const { container } = renderActivity({
      messageKey: "error",
      phase: "idle",
      steps: [
        {
          id: "spark-error",
          kind: "spark",
          label: "Spark failed to build",
          status: "error",
        },
      ],
      isStreaming: false,
      finalText: "",
    });

    const toggle = screen.getByRole("button");
    expect(container.querySelector('[data-mode="error"]')).toBeInTheDocument();
    expect(toggle).toHaveTextContent("Spark failed to build");
    expect(toggle).not.toHaveTextContent("Studi's steps");
    fireEvent.click(toggle);
    expect(screen.getByText("Spark failed to build")).toBeInTheDocument();
    expect(container).not.toHaveTextContent("create_spark");
    expect(container).not.toHaveTextContent("private payload");
  });

  it("renders curated unknown-tool activity without raw fields", () => {
    const steps = buildActivitySteps(
      assistantMessage([
        {
          type: "tool-some_internal_tool_v2",
          state: "input-available",
          input: { prompt: "private payload", query: "secret query" },
          output: { summary: "private output" },
        } as never,
      ]),
    );
    const { container } = renderActivity({
      messageKey: "unknown",
      phase: "tool",
      steps,
      isStreaming: true,
      finalText: "",
    });

    expect(container).toHaveTextContent("Looking into it");
    expect(container).not.toHaveTextContent("some_internal_tool_v2");
    expect(container).not.toHaveTextContent("private payload");
    expect(container).not.toHaveTextContent("secret query");
    expect(container).not.toHaveTextContent("private output");
  });
});

describe("chat activity audit contracts", () => {
  it("keeps the shared send and stop control at least 44px square", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "app/globals.css"),
      "utf8",
    );
    const rule = styles.match(/\.composer-send-btn\s*\{([^}]*)\}/)?.[1];
    const width = Number(rule?.match(/width:\s*(\d+)px/)?.[1]);
    const height = Number(rule?.match(/height:\s*(\d+)px/)?.[1]);

    expect(width).toBeGreaterThanOrEqual(44);
    expect(height).toBeGreaterThanOrEqual(44);
  });

  it("points the codebase guide at the current activity pipeline", () => {
    const guide = readFileSync(
      resolve(process.cwd(), "CODEBASE_GUIDE.md"),
      "utf8",
    );

    expect(guide).toContain("buildActivitySteps");
    expect(guide).toContain("deriveAgentUiState");
    expect(guide).toContain("OrbitalActivity");
    expect(guide).not.toContain("deriveAssistantActivity");
  });
});
