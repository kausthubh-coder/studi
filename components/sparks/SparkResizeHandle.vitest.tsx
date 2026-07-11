import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SparkResizeHandle } from "@/components/sparks/SparkResizeHandle";

describe("SparkResizeHandle", () => {
  it("exposes separator state and supports keyboard resizing", () => {
    const onWidthChange = vi.fn();
    render(
      <SparkResizeHandle
        width={420}
        minWidth={340}
        maxWidth={900}
        onWidthChange={onWidthChange}
        onMouseDown={vi.fn()}
        onTouchStart={vi.fn()}
      />,
    );

    const separator = screen.getByRole("separator", {
      name: "Resize chat and Spark panels",
    });
    expect(separator).toHaveAttribute("tabindex", "0");
    expect(separator).toHaveAttribute("aria-valuenow", "420");
    expect(separator).toHaveAttribute("aria-valuemin", "340");
    expect(separator).toHaveAttribute("aria-valuemax", "900");

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(onWidthChange).toHaveBeenLastCalledWith(444);
    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    expect(onWidthChange).toHaveBeenLastCalledWith(396);
    fireEvent.keyDown(separator, { key: "Home" });
    expect(onWidthChange).toHaveBeenLastCalledWith(340);
    fireEvent.keyDown(separator, { key: "End" });
    expect(onWidthChange).toHaveBeenLastCalledWith(900);
  });
});
