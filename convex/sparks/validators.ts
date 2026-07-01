import type {
  CreateSparkToolInput,
  DesmosGraphPayload,
  DesmosSparkDraft,
  FlashCardSparkPayload,
  QuizSparkPayload,
  SparkValidationResult,
} from "../../lib/sparks/contracts";
import { tailwindBrowserScriptSrc } from "./schemas";

export function createArtifactId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `spark_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractInlineScriptBlocks(html: string): string[] {
  const blocks: string[] = [];
  const scriptPattern = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    blocks.push(match[1] ?? "");
  }

  return blocks;
}

function extractExternalScriptSrcs(html: string): string[] {
  const sources: string[] = [];
  const scriptSrcPattern = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(scriptSrcPattern)) {
    const src = (match[1] ?? "").trim();
    if (src) {
      sources.push(src);
    }
  }

  return sources;
}

function normalizeScriptSource(src: string): string {
  try {
    const parsed = new URL(src);
    const pathname = parsed.pathname.endsWith("/")
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname;
    return `${parsed.origin}${pathname}`;
  } catch {
    return src.trim();
  }
}

export function normalizeSceneHtmlWithTemplate(html: string): string {
  const trimmed = html.trim();
  let normalized = trimmed;

  if (!/<html[\s>]/i.test(normalized)) {
    normalized = `<html><head></head><body>${normalized}</body></html>`;
  }

  if (!/<head[\s>]/i.test(normalized)) {
    normalized = normalized.replace(/<html([^>]*)>/i, "<html$1><head></head>");
  }

  if (!/<body[\s>]/i.test(normalized)) {
    if (/<\/head>/i.test(normalized)) {
      normalized = normalized.replace(/<\/head>/i, "</head><body></body>");
    } else if (/<\/html>/i.test(normalized)) {
      normalized = normalized.replace(/<\/html>/i, "<body></body></html>");
    } else {
      normalized = `${normalized}<body></body>`;
    }
  }

  normalized = normalized.replace(
    /<head([^>]*)>([\s\S]*?)<\/head>/i,
    (_full, attrs: string, headContent: string) => {
      let nextHeadContent = headContent;

      if (!/<meta\b[^>]*charset\s*=\s*/i.test(nextHeadContent)) {
        nextHeadContent = `\n    <meta charset="UTF-8" />${nextHeadContent}`;
      }

      if (!/<meta\b[^>]*name\s*=\s*["']viewport["']/i.test(nextHeadContent)) {
        nextHeadContent = `\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />${nextHeadContent}`;
      }

      const tailwindScriptPattern = new RegExp(
        `<script\\b[^>]*\\bsrc\\s*=\\s*["']${escapeRegExp(tailwindBrowserScriptSrc)}["'][^>]*>\\s*<\\/script>`,
        "i",
      );
      if (!tailwindScriptPattern.test(nextHeadContent)) {
        nextHeadContent = `\n    <script src="${tailwindBrowserScriptSrc}"></script>${nextHeadContent}`;
      }

      return `<head${attrs}>${nextHeadContent}\n  </head>`;
    },
  );

  if (!/<!doctype html>/i.test(normalized)) {
    normalized = `<!doctype html>\n${normalized}`;
  }

  return normalized;
}

