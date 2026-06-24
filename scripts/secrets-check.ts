import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

type Finding = {
  file: string;
  line: number;
  label: string;
};

const ignoredPathParts = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "out",
  "build",
]);

const privateKeyBoundary = [
  "-----BEGIN ",
  "[A-Z ]*",
  "PRIVATE",
  " KEY-----",
].join("");

const secretPatterns: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "Private key block",
    pattern: new RegExp(privateKeyBoundary),
  },
  {
    label: "OpenAI/OpenRouter-style secret key",
    pattern: /\bsk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{20,}\b/,
  },
  {
    label: "Clerk/Stripe-style secret key",
    pattern: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  },
  {
    label: "GitHub token",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
  },
  {
    label: "AWS access key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    label: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
];

function gitFileList(): string[] {
  const output = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { encoding: "utf8" },
  );

  return output.split("\0").filter(Boolean);
}

function shouldScan(file: string): boolean {
  return !file.split("/").some((part) => ignoredPathParts.has(part));
}

function scanFile(file: string): Finding[] {
  if (!statSync(file).isFile()) {
    return [];
  }

  const buffer = readFileSync(file);
  if (buffer.includes(0)) {
    return [];
  }

  const text = buffer.toString("utf8");
  const findings: Finding[] = [];

  text.split(/\r?\n/).forEach((lineText, index) => {
    for (const { label, pattern } of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(lineText)) {
        findings.push({
          file,
          line: index + 1,
          label,
        });
      }
    }
  });

  return findings;
}

const findings = gitFileList().filter(shouldScan).flatMap(scanFile);

if (findings.length > 0) {
  console.error("Secret hygiene check failed. Remove or rotate these values:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} ${finding.label}`);
  }
  process.exit(1);
}

console.log("Secret hygiene check passed.");
