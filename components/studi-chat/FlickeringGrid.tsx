"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

type FlickeringGridProps = {
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  color?: string;
  width?: number;
  height?: number;
  className?: string;
  maxOpacity?: number;
};

type GridParams = {
  cols: number;
  rows: number;
  dpr: number;
  squares: Float32Array;
};

export function FlickeringGrid({
  squareSize = 4,
  gridGap = 6,
  flickerChance = 0.3,
  color = "rgb(194, 113, 74)",
  width,
  height,
  className,
  maxOpacity = 0.3,
}: FlickeringGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInViewRef = useRef(false);

  const rgbaPrefix = useMemo(() => {
    if (typeof window === "undefined") {
      return "rgba(194, 113, 74,";
    }

    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const probeCtx = probe.getContext("2d");
    if (!probeCtx) {
      return "rgba(194, 113, 74,";
    }

    probeCtx.clearRect(0, 0, 1, 1);
    probeCtx.fillStyle = color;
    probeCtx.fillRect(0, 0, 1, 1);
    const [r, g, b] = Array.from(probeCtx.getImageData(0, 0, 1, 1).data);
    return `rgba(${r}, ${g}, ${b},`;
  }, [color]);

  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement, w: number, h: number): GridParams => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const cols = Math.max(1, Math.floor(w / (squareSize + gridGap)));
      const rows = Math.max(1, Math.floor(h / (squareSize + gridGap)));
      const squares = new Float32Array(cols * rows);

      for (let i = 0; i < squares.length; i += 1) {
        squares[i] = Math.random() * maxOpacity;
      }

      return { cols, rows, dpr, squares };
    },
    [gridGap, maxOpacity, squareSize],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let frameId = 0;
    let disposed = false;
    let lastTime = 0;

    let grid = setupCanvas(
      canvas,
      width ?? container.clientWidth,
      height ?? container.clientHeight,
    );

    const updateSquares = (deltaTime: number) => {
      for (let i = 0; i < grid.squares.length; i += 1) {
        if (Math.random() < flickerChance * deltaTime) {
          grid.squares[i] = Math.random() * maxOpacity;
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let col = 0; col < grid.cols; col += 1) {
        for (let row = 0; row < grid.rows; row += 1) {
          const opacity = grid.squares[col * grid.rows + row];
          ctx.fillStyle = `${rgbaPrefix}${opacity})`;
          ctx.fillRect(
            col * (squareSize + gridGap) * grid.dpr,
            row * (squareSize + gridGap) * grid.dpr,
            squareSize * grid.dpr,
            squareSize * grid.dpr,
          );
        }
      }
    };

    const updateSize = () => {
      const nextWidth = width ?? container.clientWidth;
      const nextHeight = height ?? container.clientHeight;
      grid = setupCanvas(canvas, nextWidth, nextHeight);
      draw();
    };

    const animate = (time: number) => {
      if (disposed) {
        return;
      }

      if (lastTime === 0) {
        lastTime = time;
      }
      const deltaTime = Math.min((time - lastTime) / 1000, 0.12);
      lastTime = time;

      if (isInViewRef.current) {
        updateSquares(deltaTime);
        draw();
      }

      frameId = window.requestAnimationFrame(animate);
    };

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        isInViewRef.current = entries[0]?.isIntersecting ?? false;
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(container);

    frameId = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [
    flickerChance,
    gridGap,
    height,
    maxOpacity,
    rgbaPrefix,
    setupCanvas,
    squareSize,
    width,
  ]);

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} className="pointer-events-none h-full w-full" />
    </div>
  );
}