export function validateSceneHtml(html: string): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!html.trim()) {
    errors.push("Scene HTML is empty.");
  }

  if (!/<!doctype html>/i.test(html)) {
    warnings.push("Scene HTML is missing <!doctype html>.");
  }

  if (!/<html[\s>]/i.test(html)) {
    errors.push("Scene HTML must include an <html> root element.");
  }

  if (!/<body[\s>]/i.test(html)) {
    warnings.push("Scene HTML is missing a <body> element.");
  }

  const externalScriptSrcs = extractExternalScriptSrcs(html);
  const disallowedScriptSrcs = externalScriptSrcs.filter(
    (src) => normalizeScriptSource(src) !== tailwindBrowserScriptSrc,
  );
  if (disallowedScriptSrcs.length > 0) {
    errors.push(
      `External script is not allowed: ${disallowedScriptSrcs[0]}. Only ${tailwindBrowserScriptSrc} is permitted.`,
    );
  }

  if (/\bfetch\(/i.test(html)) {
    warnings.push(
      "Scene HTML uses fetch(). Avoid network calls when possible.",
    );
  }

  if (html.length > 16_000) {
    errors.push("Scene HTML is too large. Keep it under 16,000 characters.");
  }

  const scripts = extractInlineScriptBlocks(html);
  if (scripts.some((script) => script.trim().length > 0)) {
    warnings.push(
      "Inline script syntax checks are skipped in this runtime environment.",
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateDesmosPayload(
  payload: DesmosGraphPayload,
): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (payload.expressions.length === 0) {
    errors.push("Desmos payload must include at least one expression.");
  }

  if (payload.viewport) {
    if (payload.viewport.left >= payload.viewport.right) {
      errors.push("Desmos viewport must satisfy left < right.");
    }
    if (payload.viewport.bottom >= payload.viewport.top) {
      errors.push("Desmos viewport must satisfy bottom < top.");
    }
  }

  const hasEquation = payload.expressions.some((expression) => {
    const latex = expression.latex;
    return typeof latex === "string" && latex.trim().length > 0;
  });
  if (!hasEquation) {
    warnings.push("Desmos payload has no latex equations.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateQuizPayload(
  payload: QuizSparkPayload,
): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (payload.questions.length < 3) {
    errors.push("Quiz payload must include at least 3 questions.");
  }

  for (const [questionIndex, question] of payload.questions.entries()) {
    if (!question.prompt.trim()) {
      errors.push(`Question ${questionIndex + 1} prompt is required.`);
    }

    if (question.choices.length < 2) {
      errors.push(`Question ${questionIndex + 1} needs at least 2 choices.`);
    }

    const hasCorrectChoice = question.choices.some(
      (choice) => choice.id === question.correctChoiceId,
    );
    if (!hasCorrectChoice) {
      errors.push(
        `Question ${questionIndex + 1} has an invalid correctChoiceId.`,
      );
    }
  }

  if (!payload.instructions || !payload.instructions.trim()) {
    warnings.push("Quiz payload is missing learner instructions.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateFlashCardPayload(
  payload: FlashCardSparkPayload,
): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (payload.cards.length < 4) {
    errors.push("Flash-card payload must include at least 4 cards.");
  }

  for (const [cardIndex, card] of payload.cards.entries()) {
    if (!card.front.trim()) {
      errors.push(`Card ${cardIndex + 1} is missing front text.`);
    }
    if (!card.back.trim()) {
      errors.push(`Card ${cardIndex + 1} is missing back text.`);
    }
  }

  if (!payload.instructions || !payload.instructions.trim()) {
    warnings.push("Flash-card payload is missing learner instructions.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function extractEquationCandidates(context: string): string[] {
  const blockers = [
    "table",
    "parametric",
    "polar",
    "inequality",
    "piecewise",
    "regression",
  ];

  const normalizedContext = context.replace(/\s+/g, " ").trim();
  const lowered = normalizedContext.toLowerCase();
  if (blockers.some((token) => lowered.includes(token))) {
    return [];
  }

  const chunks = normalizedContext
    .replace(/i\.e\./gi, "")
    .split(/\n|,|;|\band\b|\bplus\b|\bwith\b/gi)
    .map((part) =>
      part
        .replace(/^[^a-zA-Z0-9(\-]+/, "")
        .replace(/[^a-zA-Z0-9)\]}]+$/, "")
        .trim(),
    )
    .filter(Boolean);

  const results: string[] = [];
  const seen = new Set<string>();
  const equationPattern =
    /([a-zA-Z](?:[a-zA-Z0-9'_]*|\([^)]*\))*\s*=\s*[^,;\n]+)/g;
  const allowedIdentifiers = new Set([
    "x",
    "y",
    "a",
    "b",
    "t",
    "n",
    "f",
    "g",
    "h",
    "sin",
    "cos",
    "tan",
    "cot",
    "sec",
    "csc",
    "asin",
    "acos",
    "atan",
    "log",
    "ln",
    "sqrt",
    "abs",
    "theta",
    "pi",
    "e",
  ]);

  for (const chunk of chunks) {
    if (!chunk.includes("=")) {
      continue;
    }

    const matches = Array.from(chunk.matchAll(equationPattern));
    for (const match of matches) {
      let candidate = (match[1] ?? "").trim();

      candidate = candidate
        .replace(/\s+\b(and|with|where|for|to|in)\b\s+.*$/i, "")
        .replace(/\.\s+[a-zA-Z].*$/, "")
        .replace(/\s+\(or\b[\s\S]*$/i, "")
        .replace(/[.;]\s*$/, "")
        .replace(/\s+/g, " ")
        .trim();

      if (!candidate.includes("=") || /https?:\/\//i.test(candidate)) {
        continue;
      }

      if (candidate.length > 100) {
        continue;
      }

      if (!/^[a-zA-Z0-9_'()\s+\-*/^.=]+$/.test(candidate)) {
        continue;
      }

      const firstEquals = candidate.indexOf("=");
      const secondEquals = candidate.indexOf("=", firstEquals + 1);
      if (secondEquals !== -1) {
        candidate = candidate.slice(0, secondEquals).trim();
      }

      const lhs = candidate.split("=")[0]?.trim() ?? "";
      if (!/[a-zA-Z]/.test(lhs)) {
        continue;
      }

      const rhs = candidate.split("=")[1]?.trim() ?? "";
      if (!rhs) {
        continue;
      }

      const rhsWords = rhs.toLowerCase().match(/[a-zA-Z]+/g) ?? [];
      const hasUnknownIdentifier = rhsWords.some(
        (word) => !allowedIdentifiers.has(word),
      );
      if (hasUnknownIdentifier) {
        continue;
      }

      const key = candidate.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push(candidate);
    }
  }

  return results;
}

export function buildSimpleDesmosDraft(
  input: CreateSparkToolInput,
): DesmosSparkDraft | null {
  const equations = extractEquationCandidates(input.context).slice(0, 4);

  if (equations.length === 0) {
    return null;
  }

  const joined = equations.join(" and ");
  const title =
    input.title ?? (equations.length === 1 ? equations[0] : "Equation Graphs");
  const summary =
    input.summary ??
    (equations.length === 1
      ? `Explore ${equations[0]} interactively.`
      : `Explore ${joined} on the same graph.`);

  return {
    title,
    summary,
    workerSummary:
      equations.length === 1
        ? `Created a deterministic Desmos graph for ${equations[0]}.`
        : `Created a deterministic Desmos graph for ${joined}.`,
    payload: {
      expressions: equations.map((latex, index) => ({
        id: `eq${index + 1}`,
        latex,
      })),
      viewport: {
        left: -10,
        right: 10,
        bottom: -10,
        top: 10,
      },
      hint:
        equations.length === 1
          ? "Edit the equation or add another one to compare shapes."
          : "Toggle equations and zoom near intersections.",
    },
  };
}
