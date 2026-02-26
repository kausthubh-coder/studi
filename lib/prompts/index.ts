import { embeddedPrompts } from "./generated";

const promptCache = new Map<string, string>();

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

  const embedded = embeddedPrompts[relativePath];
  if (typeof embedded === "string") {
    const normalized = normalizePromptText(embedded);
    promptCache.set(relativePath, normalized);
    return normalized;
  }

  throw new Error(
    `Prompt file not found for '${relativePath}'. Available embedded prompts: ${Object.keys(
      embeddedPrompts,
    ).join(", ")}`,
  );
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
