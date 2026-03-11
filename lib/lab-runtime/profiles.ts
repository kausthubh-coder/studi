export const labTemplateCatalog = {
  astro: {
    key: "astro",
    envVarName: "CSB_TEMPLATE_ASTRO_ID",
    officialTemplateId: "j1qiqf",
    label: "Astro",
    upstreamSlug: "astro",
    defaultLanguage: "typescript",
  },
  bun: {
    key: "bun",
    envVarName: "CSB_TEMPLATE_BUN_ID",
    officialTemplateId: "0uzq6f",
    label: "Bun",
    upstreamSlug: "bun",
    defaultLanguage: "typescript",
  },
  elixir: {
    key: "elixir",
    envVarName: "CSB_TEMPLATE_ELIXIR_ID",
    officialTemplateId: "9k9tmw",
    label: "Elixir",
    upstreamSlug: "elixir",
    defaultLanguage: "elixir",
  },
  gleam: {
    key: "gleam",
    envVarName: "CSB_TEMPLATE_GLEAM_ID",
    officialTemplateId: "pq4hq8",
    label: "Gleam",
    upstreamSlug: "gleam",
    defaultLanguage: "gleam",
  },
  go: {
    key: "go",
    envVarName: "CSB_TEMPLATE_GO_ID",
    officialTemplateId: "ej14tt",
    label: "Go",
    upstreamSlug: "go",
    defaultLanguage: "go",
  },
  html_css: {
    key: "html_css",
    envVarName: "CSB_TEMPLATE_HTML_CSS_ID",
    officialTemplateId: "kmwy42",
    label: "HTML/CSS",
    upstreamSlug: "html-css",
    defaultLanguage: "html",
  },
  javascript: {
    key: "javascript",
    envVarName: "CSB_TEMPLATE_JAVASCRIPT_ID",
    officialTemplateId: "3l5fg9",
    label: "JavaScript",
    upstreamSlug: "javascript",
    defaultLanguage: "javascript",
  },
  nextjs: {
    key: "nextjs",
    envVarName: "CSB_TEMPLATE_NEXTJS_ID",
    officialTemplateId: "fxis37",
    label: "Next.js",
    upstreamSlug: "nextjs",
    defaultLanguage: "typescript",
  },
  python_flask_server: {
    key: "python_flask_server",
    envVarName: "CSB_TEMPLATE_PYTHON_FLASK_SERVER_ID",
    officialTemplateId: "4gppm4",
    label: "Python Flask Server",
    upstreamSlug: "python-flask-server",
    defaultLanguage: "python",
  },
  python: {
    key: "python",
    envVarName: "CSB_TEMPLATE_PYTHON_ID",
    officialTemplateId: "in2qez",
    label: "Python",
    upstreamSlug: "python",
    defaultLanguage: "python",
  },
  rails: {
    key: "rails",
    envVarName: "CSB_TEMPLATE_RAILS_ID",
    officialTemplateId: "n92lr8",
    label: "Rails",
    upstreamSlug: "rails",
    defaultLanguage: "ruby",
  },
  react_vite: {
    key: "react_vite",
    envVarName: "CSB_TEMPLATE_REACT_VITE_ID",
    officialTemplateId: "kd848j",
    label: "React + Vite",
    upstreamSlug: "react-vite",
    defaultLanguage: "typescript",
  },
  rust: {
    key: "rust",
    envVarName: "CSB_TEMPLATE_RUST_ID",
    officialTemplateId: "rk69p3",
    label: "Rust",
    upstreamSlug: "rust",
    defaultLanguage: "rust",
  },
  sveltekit: {
    key: "sveltekit",
    envVarName: "CSB_TEMPLATE_SVELTEKIT_ID",
    officialTemplateId: "q6j99z",
    label: "SvelteKit",
    upstreamSlug: "sveltekit",
    defaultLanguage: "typescript",
  },
  vite: {
    key: "vite",
    envVarName: "CSB_TEMPLATE_VITE_ID",
    officialTemplateId: "s267rm",
    label: "Vite",
    upstreamSlug: "vite",
    defaultLanguage: "typescript",
  },
} as const;

export type LabTemplateKey = keyof typeof labTemplateCatalog;

export type LabRuntimeInput = {
  language?: string;
  framework?: string;
  template?: string;
};

export type LabRuntimeSelection = {
  language: string;
  framework?: string;
  runtimeProfileId: string;
  inferredFromFramework: boolean;
  templateKey: LabTemplateKey;
  templateEnvVarName: string;
  templateLabel: string;
};

