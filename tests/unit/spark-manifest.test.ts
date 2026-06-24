import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sparkSkillById, sparkSkillCatalog } from "@/lib/sparks/catalog";
import {
  codePlaygroundLanguages,
  sparkManifest,
  sparkManifestById,
  sparkTypes,
} from "@/lib/sparks/manifest";

const expectedSparkTypes = [
  "scene",
  "quiz",
  "flash_card",
  "desmos_graph",
  "code_playground",
  "web_playground",
];

describe("spark manifest", () => {
  it("covers every supported spark type once", () => {
    expect(new Set(sparkTypes)).toEqual(new Set(expectedSparkTypes));
    expect(sparkTypes).toHaveLength(expectedSparkTypes.length);
    expect(sparkManifest).toHaveLength(expectedSparkTypes.length);
    expect(new Set(sparkManifest.map((spark) => spark.id)).size).toBe(
      sparkManifest.length,
    );
  });

  it("defines prompt, worker, renderer, and placement metadata for each spark", () => {
    for (const spark of sparkManifest) {
      expect(spark.label).toBeTruthy();
      expect(spark.description).toBeTruthy();
      expect(spark.whenToUse).toBeTruthy();
      expect(spark.promptPath).toMatch(/^sparks\/skills\/.+\.md$/);
      expect(spark.artifactKind).toMatch(/^spark_/);
      expect(["html", "payload"]).toContain(spark.workerShape);
      expect(["inline", "side_panel"]).toContain(spark.defaultPlacement);
      expect(spark.rendererKey).toBeTruthy();
      expect(
        existsSync(path.join(process.cwd(), "prompts", spark.promptPath)),
      ).toBe(true);
    }
  });

  it("drives the runtime Spark catalog from the same manifest values", () => {
    expect(sparkSkillCatalog.map((spark) => spark.id)).toEqual(
      sparkManifest.map((spark) => spark.id),
    );

    for (const spark of sparkManifest) {
      expect(sparkSkillById[spark.id].name).toBe(spark.label);
      expect(sparkSkillById[spark.id].description).toBe(spark.description);
      expect(sparkManifestById[spark.id]).toBe(spark);
    }
  });

  it("allows future code playground language contracts without claiming execution", () => {
    expect(codePlaygroundLanguages).toEqual([
      "python",
      "javascript",
      "typescript",
    ]);
  });
});
