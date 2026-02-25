import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  isModelProfile,
  listModelProfiles,
  type ModelProfile,
} from "../lib/model-config";

function usageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(`
Use Model Profile CLI

Usage:
  bun agentic-testing/use-model-profile.ts --profile <balanced|fast|quality>

Example:
  bun run agentic:use-profile --profile fast
`);
  process.exit(1);
}

function getProfileArg(argv: string[]): ModelProfile {
  const index = argv.indexOf("--profile");
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value) {
    usageAndExit("Missing --profile");
  }
  if (!isModelProfile(value)) {
    usageAndExit(
      `Unknown profile: ${value}. Available: ${listModelProfiles().join(", ")}`,
    );
  }
  return value;
}

async function main(): Promise<void> {
  const profile = getProfileArg(process.argv.slice(2));
  const configPath = path.join(process.cwd(), "lib", "model-config.ts");
  const source = await readFile(configPath, "utf8");

  const activeProfilePattern =
    /export const activeModelProfile: ModelProfile = "(balanced|fast|quality)";/;
  const activeProfileMatch = source.match(activeProfilePattern);
  if (!activeProfileMatch) {
    throw new Error(
      "Could not locate activeModelProfile in lib/model-config.ts",
    );
  }

  const currentProfile = activeProfileMatch[1] as ModelProfile;
  if (currentProfile === profile) {
    console.log(`Active model profile already set: ${profile}`);
    return;
  }

  const nextSource = source.replace(
    activeProfilePattern,
    `export const activeModelProfile: ModelProfile = "${profile}";`,
  );

  await writeFile(configPath, nextSource, "utf8");
  console.log(`Active model profile set to: ${profile}`);
  console.log("Run `bunx convex dev` (or redeploy) to apply backend changes.");
}

main().catch((error) => {
  console.error(`Fatal: ${String(error)}`);
  process.exit(1);
});
