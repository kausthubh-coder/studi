import path from "node:path";
import { existsSync } from "node:fs";
import {
  labTemplateCatalog,
  resolveTemplateKey,
  type LabTemplateKey,
} from "../../lib/lab-runtime/profiles";

const repoRoot = process.cwd();
const outputRoot = path.join(repoRoot, "codesandbox", "templates");

function readRequestedTemplates(): LabTemplateKey[] {
  const filterArg = process.argv
    .slice(2)
    .find((value) => value.startsWith("--template="));
  if (!filterArg) {
    return Object.keys(labTemplateCatalog) as LabTemplateKey[];
  }

  const keys = filterArg
    .slice("--template=".length)
    .split(",")
    .map((value) => resolveTemplateKey(value))
    .filter((value): value is LabTemplateKey => Boolean(value));

  if (keys.length === 0) {
    throw new Error(
      "No valid template keys were provided. Use --template=react_vite,nextjs",
    );
  }

  return keys;
}

async function run(command: string[]) {
  const proc = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`);
  }
}

async function main() {
  if (!process.env.CSB_API_KEY?.trim()) {
    throw new Error(
      "CSB_API_KEY must be set in your local shell before building templates.",
    );
  }

  const selectedTemplates = readRequestedTemplates();

  for (const key of selectedTemplates) {
    const template = labTemplateCatalog[key];
    const templateDir = path.join(outputRoot, template.upstreamSlug);
    if (!existsSync(templateDir)) {
      throw new Error(
        `Template directory is missing for ${key}. Run 'bun run csb:templates:sync' first.`,
      );
    }

    console.log(`\n=== Building ${template.label} (${key}) ===`);
    await run([
      "bunx",
      "csb",
      "build",
      templateDir,
      "--ci",
      "--name",
      `Studi ${template.label}`,
    ]);
    console.log(`Set ${template.envVarName} to the sandbox ID returned above.`);
  }
}

await main();
