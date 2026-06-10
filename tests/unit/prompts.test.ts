import { describe, expect, it } from "vitest";
import { loadPrompt, renderPrompt } from "@/lib/prompts";

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
});
