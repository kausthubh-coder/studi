import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FaqItem } from "./LandingPage";

describe("FaqItem", () => {
  it("connects its disclosure button to a persistent labelled panel", () => {
    render(<FaqItem q="Is it free?" a="Plan details" />);

    const button = screen.getByRole("button", { name: /is it free/i });
    const panelId = button.getAttribute("aria-controls");

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panelId).toBeTruthy();

    const panel = document.getElementById(panelId!);
    expect(panel).toHaveAttribute("role", "region");
    expect(panel).not.toBeVisible();

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(panel).toBeVisible();
  });
});
