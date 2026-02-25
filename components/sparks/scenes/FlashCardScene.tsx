"use client";

import { memo, useMemo, useRef, useState } from "react";
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

const FlashCardScene = memo(function FlashCardScene({
  payload,
}: FlashCardSceneProps) {
  const cards =
    payload.cards.length > 0
      ? payload.cards
      : [{ id: "fallback_card", front: "No cards", back: "No cards" }];

  const [order, setOrder] = useState<number[]>(cards.map((_, i) => i));
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  /* Track whether user has ever flipped — hides the tap hint after first flip */
  const hasFlippedOnce = useRef(false);
  const [showHint, setShowHint] = useState(true);

  const card = cards[order[current]];
  const progressLabel = useMemo(
    () => `${current + 1} / ${cards.length}`,
    [cards.length, current],
  );

  function goTo(index: number) {
    setCurrent(index);
    setFlipped(false);
  }

  function handleFlip() {
    setFlipped((v) => !v);
    if (!hasFlippedOnce.current) {
      hasFlippedOnce.current = true;
      setShowHint(false);
    }
  }

  return (
    <div className="flash-card-scene spark-scene-content">
      {/* Header */}
      <div className="flash-card-head">
        <p className="flash-card-progress">Card {progressLabel}</p>
        <button
          type="button"
          className="flash-btn flash-btn-secondary"
          onClick={() => {
            setOrder(shuffle(cards.map((_, i) => i)));
            setCurrent(0);
            setFlipped(false);
          }}
        >
          Shuffle
        </button>
      </div>

      {/* Dot navigation */}
      {cards.length > 1 && (
        <div className="flash-card-dots">
          {cards.map((_, i) => (
            <button
              type="button"
              key={order[i]}
              className="flash-card-dot"
              data-active={i === current || undefined}
              onClick={() => goTo(i)}
              aria-label={`Go to card ${i + 1}`}
            />
          ))}
        </div>
      )}

      {/* Instructions */}
      {payload.cards.length === 0 ? (
        <p className="flash-card-instructions">No flash cards available.</p>
      ) : payload.instructions ? (
        <p className="flash-card-instructions">{payload.instructions}</p>
      ) : null}

      {/* 3D Flip Card */}
      <div className="flash-card-flip-container">
        <div
          className="flash-card-flip-inner"
          data-flipped={flipped || undefined}
          onClick={handleFlip}
        >
          {/* Front face */}
          <div className="flash-card-face">
            <span className="flash-card-face-label">Front</span>
            <p>{card.front}</p>
            {showHint && (
              <span className="flash-card-tap-hint">tap to flip</span>
            )}
          </div>

          {/* Back face */}
          <div className="flash-card-face flash-card-face-back">
            <span className="flash-card-face-label">Back</span>
            <p>{card.back}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flash-card-actions">
        <button
          type="button"
          className="flash-btn flash-btn-secondary"
          disabled={current === 0}
          onClick={() => goTo(Math.max(0, current - 1))}
        >
          Previous
        </button>
        <button
          type="button"
          className="flash-btn flash-btn-primary"
          onClick={handleFlip}
        >
          {flipped ? "Show front" : "Flip"}
        </button>
        <button
          type="button"
          className="flash-btn flash-btn-secondary"
          disabled={current >= cards.length - 1}
          onClick={() => goTo(Math.min(cards.length - 1, current + 1))}
        >
          Next
        </button>
      </div>
    </div>
  );
});

export default FlashCardScene;
