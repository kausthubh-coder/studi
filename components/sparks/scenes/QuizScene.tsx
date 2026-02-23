"use client";

import { useMemo, useState } from "react";
import type { QuizSparkPayload } from "@/lib/sparks/contracts";

type QuizSceneProps = {
  payload: QuizSparkPayload;
  isExpanded?: boolean;
};

const fallbackQuizQuestions: QuizSparkPayload["questions"] = [
  {
    id: "fallback_q1",
    prompt: "No quiz questions available yet.",
    choices: [{ id: "fallback_q1_c1", text: "OK" }],
    correctChoiceId: "fallback_q1_c1",
  },
];

export default function QuizScene({ payload }: QuizSceneProps) {
  const questions =
    payload.questions.length > 0 ? payload.questions : fallbackQuizQuestions;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Record<string, true>>({});
  const [showResults, setShowResults] = useState(false);

  const question = questions[currentIndex];

  const score = useMemo(
    () =>
      questions.reduce((total, entry) => {
        if (!checked[entry.id]) {
          return total;
        }
        return answers[entry.id] === entry.correctChoiceId ? total + 1 : total;
      }, 0),
    [answers, checked, questions],
  );

  const completedCount = useMemo(
    () => questions.filter((entry) => checked[entry.id]).length,
    [checked, questions],
  );

  const isAnswered = Boolean(answers[question.id]);
  const isChecked = Boolean(checked[question.id]);
  const isCorrect = answers[question.id] === question.correctChoiceId;
  const isLast = currentIndex === questions.length - 1;

  return (
    <div className="spark-scene-content grid gap-3 bg-bg-alt p-3">
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-xs text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Question {currentIndex + 1}/{questions.length}
        </p>
        <p
          className="text-xs text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Score: {score}
        </p>
      </div>

      {payload.questions.length === 0 ? (
        <p
          className="text-sm text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          No quiz questions available.
        </p>
      ) : payload.instructions ? (
        <p
          className="text-sm text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          {payload.instructions}
        </p>
      ) : null}

      {(showResults || completedCount === questions.length) && (
        <div className="rounded-xl border border-border-warm bg-bg-card px-3 py-2">
          <p
            className="text-sm font-semibold text-fg"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Quiz complete
          </p>
          <p
            className="mt-1 text-xs text-fg-muted"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            You scored {score} out of {questions.length}.
          </p>
        </div>
      )}

      <fieldset
        className="rounded-xl border border-border-faint bg-bg-card p-3"
        disabled={isChecked}
      >
        <legend
          className="px-1 text-[15px] text-fg"
          style={{ fontFamily: "var(--font-dm-serif)" }}
        >
          {question.prompt}
        </legend>
        <div className="mt-2 grid gap-2">
          {question.choices.map((choice) => {
            const id = `${question.id}-${choice.id}`;
            const selected = answers[question.id] === choice.id;
            return (
              <label
                key={choice.id}
                className="flex items-start gap-2 rounded-lg border border-border-faint px-2 py-2 text-sm text-fg"
                style={{ fontFamily: "var(--font-jakarta)" }}
                htmlFor={id}
              >
                <input
                  id={id}
                  type="radio"
                  name={question.id}
                  value={choice.id}
                  checked={selected}
                  className="mt-0.5 accent-[var(--accent2)]"
                  onChange={() => {
                    setAnswers((previous) => ({
                      ...previous,
                      [question.id]: choice.id,
                    }));
                  }}
                />
                <span>{choice.text}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {isChecked && (
        <div
          className="rounded-xl border px-3 py-2"
          style={{
            borderColor: isCorrect
              ? "color-mix(in srgb, var(--accent2) 30%, var(--border) 70%)"
              : "color-mix(in srgb, var(--accent) 28%, var(--border) 72%)",
            background: isCorrect
              ? "color-mix(in srgb, var(--accent2-dim) 40%, #fff 60%)"
              : "color-mix(in srgb, var(--accent-dim) 38%, #fff 62%)",
          }}
        >
          <p
            className="text-sm text-fg"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            {isCorrect ? "Correct." : "Not quite."}
          </p>
          {question.explanation ? (
            <p
              className="mt-1 text-xs text-fg-muted"
              style={{ fontFamily: "var(--font-jakarta)" }}
            >
              {question.explanation}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-semibold text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
          disabled={currentIndex === 0}
          onClick={() => {
            setCurrentIndex((value) => Math.max(0, value - 1));
          }}
        >
          Back
        </button>

        {!isChecked ? (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold text-white"
            style={{
              fontFamily: "var(--font-jakarta)",
              background: "var(--accent2)",
              borderColor:
                "color-mix(in srgb, var(--accent2) 45%, var(--border) 55%)",
            }}
            disabled={!isAnswered}
            onClick={() => {
              setChecked((previous) => ({ ...previous, [question.id]: true }));
              if (isLast) {
                setShowResults(true);
              }
            }}
          >
            Check answer
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-semibold text-white"
            style={{
              fontFamily: "var(--font-jakarta)",
              background: "var(--accent2)",
              borderColor:
                "color-mix(in srgb, var(--accent2) 45%, var(--border) 55%)",
            }}
            onClick={() => {
              if (isLast) {
                setShowResults(true);
                return;
              }
              setCurrentIndex((value) =>
                Math.min(questions.length - 1, value + 1),
              );
            }}
          >
            {isLast ? "See results" : "Next"}
          </button>
        )}

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full border border-border bg-bg-card px-3 py-1 text-xs font-semibold text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)" }}
          onClick={() => {
            setCurrentIndex(0);
            setAnswers({});
            setChecked({});
            setShowResults(false);
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
