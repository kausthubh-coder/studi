import { describe, expect, it } from "vitest";
import { embeddedPrompts } from "../../lib/prompts/generated";

describe("Studi system prompt", () => {
  it("keeps Code Spark challenges Socratic after tool success", () => {
    const prompt = embeddedPrompts["agents/studi.md"] ?? "";

    expect(prompt).toContain(
      "do not reveal the solution, replacement code, or expected answer",
    );
    expect(prompt).toContain(
      "For Code Spark challenges and tests, keep create_spark title, summary, and context free of solution code or expected output",
    );
    expect(prompt).toContain(
      "Ask one short prediction or guiding question and point the learner to Run or Test",
    );
  });
});
