import type { SparkType } from "./contracts";
import { sparkSceneSkill } from "./skills/scene";

export type SparkSkillDefinition = {
  id: SparkType;
  name: string;
  description: string;
  whenToUse: string;
  instructions: string;
};

export const sparkSkillCatalog: readonly SparkSkillDefinition[] = [
  {
    id: "scene",
    ...sparkSceneSkill,
  },
];

export const sparkSkillById: Readonly<Record<SparkType, SparkSkillDefinition>> =
  {
    scene: sparkSkillCatalog[0],
  };

export function sparkCatalogPromptBlock(): string {
  return sparkSkillCatalog
    .map(
      (spark) =>
        `- ${spark.id}: ${spark.name} - ${spark.description} Use when: ${spark.whenToUse}`,
    )
    .join("\n");
}
