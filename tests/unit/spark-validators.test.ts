import { describe, expect, it } from "vitest";
import {
  normalizeSceneHtmlWithTemplate,
  validateDesmosPayload,
  validateFlashCardPayload,
  validateQuizPayload,
  validateSceneHtml,
} from "@/convex/sparks/validators";

describe("spark validators", () => {
  it("normalizes scene html into a full document with the allowed tailwind script", () => {
    const normalized = normalizeSceneHtmlWithTemplate("<div>Hello</div>");

    expect(normalized.toLowerCase()).toContain("<!doctype html>");
    expect(normalized).toContain("<html");
    expect(normalized).toContain("<head");
    expect(normalized).toContain("<body");
    expect(normalized).toContain(
      "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4",
    );
  });

  it("accepts a valid normalized scene and rejects disallowed external scripts", () => {
    const valid = validateSceneHtml(
      normalizeSceneHtmlWithTemplate("<div>Graph</div>"),
    );
    expect(valid.ok).toBe(true);

    const invalid = validateSceneHtml(
      '<!doctype html><html><head><script src="https://evil.example.com/x.js"></script></head><body></body></html>',
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(" ")).toMatch(/External script/i);
  });

  it("requires desmos viewport bounds to be ordered", () => {
    const ok = validateDesmosPayload({
      expressions: [{ id: "eq1", latex: "y=x^2" }],
      viewport: { left: -10, right: 10, bottom: -10, top: 10 },
    });
    expect(ok.ok).toBe(true);

    const bad = validateDesmosPayload({
      expressions: [{ id: "eq1", latex: "y=x^2" }],
      viewport: { left: 10, right: -10, bottom: 10, top: -10 },
    });
    expect(bad.ok).toBe(false);
  });

  it("validates quiz correctness and minimum question count", () => {
    const base = {
      instructions: "Pick the best answer.",
      questions: Array.from({ length: 3 }, (_unused, index) => ({
        id: `q${index}`,
        prompt: `Question ${index}?`,
        choices: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
        ],
        correctChoiceId: "a",
      })),
    };
    expect(validateQuizPayload(base).ok).toBe(true);

    const badCorrect = {
      ...base,
      questions: base.questions.map((q) => ({
        ...q,
        correctChoiceId: "missing",
      })),
    };
    expect(validateQuizPayload(badCorrect).ok).toBe(false);
  });

  it("requires at least four flash cards with front and back", () => {
    const cards = Array.from({ length: 4 }, (_unused, index) => ({
      id: `c${index}`,
      front: `Front ${index}`,
      back: `Back ${index}`,
    }));
    expect(validateFlashCardPayload({ cards }).ok).toBe(true);

    expect(validateFlashCardPayload({ cards: cards.slice(0, 2) }).ok).toBe(
      false,
    );
  });
});
