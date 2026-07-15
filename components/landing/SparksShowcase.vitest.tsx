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

    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(tabs[3]).toHaveAttribute("aria-selected", "true");
    expect(tabs[3]).toHaveFocus();

    fireEvent.keyDown(tabs[3], { key: "ArrowDown" });
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveFocus();
  });

  it("uses unique, reciprocal tab and panel ids across multiple showcases", () => {
    render(
      <>
        <SparksShowcase />
        <SparksShowcase />
      </>,
    );

    const tabs = screen.getAllByRole("tab");
    const panels = screen.getAllByRole("tabpanel");
    expect(new Set(tabs.map((tab) => tab.id)).size).toBe(tabs.length);
    expect(new Set(panels.map((panel) => panel.id)).size).toBe(panels.length);

    for (const panel of panels) {
      const labelledBy = panel.getAttribute("aria-labelledby");
      const activeTab = document.getElementById(labelledBy!);
      expect(activeTab).toHaveAttribute("aria-controls", panel.id);
      expect(activeTab).toHaveAttribute("aria-selected", "true");
    }
  });

  it("pauses auto-rotation while hovered and resumes after pointer leave", () => {
    render(<SparksShowcase />);

    const tabs = screen.getAllByRole("tab");
    const showcase = screen.getByTestId("sparks-showcase");
    fireEvent.pointerEnter(showcase);
    act(() => vi.advanceTimersByTime(9_000));
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.pointerLeave(showcase);
    act(() => vi.advanceTimersByTime(4_500));
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  });

  it("pauses auto-rotation while focus is within the showcase", () => {
    render(<SparksShowcase />);

    const tabs = screen.getAllByRole("tab");
    fireEvent.focus(tabs[0]);
    act(() => vi.advanceTimersByTime(9_000));
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.blur(tabs[0], { relatedTarget: null });
    act(() => vi.advanceTimersByTime(4_500));
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
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
