import { loadPrompt } from "../prompts";
import { sparkTypes, type SparkType } from "./contracts";
import { sparkSkillMetadataById } from "./skills/generated";

export type SparkSkillDefinition = {
  id: SparkType;
  name: string;
  description: string;
  whenToUse: string;
  instructions: string;
};

function buildSkillDefinition(id: SparkType): SparkSkillDefinition {
  const metadata = sparkSkillMetadataById[id];
  return {
    id,
    name: metadata.name,
    description: metadata.description,
    whenToUse: metadata.whenToUse,
    instructions: loadPrompt(metadata.promptPath),
  };
}

export const sparkSkillCatalog: readonly SparkSkillDefinition[] =
  sparkTypes.map((id) => buildSkillDefinition(id));

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
