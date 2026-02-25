"use client";

import { memo, useMemo, useState } from "react";
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

function getResultEmoji(ratio: number): string {
  if (ratio >= 1) return "\u{1F31F}";
  if (ratio >= 0.8) return "\u{1F389}";
  if (ratio >= 0.5) return "\u{1F4AA}";
  return "\u{1F4DA}";
}

function getResultMessage(ratio: number): string {
  if (ratio >= 1) return "Perfect score!";
  if (ratio >= 0.8) return "Great work!";
  if (ratio >= 0.5) return "Good effort!";
  return "Keep studying!";
}

const QuizScene = memo(function QuizScene({ payload }: QuizSceneProps) {
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
        if (!checked[entry.id]) return total;
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
  const allDone = showResults || completedCount === questions.length;
  const ratio = questions.length > 0 ? score / questions.length : 0;

  return (
    <div className="quiz-scene spark-scene-content">
      {/* Header: progress + score */}
      <div className="quiz-scene-header">
        <p className="quiz-scene-progress">
          Question {currentIndex + 1}/{questions.length}
        </p>
        <p className="quiz-scene-score">
          Score: {score}/{completedCount > 0 ? completedCount : questions.length}
        </p>
      </div>

      {/* Progress dots */}
      <div className="quiz-progress-dots">
        {questions.map((q, i) => {
          let state: string;
          if (i === currentIndex) state = "current";
          else if (checked[q.id] && answers[q.id] === q.correctChoiceId) state = "correct";
          else if (checked[q.id]) state = "incorrect";
          else state = "pending";
          return (
            <button
              type="button"
              key={q.id}
              className="quiz-progress-dot"
              data-state={state}
              onClick={() => setCurrentIndex(i)}
              aria-label={`Go to question ${i + 1}`}
            />
          );
        })}
      </div>

      {/* Instructions */}
      {payload.questions.length === 0 ? (
        <p className="quiz-scene-instructions">No quiz questions available.</p>
      ) : payload.instructions ? (
        <p className="quiz-scene-instructions">{payload.instructions}</p>
      ) : null}

      {/* Results banner */}
      {allDone && (
        <div className="quiz-results">
          <p className="quiz-results-emoji">{getResultEmoji(ratio)}</p>
          <p className="quiz-results-title">{getResultMessage(ratio)}</p>
          <p className="quiz-results-fraction">
            {score} out of {questions.length} correct
          </p>
          <div className="quiz-results-bar-track">
            <div
              className="quiz-results-bar-fill"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Question card */}
      <fieldset className="quiz-question" data-checked={isChecked} disabled={isChecked}>
        <legend className="quiz-question-prompt">{question.prompt}</legend>
        <div className="quiz-choice-list">
          {question.choices.map((choice) => {
            const id = `${question.id}-${choice.id}`;
            const selected = answers[question.id] === choice.id;
            const isCorrectChoice = choice.id === question.correctChoiceId;
            let result: string | undefined;
            if (isChecked && selected) result = isCorrect ? "correct" : "incorrect";
            else if (isChecked && isCorrectChoice) result = "correct";

            return (
              <label
                key={choice.id}
                className="quiz-choice"
                data-selected={selected || undefined}
                data-result={result}
                data-disabled={isChecked || undefined}
                htmlFor={id}
              >
                <input
                  id={id}
                  type="radio"
                  name={question.id}
                  value={choice.id}
                  checked={selected}
                  onChange={() => {
                    setAnswers((prev) => ({ ...prev, [question.id]: choice.id }));
                  }}
                />
                <span>{choice.text}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Feedback */}
      {isChecked && (
        <div className="quiz-feedback" data-correct={isCorrect}>
          <p className="quiz-feedback-label" data-correct={isCorrect}>
            {isCorrect ? "Correct!" : "Not quite."}
          </p>
          {question.explanation && (
            <p className="quiz-feedback-explanation">{question.explanation}</p>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="quiz-actions">
        <button
          type="button"
          className="quiz-btn quiz-btn-secondary"
          disabled={currentIndex === 0}
          onClick={() => setCurrentIndex((v) => Math.max(0, v - 1))}
        >
          Back
        </button>

        {!isChecked ? (
          <button
            type="button"
            className="quiz-btn quiz-btn-primary"
            disabled={!isAnswered}
            onClick={() => {
              setChecked((prev) => ({ ...prev, [question.id]: true }));
              if (isLast) setShowResults(true);
            }}
          >
            Check answer
          </button>
        ) : (
          <button
            type="button"
            className="quiz-btn quiz-btn-primary"
            onClick={() => {
              if (isLast) {
                setShowResults(true);
                return;
              }
              setCurrentIndex((v) => Math.min(questions.length - 1, v + 1));
            }}
          >
            {isLast ? "See results" : "Next"}
          </button>
        )}

        <button
          type="button"
          className="quiz-btn quiz-btn-secondary"
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
});

export default QuizScene;
