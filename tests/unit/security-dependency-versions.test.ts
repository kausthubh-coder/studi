import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, parse, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const secureDirectMinimums = {
  "@clerk/backend": "2.33.3",
  "@clerk/clerk-react": "5.61.6",
  "@clerk/nextjs": "6.39.3",
  "@vercel/sandbox": "2.5.0",
  convex: "1.42.1",
  next: "16.2.6",
} as const;

function numericVersion(value: string): number[] {
  const match = value.match(/\d+\.\d+\.\d+/);
  if (!match) {
    throw new Error(`Expected a semantic version in ${JSON.stringify(value)}`);
  }

  return match[0].split(".").map(Number);
}

function isAtLeast(actual: string, minimum: string): boolean {
  const actualParts = numericVersion(actual);
  const minimumParts = numericVersion(minimum);

  for (let index = 0; index < minimumParts.length; index += 1) {
    if (actualParts[index] !== minimumParts[index]) {
      return actualParts[index] > minimumParts[index];
    }
  }

  return true;
}

function installedVersion(packageName: string): string {
  const require = createRequire(import.meta.url);
  let directory = dirname(require.resolve(packageName));
  const root = parse(directory).root;

  while (directory !== root) {
    const manifestPath = resolve(directory, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        name?: string;
        version?: string;
      };
      if (manifest.name === packageName && manifest.version) {
        return manifest.version;
      }
    }

    directory = dirname(directory);
  }

  throw new Error(
    `Could not find installed package manifest for ${packageName}`,
  );
}

describe("security-sensitive dependency floors", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
  ) as { dependencies: Record<string, string> };

  for (const [packageName, minimum] of Object.entries(secureDirectMinimums)) {
    it(`keeps ${packageName} at or above ${minimum}`, () => {
      const declaredVersion = packageJson.dependencies[packageName];
      const resolvedVersion = installedVersion(packageName);

      expect(
        declaredVersion,
        `${packageName} must remain a direct dependency`,
      ).toBeTruthy();
      expect(
        isAtLeast(declaredVersion, minimum),
        `${packageName} declares ${declaredVersion}, below secure floor ${minimum}`,
      ).toBe(true);
      expect(
        isAtLeast(resolvedVersion, minimum),
        `${packageName} resolves to ${resolvedVersion}, below secure floor ${minimum}`,
      ).toBe(true);
    });
  }
});
