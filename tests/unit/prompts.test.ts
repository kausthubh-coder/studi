import { describe, expect, it } from "vitest";
import { loadPrompt, renderPrompt } from "@/lib/prompts";
import { sparkCatalogPromptBlock } from "@/lib/sparks/catalog";

describe("prompt loading", () => {
  it("loads embedded prompts without surrounding whitespace", () => {
    const prompt = loadPrompt("agents/studi.md");

    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toBe(prompt.trim());
  });

  it("renders provided template variables and removes missing variables", () => {
    const rendered = renderPrompt("agents/studi.md", {
      sparkCatalogPromptBlock: "SPARK CATALOG SENTINEL",
    });

    expect(rendered).toContain("SPARK CATALOG SENTINEL");
    expect(rendered).not.toMatch(/{{\s*sparkCatalogPromptBlock\s*}}/);
  });

  it("does not advertise removed playground sparks", () => {
    const rendered = renderPrompt("agents/studi.md", {
      sparkCatalogPromptBlock: sparkCatalogPromptBlock(),
    });

    expect(rendered).not.toMatch(/code_playground|web_playground/i);
    expect(rendered).not.toMatch(/Code Playground|Web Playground/i);
    expect(sparkCatalogPromptBlock()).not.toMatch(
      /code_playground|web_playground/i,
    );
  });
});
