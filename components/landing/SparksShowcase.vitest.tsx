import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SparksShowcase } from "./SparksShowcase";

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("SparksShowcase", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("exposes one selected tab and its labelled tabpanel", () => {
    render(<SparksShowcase />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");

    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", tabs[0].id);
    expect(tabs[0]).toHaveAttribute("aria-controls", panel.id);
  });

  it("supports arrow-key selection and focus", () => {
    render(<SparksShowcase />);

    const tabs = screen.getAllByRole("tab");
    tabs[0].focus();
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });

    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveFocus();
  });

  it("stops automatic selection after a learner chooses a tab", () => {
    render(<SparksShowcase />);

    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[2]);
    act(() => vi.advanceTimersByTime(18_000));

    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
  });

  it("does not auto-advance when reduced motion is requested", () => {
    setReducedMotion(true);
    render(<SparksShowcase />);

    const tabs = screen.getAllByRole("tab");
    act(() => vi.advanceTimersByTime(18_000));

    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
  });
});
