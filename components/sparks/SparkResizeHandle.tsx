import type {
  KeyboardEvent,
  MouseEventHandler,
  TouchEventHandler,
} from "react";

export function SparkResizeHandle({
  width,
  minWidth,
  maxWidth,
  onWidthChange,
  onMouseDown,
  onTouchStart,
}: {
  width: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (width: number) => void;
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onTouchStart: TouchEventHandler<HTMLDivElement>;
}) {
  const clamp = (value: number) =>
    Math.min(Math.max(value, minWidth), maxWidth);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") nextWidth = width - 24;
    if (event.key === "ArrowRight") nextWidth = width + 24;
    if (event.key === "Home") nextWidth = minWidth;
    if (event.key === "End") nextWidth = maxWidth;
    if (nextWidth === null) return;

    event.preventDefault();
    onWidthChange(clamp(nextWidth));
  };

  return (
    <div
      className="spark-resize-handle"
      role="separator"
      aria-label="Resize chat and Spark panels"
      aria-orientation="vertical"
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-valuenow={clamp(width)}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      title="Drag or use arrow keys to resize"
    />
  );
}
