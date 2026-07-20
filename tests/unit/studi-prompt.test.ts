import { describe, expect, it } from "vitest";
import { embeddedPrompts } from "../../lib/prompts/generated";

describe("Studi system prompt", () => {
  const prompt = () => embeddedPrompts["agents/studi.md"] ?? "";

  it("keeps Code Spark challenges Socratic after tool success", () => {
    expect(prompt()).toContain(
      "do not reveal the solution, replacement code, or expected answer",
    );
    expect(prompt()).toContain(
      "For Code Spark and Test Spark, keep create_spark title, summary, and context free of solution code or expected output",
    );
    expect(prompt()).toContain(
      "Ask one short prediction or guiding question and point the learner to Run or Test",
    );
  });

  it("teaches through guided discovery instead of lecture-first delivery", () => {
    expect(prompt()).toMatch(/one question/i);
    expect(prompt()).toMatch(/invent|discover|figure out/i);
    expect(prompt()).toMatch(/definition|lecture|formula first/i);
    expect(prompt()).toMatch(/aha/i);
  });

  it("defines when to use and avoid Sparks in the teaching arc", () => {
    expect(prompt()).toMatch(/before.*naming|before you name/i);
    expect(prompt()).toMatch(/quiz|flash_card/i);
    expect(prompt()).toMatch(/after.*(aha|understand|got it)/i);
  });
});
