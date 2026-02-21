import type { SparkType } from "./contracts";
import { sparkCodePlaygroundSkill } from "./skills/codePlayground";
import { sparkDesmosGraphSkill } from "./skills/desmosGraph";
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
  {
    id: "desmos_graph",
    ...sparkDesmosGraphSkill,
  },
  {
    id: "code_playground",
    ...sparkCodePlaygroundSkill,
  },
];

export const sparkSkillById: Readonly<Record<SparkType, SparkSkillDefinition>> =
  {
    scene: sparkSkillCatalog[0],
    desmos_graph: sparkSkillCatalog[1],
    code_playground: sparkSkillCatalog[2],
  };

export function sparkCatalogPromptBlock(): string {
  return sparkSkillCatalog
    .map(
      (spark) =>
        `- ${spark.id}: ${spark.name} - ${spark.description} Use when: ${spark.whenToUse}`,
    )
    .join("\n");
}
