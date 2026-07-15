import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SparkResizeHandle } from "@/components/sparks/SparkResizeHandle";

const resizeCallbacks: ResizeObserverCallback[] = [];

class ResizeObserverMock implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }

  disconnect = vi.fn();
  observe = vi.fn();
  unobserve = vi.fn();
}

function SplitHarness() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(420);

  return (
    <div ref={containerRef} data-testid="spark-split-container">
      <output data-testid="chat-width">{width}</output>
      <SparkResizeHandle
        containerRef={containerRef}
        width={width}
        onWidthChange={setWidth}
      />
    </div>
  );
}

describe("SparkResizeHandle", () => {
  const containerLeft = 240;
  let containerWidth = 1_100;

  beforeEach(() => {
    resizeCallbacks.length = 0;
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.testid === "spark-split-container") {
          return {
            bottom: 800,
            height: 800,
            left: containerLeft,
            right: containerLeft + containerWidth,
            top: 0,
            width: containerWidth,
            x: containerLeft,
            y: 0,
            toJSON: () => ({}),
          };
        }
        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses split-local drag math and preserves a 420px Spark pane", () => {
    render(<SplitHarness />);

    const separator = screen.getByRole("separator", {
      name: "Resize chat and Spark panels",
    });
    act(() => {
      resizeCallbacks.at(-1)?.([], {} as ResizeObserver);
    });
    expect(separator).toHaveAttribute("tabindex", "0");
    expect(separator).toHaveAttribute("aria-valuenow", "420");
    expect(separator).toHaveAttribute("aria-valuemin", "340");
    expect(separator).toHaveAttribute("aria-valuemax", "674");

    fireEvent.mouseDown(separator);
    fireEvent.mouseMove(window, { clientX: containerLeft + 460 });
    expect(screen.getByTestId("chat-width")).toHaveTextContent("460");

    fireEvent.mouseMove(window, { clientX: containerLeft + 900 });
    expect(screen.getByTestId("chat-width")).toHaveTextContent("674");
    fireEvent.mouseUp(window);
  });

  it("uses the current split bounds for End and same-breakpoint resizes", () => {
    render(<SplitHarness />);

    const separator = screen.getByRole("separator", {
      name: "Resize chat and Spark panels",
    });
    act(() => {
      resizeCallbacks.at(-1)?.([], {} as ResizeObserver);
    });
    fireEvent.keyDown(separator, { key: "End" });
    expect(screen.getByTestId("chat-width")).toHaveTextContent("674");

    containerWidth = 900;
    act(() => {
      resizeCallbacks.at(-1)?.([], {} as ResizeObserver);
    });

    expect(screen.getByTestId("chat-width")).toHaveTextContent("474");
    expect(separator).toHaveAttribute("aria-valuemax", "474");
    expect(separator).toHaveAttribute("aria-valuenow", "474");
  });
});
