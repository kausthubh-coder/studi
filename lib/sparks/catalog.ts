import type { SparkType } from "./contracts";
import { sparkCodePlaygroundSkill } from "./skills/codePlayground";
import { sparkDesmosGraphSkill } from "./skills/desmosGraph";
import { sparkFlashCardSkill } from "./skills/flashCard";
import { sparkQuizSkill } from "./skills/quiz";
import { sparkSceneSkill } from "./skills/scene";
import { sparkWebPlaygroundSkill } from "./skills/webPlayground";

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
    id: "quiz",
    ...sparkQuizSkill,
  },
  {
    id: "flash_card",
    ...sparkFlashCardSkill,
  },
  {
    id: "desmos_graph",
    ...sparkDesmosGraphSkill,
  },
  {
    id: "code_playground",
    ...sparkCodePlaygroundSkill,
  },
  {
    id: "web_playground",
    ...sparkWebPlaygroundSkill,
  },
];

export const sparkSkillById: Readonly<Record<SparkType, SparkSkillDefinition>> =
  {
    scene: sparkSkillCatalog[0],
    quiz: sparkSkillCatalog[1],
    flash_card: sparkSkillCatalog[2],
    desmos_graph: sparkSkillCatalog[3],
    code_playground: sparkSkillCatalog[4],
    web_playground: sparkSkillCatalog[5],
  };

export function sparkCatalogPromptBlock(): string {
  return sparkSkillCatalog
    .map(
      (spark) =>
        `- ${spark.id}: ${spark.name} - ${spark.description} Use when: ${spark.whenToUse}`,
    )
    .join("\n");
}
