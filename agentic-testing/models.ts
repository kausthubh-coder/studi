import {
  activeModelProfile,
  getModelConfig,
  getStudiAgentName,
  listModelProfiles,
} from "../lib/model-config";

function main(): void {
  const profiles = listModelProfiles();

  console.log("Model profiles\n");
  console.log(`Active profile: ${activeModelProfile}\n`);

  for (const profile of profiles) {
    const config = getModelConfig(profile);
    console.log(`- ${profile}`);
    console.log(`  agentName: ${getStudiAgentName(profile)}`);
    console.log(`  studiAgent: ${config.studiAgent}`);
    console.log(`  codiAgent: ${config.codiAgent}`);
    console.log(`  sparkScene: ${config.sparkScene}`);
    console.log(`  sparkDesmos: ${config.sparkDesmos}`);
    console.log(`  sparkCode: ${config.sparkCode}`);
    console.log(`  sparkQuiz: ${config.sparkQuiz}`);
    console.log(`  sparkFlash: ${config.sparkFlash}`);
    console.log("");
  }

  console.log("Examples");
  console.log(
    `- single run: bun run agentic:test run --agentName ${getStudiAgentName(activeModelProfile)} --userId dev-user --prompt \"Teach me binary search\"`,
  );
  console.log(
    '- compare: bun run agentic:compare --profiles "balanced,fast,quality" --prompt "Create a derivative tangent scene"',
  );
}

main();
