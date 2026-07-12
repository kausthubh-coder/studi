import { readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const componentsRoot = join(projectRoot, "components");

const excludedInfrastructure = new Set(["components/ConvexClientProvider.tsx"]);

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

describe("Storybook component coverage", () => {
  it("keeps a colocated story for every meaningful visual component", () => {
    const components = listFiles(componentsRoot)
      .filter((path) => extname(path) === ".tsx")
      .filter((path) => !path.endsWith(".stories.tsx"))
      .filter((path) => !path.endsWith(".vitest.tsx"))
      .map((path) => relative(projectRoot, path))
      .filter((path) => !excludedInfrastructure.has(path))
      .sort();

    const stories = new Set(
      listFiles(componentsRoot)
        .filter((path) => path.endsWith(".stories.tsx"))
        .map((path) => relative(projectRoot, path)),
    );

    const missingStories = components.filter((component) => {
      const expectedStory = component.replace(/\.tsx$/, ".stories.tsx");
      return !stories.has(expectedStory);
    });

    expect(missingStories).toEqual([]);
  });
});
