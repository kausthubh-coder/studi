import { loadPrompt } from "../prompts";
import { sparkManifest, sparkManifestById, type SparkType } from "./manifest";

export type SparkSkillDefinition = {
  id: SparkType;
  name: string;
  description: string;
  whenToUse: string;
  instructions: string;
};

function buildSkillDefinition(id: SparkType): SparkSkillDefinition {
  const metadata = sparkManifestById[id];
  return {
    id,
    name: metadata.label,
    description: metadata.description,
    whenToUse: metadata.whenToUse,
    instructions: loadPrompt(metadata.promptPath),
  };
}

export const sparkSkillCatalog: readonly SparkSkillDefinition[] =
  sparkManifest.map((spark) => buildSkillDefinition(spark.id));

export const sparkSkillById: Readonly<Record<SparkType, SparkSkillDefinition>> =
  Object.freeze(
    Object.fromEntries(
      sparkSkillCatalog.map((skill) => [skill.id, skill] as const),
    ) as Record<SparkType, SparkSkillDefinition>,
  );

export function sparkCatalogPromptBlock(): string {
  return sparkSkillCatalog
    .map(
      (spark) =>
        `- ${spark.id}: ${spark.name} - ${spark.description} Use when: ${spark.whenToUse}`,
    )
    .join("\n");
}
