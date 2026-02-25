"use node";

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const promptCache = new Map<string, string>();

const promptsRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "prompts",
);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePromptText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

export function loadPrompt(relativePath: string): string {
  const cached = promptCache.get(relativePath);
  if (cached) {
    return cached;
  }

  const promptPath = resolve(promptsRoot, relativePath);
  const promptText = normalizePromptText(readFileSync(promptPath, "utf8"));
  promptCache.set(relativePath, promptText);
  return promptText;
}

export function renderPrompt(
  relativePath: string,
  variables: Record<string, string | undefined>,
): string {
  let rendered = loadPrompt(relativePath);

  for (const [key, value] of Object.entries(variables)) {
    const tokenPattern = new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "g");
    rendered = rendered.replace(tokenPattern, value ?? "");
  }

  return rendered.replace(/\n{3,}/g, "\n\n").trim();
}