type LabTemplateDefinition = (typeof labTemplateCatalog)[LabTemplateKey];

const frameworkTemplateMap: Record<string, LabTemplateKey> = {
  astro: "astro",
  bun: "bun",
  react: "react_vite",
  react_vite: "react_vite",
  "react-vite": "react_vite",
  vite: "vite",
  next: "nextjs",
  nextjs: "nextjs",
  "next.js": "nextjs",
  svelte: "sveltekit",
  sveltekit: "sveltekit",
  "svelte-kit": "sveltekit",
  flask: "python_flask_server",
  "python-flask-server": "python_flask_server",
  rails: "rails",
  ruby_on_rails: "rails",
  go: "go",
  gin: "go",
  fiber: "go",
  rust: "rust",
  actix: "rust",
  rocket: "rust",
  python: "python",
  javascript: "javascript",
  html: "html_css",
  css: "html_css",
  elixir: "elixir",
  phoenix: "elixir",
  gleam: "gleam",
};

const languageAliases: Record<string, string> = {
  ts: "typescript",
  typescript: "typescript",
  js: "javascript",
  javascript: "javascript",
  node: "javascript",
  nodejs: "javascript",
  html: "html",
  css: "css",
  py: "python",
  python: "python",
  go: "go",
  golang: "go",
  rust: "rust",
  ruby: "ruby",
  rails: "ruby",
  elixir: "elixir",
  gleam: "gleam",
  bun: "typescript",
};

const templateAliases: Record<string, LabTemplateKey> = {
  astro: "astro",
  bun: "bun",
  elixir: "elixir",
  gleam: "gleam",
  go: "go",
  html: "html_css",
  css: "html_css",
  html_css: "html_css",
  "html-css": "html_css",
  javascript: "javascript",
  js: "javascript",
  next: "nextjs",
  nextjs: "nextjs",
  "next.js": "nextjs",
  python: "python",
  python_flask_server: "python_flask_server",
  "python-flask-server": "python_flask_server",
  flask: "python_flask_server",
  rails: "rails",
  rust: "rust",
  react: "react_vite",
  react_vite: "react_vite",
  "react-vite": "react_vite",
  svelte: "sveltekit",
  sveltekit: "sveltekit",
  vite: "vite",
};

const languageTemplateMap: Record<string, LabTemplateKey> = {
  html: "html_css",
  css: "html_css",
  javascript: "javascript",
  python: "python",
  ruby: "rails",
  go: "go",
  rust: "rust",
  elixir: "elixir",
  gleam: "gleam",
  typescript: "vite",
};

function normalize(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed.replace(/\s+/g, "_") : undefined;
}

function normalizeLanguage(value?: string): string | undefined {
  const normalized = normalize(value);
  if (!normalized) {
    return undefined;
  }

  return languageAliases[normalized] ?? normalized;
}

export function isLabTemplateKey(value: string | undefined): value is LabTemplateKey {
  return typeof value === "string" && value in labTemplateCatalog;
}

export function resolveTemplateKey(value?: string): LabTemplateKey | undefined {
  const normalized = normalize(value);
  if (!normalized) {
    return undefined;
  }

  return templateAliases[normalized];
}

export function getLabTemplateDefinition(templateKey: LabTemplateKey): LabTemplateDefinition {
  return labTemplateCatalog[templateKey];
}

export function getLabTemplatePromptList() {
  return Object.values(labTemplateCatalog)
    .map((template) => `${template.key} (${template.label})`)
    .join(", ");
}

export function resolveLabRuntime(input: LabRuntimeInput): LabRuntimeSelection {
  const normalizedFramework = normalize(input.framework);
  const explicitLanguage = normalizeLanguage(input.language);
  const explicitTemplateKey = resolveTemplateKey(input.template);
  const frameworkTemplateKey = normalizedFramework
    ? frameworkTemplateMap[normalizedFramework]
    : undefined;
  const templateKey =
    explicitTemplateKey ??
    frameworkTemplateKey ??
    (explicitLanguage ? languageTemplateMap[explicitLanguage] : undefined) ??
    "javascript";
  const template = getLabTemplateDefinition(templateKey);

  const language =
    explicitLanguage ??
    (frameworkTemplateKey ? template.defaultLanguage : undefined) ??
    template.defaultLanguage;

  return {
    language,
    framework: normalizedFramework,
    runtimeProfileId: `${language}:${normalizedFramework ?? templateKey}`,
    inferredFromFramework: Boolean(frameworkTemplateKey && !explicitLanguage),
    templateKey,
    templateEnvVarName: template.envVarName,
    templateLabel: template.label,
  };
}
