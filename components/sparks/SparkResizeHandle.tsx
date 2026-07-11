"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type TouchEvent as ReactTouchEvent,
} from "react";

const DEFAULT_MIN_CHAT_WIDTH = 340;
const DEFAULT_MIN_SPARK_WIDTH = 420;
const RESIZE_HANDLE_WIDTH = 6;

type SplitBounds = {
  minWidth: number;
  maxWidth: number;
};

function getSplitBounds(
  containerWidth: number,
  minChatWidth: number,
  minSparkWidth: number,
): SplitBounds {
  const maxWidth = Math.max(
    0,
    Math.floor(containerWidth) - minSparkWidth - RESIZE_HANDLE_WIDTH,
  );

  return {
    minWidth: Math.min(minChatWidth, maxWidth),
    maxWidth,
  };
}

function clampWidth(width: number, { minWidth, maxWidth }: SplitBounds) {
  return Math.min(Math.max(width, minWidth), maxWidth);
}

export function SparkResizeHandle({
  containerRef,
  width,
  onWidthChange,
  minChatWidth = DEFAULT_MIN_CHAT_WIDTH,
  minSparkWidth = DEFAULT_MIN_SPARK_WIDTH,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  width: number;
  onWidthChange: (width: number) => void;
  minChatWidth?: number;
  minSparkWidth?: number;
}) {
  const [bounds, setBounds] = useState<SplitBounds>(() => ({
    minWidth: Math.min(minChatWidth, width),
    maxWidth: Math.max(minChatWidth, width),
  }));
  const widthRef = useRef(width);
  const stopDragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  const commitWidth = useCallback(
    (nextWidth: number) => {
      widthRef.current = nextWidth;
      onWidthChange(nextWidth);
    },
    [onWidthChange],
  );

  const measureBounds = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const nextBounds = getSplitBounds(
      container.getBoundingClientRect().width,
      minChatWidth,
      minSparkWidth,
    );
    setBounds((current) =>
      current.minWidth === nextBounds.minWidth &&
      current.maxWidth === nextBounds.maxWidth
        ? current
        : nextBounds,
    );

    const nextWidth = clampWidth(widthRef.current, nextBounds);
    if (nextWidth !== widthRef.current) {
      commitWidth(nextWidth);
    }
  }, [commitWidth, containerRef, minChatWidth, minSparkWidth]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    measureBounds();
    const observer = new ResizeObserver(measureBounds);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef, measureBounds]);

  const stopActiveDrag = useCallback(() => {
    stopDragRef.current?.();
    stopDragRef.current = null;
  }, []);

  useEffect(() => stopActiveDrag, [stopActiveDrag]);

  const resizeFromClientX = useCallback(
    (clientX: number) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const nextBounds = getSplitBounds(
        rect.width,
        minChatWidth,
        minSparkWidth,
      );
      setBounds(nextBounds);
      commitWidth(clampWidth(clientX - rect.left, nextBounds));
    },
    [commitWidth, containerRef, minChatWidth, minSparkWidth],
  );

  const onMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    stopActiveDrag();

    const onMove = (moveEvent: MouseEvent) => {
      resizeFromClientX(moveEvent.clientX);
    };
    const stop = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
      if (stopDragRef.current === stop) stopDragRef.current = null;
    };

    stopDragRef.current = stop;
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
  };

  const onTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    event.preventDefault();
    stopActiveDrag();

    const onMove = (moveEvent: TouchEvent) => {
      const touch = moveEvent.touches[0];
      if (!touch) return;
      moveEvent.preventDefault();
      resizeFromClientX(touch.clientX);
    };
    const stop = () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", stop);
      window.removeEventListener("touchcancel", stop);
      if (stopDragRef.current === stop) stopDragRef.current = null;
    };

    stopDragRef.current = stop;
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", stop);
    window.addEventListener("touchcancel", stop);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") nextWidth = width - 24;
    if (event.key === "ArrowRight") nextWidth = width + 24;
    if (event.key === "Home") nextWidth = bounds.minWidth;
    if (event.key === "End") nextWidth = bounds.maxWidth;
    if (nextWidth === null) return;

    event.preventDefault();
    commitWidth(clampWidth(nextWidth, bounds));
  };

  return (
    <div
      className="spark-resize-handle"
      role="separator"
      aria-label="Resize chat and Spark panels"
      aria-orientation="vertical"
      aria-valuemin={bounds.minWidth}
      aria-valuemax={bounds.maxWidth}
      aria-valuenow={clampWidth(width, bounds)}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      title="Drag or use arrow keys to resize"
    />
  );
}
