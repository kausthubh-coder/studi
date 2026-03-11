import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { labTemplateCatalog } from "../../lib/lab-runtime/profiles";

const upstreamRepoUrl = "https://github.com/codesandbox/sandbox-templates.git";
const repoRoot = process.cwd();
const cacheRoot = path.join(repoRoot, ".cache", "codesandbox-sandbox-templates");
const outputRoot = path.join(repoRoot, "codesandbox", "templates");

const templateEntries = Object.values(labTemplateCatalog);
const templateSlugs = templateEntries.map((entry) => entry.upstreamSlug);

async function run(command: string[], cwd?: string) {
  const proc = Bun.spawn(command, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(" ")}`);
  }
}

async function ensureUpstreamRepo() {
  await mkdir(path.dirname(cacheRoot), { recursive: true });

  if (!existsSync(path.join(cacheRoot, ".git"))) {
    await run([
      "git",
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      upstreamRepoUrl,
      cacheRoot,
    ]);
  } else {
    await run(["git", "fetch", "origin", "main", "--depth", "1"], cacheRoot);
    await run(["git", "reset", "--hard", "origin/main"], cacheRoot);
  }

  await run(["git", "sparse-checkout", "set", ...templateSlugs], cacheRoot);
}

async function syncTemplateDirectories() {
  await mkdir(outputRoot, { recursive: true });
  const existing = await readdir(outputRoot, { withFileTypes: true }).catch(
    () => [],
  );

  for (const entry of existing) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!templateSlugs.includes(entry.name)) {
      await rm(path.join(outputRoot, entry.name), { recursive: true, force: true });
    }
  }

  for (const template of templateEntries) {
    const sourceDir = path.join(cacheRoot, template.upstreamSlug);
    const destinationDir = path.join(outputRoot, template.upstreamSlug);
    await rm(destinationDir, { recursive: true, force: true });
    await cp(sourceDir, destinationDir, {
      recursive: true,
      force: true,
    });
  }
}

async function writeManifest() {
  const manifest = Object.fromEntries(
    templateEntries.map((template) => [
      template.key,
      {
        label: template.label,
        envVarName: template.envVarName,
        upstreamSlug: template.upstreamSlug,
        directory: `codesandbox/templates/${template.upstreamSlug}`,
      },
    ]),
  );

  await writeFile(
    path.join(outputRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

async function main() {
  await ensureUpstreamRepo();
  await syncTemplateDirectories();
  await writeManifest();
  console.log(`Synced ${templateEntries.length} CodeSandbox template sources.`);
}

await main();
