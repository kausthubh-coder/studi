"use client";

import { useMemo, useState } from "react";
import type { FlashCardSparkPayload } from "@/lib/sparks/contracts";

type FlashCardSceneProps = {
  payload: FlashCardSparkPayload;
  isExpanded?: boolean;
};

function shuffle(values: number[]): number[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export default function FlashCardScene({ payload }: FlashCardSceneProps) {
  const cards =
    payload.cards.length > 0
      ? payload.cards
      : [{ id: "fallback_card", front: "No cards", back: "No cards" }];

  const [order, setOrder] = useState<number[]>(cards.map((_, index) => index));
  const [current, setCurrent] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const card = cards[order[current]];
  const progressLabel = useMemo(
    () => `${current + 1}/${cards.length}`,
    [cards.length, current],
  );

  return (
    <div className="spark-scene-content grid gap-3 bg-bg-alt p-3">
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-xs text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Card {progressLabel}
        </p>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-semibold text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
          onClick={() => {
            setOrder(shuffle(cards.map((_, index) => index)));
            setCurrent(0);
            setRevealed(false);
          }}
        >
          Shuffle
        </button>
      </div>

      {payload.cards.length === 0 ? (
        <p
          className="text-sm text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          No flash cards available.
        </p>
      ) : payload.instructions ? (
        <p
          className="text-sm text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          {payload.instructions}
        </p>
      ) : null}

      <button
        type="button"
        className="min-h-44 rounded-xl border bg-bg-card px-4 py-3 text-left shadow-sm"
        style={{
          borderColor:
            "color-mix(in srgb, var(--accent5) 20%, var(--border) 80%)",
          background: revealed
            ? "color-mix(in srgb, var(--accent5-dim) 22%, #fff 78%)"
            : "var(--bg-card)",
        }}
        onClick={() => {
          setRevealed((value) => !value);
        }}
      >
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{
            fontFamily: "var(--font-jakarta)",
            background: "var(--accent5-dim)",
            color: "color-mix(in srgb, var(--accent5) 74%, #3d1a2b 26%)",
          }}
        >
          {revealed ? "Back" : "Front"}
        </span>
        <p
          className="mt-3 text-base text-fg"
          style={{ fontFamily: "var(--font-dm-serif)", lineHeight: 1.45 }}
        >
          {revealed ? card.back : card.front}
        </p>
      </button>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-semibold text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
          disabled={current === 0}
          onClick={() => {
            setCurrent((value) => Math.max(0, value - 1));
            setRevealed(false);
          }}
        >
          Previous
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold text-white"
          style={{
            fontFamily: "var(--font-jakarta)",
            background: "var(--accent5)",
            borderColor:
              "color-mix(in srgb, var(--accent5) 48%, var(--border) 52%)",
          }}
          onClick={() => {
            setRevealed((value) => !value);
          }}
        >
          {revealed ? "Show front" : "Flip"}
        </button>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-semibold text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
          disabled={current >= cards.length - 1}
          onClick={() => {
            setCurrent((value) => Math.min(cards.length - 1, value + 1));
            setRevealed(false);
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
