import {
  sparkSceneV2Version,
  type JsonValue,
  type SceneSparkPayload,
  type SceneSparkV2Payload,
} from "./contracts";

export type StudiSceneMessageType =
  | "ready"
  | "resize"
  | "interaction"
  | "checkpoint"
  | "error";

export type StudiSceneMessage = {
  source: "studi-scene";
  version: 1;
  type: StudiSceneMessageType;
  payload?: Record<string, JsonValue>;
};

const sceneBaseCsp = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];

const sceneV1Csp = [
  ...sceneBaseCsp,
  "script-src 'unsafe-inline' https://cdn.jsdelivr.net",
].join("; ");

const sceneV2Csp = [...sceneBaseCsp, "script-src 'unsafe-inline'"].join("; ");

const studiSceneRuntimeScript = `
(function () {
  var SOURCE = "studi-scene";
  function sanitizePayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
    var clean = {};
    Object.keys(payload).slice(0, 24).forEach(function (key) {
      var value = payload[key];
      if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        clean[key] = value;
      }
    });
    return clean;
  }
  function post(type, payload) {
    window.parent.postMessage({
      source: SOURCE,
      version: 1,
      type: type,
      payload: sanitizePayload(payload)
    }, "*");
  }
  window.StudiScene = {
    ready: function (payload) { post("ready", payload); },
    resize: function (height) {
      post("resize", { height: Math.max(220, Math.min(1200, Number(height) || document.documentElement.scrollHeight || 440)) });
    },
    interaction: function (id, value) { post("interaction", { id: String(id || "interaction"), value: typeof value === "undefined" ? null : value }); },
    checkpoint: function (id, value, correct) { post("checkpoint", { id: String(id || "checkpoint"), value: typeof value === "undefined" ? null : value, correct: correct === true }); },
    error: function (message) { post("error", { message: String(message || "Scene error") }); }
  };
  window.addEventListener("error", function (event) {
    post("error", { message: event.message || "Scene runtime error" });
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason && event.reason.message ? event.reason.message : event.reason;
    post("error", { message: String(reason || "Scene promise rejection") });
  });
  window.addEventListener("DOMContentLoaded", function () {
    requestAnimationFrame(function () {
      post("ready", {});
      post("resize", { height: document.documentElement.scrollHeight || document.body.scrollHeight || 440 });
    });
  });
}());
`.trim();

const studiSceneThemeStyles = `
:root {
  color-scheme: light;
  --studi-scene-bg: #fff8f0;
  --studi-scene-surface: #fffdf9;
  --studi-scene-surface-soft: #f7efe4;
  --studi-scene-ink: #1c1208;
  --studi-scene-muted: #6b5a47;
  --studi-scene-faint: #8b7a69;
  --studi-scene-border: #eadccd;
  --studi-scene-accent: #e05a3a;
  --studi-scene-teal: #3a9e8a;
  --studi-scene-amber: #e8a030;
  --studi-scene-lavender: #9b6dd4;
  --studi-scene-radius: 16px;
}

html {
  min-width: 0;
  background: var(--studi-scene-bg);
  color: var(--studi-scene-ink);
  font-family:
    "Plus Jakarta Sans",
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  -webkit-font-smoothing: antialiased;
}

body {
  margin: 0;
  min-width: 0;
  background: var(--studi-scene-bg);
  color: var(--studi-scene-ink);
  font-size: 16px;
  line-height: 1.55;
}

body,
main,
section,
article,
p,
label,
li,
figcaption,
output {
  color: var(--studi-scene-ink);
}

main,
.studi-scene {
  width: min(100%, 820px);
  margin: 0 auto;
  padding: clamp(18px, 4vw, 32px);
}

h1,
h2,
h3 {
  margin: 0 0 0.45em;
  color: var(--studi-scene-ink);
  line-height: 1.15;
  letter-spacing: 0;
  text-wrap: balance;
}

p {
  margin: 0 0 0.85rem;
  max-width: 70ch;
}

.muted,
.hint,
.instructions,
[data-muted="true"] {
  color: var(--studi-scene-muted);
}

.panel,
.card,
.scene-panel,
.studi-panel,
fieldset {
  border: 1px solid var(--studi-scene-border);
  border-radius: var(--studi-scene-radius);
  background: var(--studi-scene-surface);
}

button,
input,
select,
textarea {
  font: inherit;
  color: var(--studi-scene-ink);
}

button,
select,
input[type="button"],
input[type="submit"] {
  min-height: 40px;
  border: 1px solid var(--studi-scene-border);
  border-radius: 999px;
  background: var(--studi-scene-surface);
}

button {
  cursor: pointer;
}

button:hover {
  border-color: color-mix(in srgb, var(--studi-scene-accent) 42%, var(--studi-scene-border));
}

button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible,
[tabindex]:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--studi-scene-accent) 35%, transparent);
  outline-offset: 2px;
}

input,
select,
textarea {
  border: 1px solid var(--studi-scene-border);
  border-radius: 12px;
  background: var(--studi-scene-surface);
}

svg text {
  fill: currentColor;
}

@media (max-width: 640px) {
  body {
    font-size: 15px;
  }

  main,
  .studi-scene {
    padding: 16px;
  }
}
`.trim();

const studiSceneContrastGuardStyles = `
body:not([data-studi-scene-dark]) {
  background: var(--studi-scene-bg);
  color: var(--studi-scene-ink);
}

body:not([data-studi-scene-dark]) main > h1,
body:not([data-studi-scene-dark]) main > h2,
body:not([data-studi-scene-dark]) main > h3,
body:not([data-studi-scene-dark]) main > p,
body:not([data-studi-scene-dark]) main > label,
body:not([data-studi-scene-dark]) main > .instructions,
body:not([data-studi-scene-dark]) main > .hint,
body:not([data-studi-scene-dark]) main > [data-muted="true"] {
  color: var(--studi-scene-ink);
}
`.trim();

function escapeClosingTags(value: string, tagName: "script" | "style"): string {
  return value.replace(
    new RegExp(`</${tagName}`, "gi"),
    `<\\/${tagName}`,
  );
}

function injectHeadContent(html: string, headContent: string): string {
  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${headContent}`);
  }

  if (/<html[\s>]/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, `<html$1><head>${headContent}</head>`);
  }

  return `<!doctype html><html><head>${headContent}</head><body>${html}</body></html>`;
}

function buildRuntimeHead({
  csp,
  extraStyles = "",
}: {
  csp: string;
  extraStyles?: string;
}): string {
  const themeStyles = `<style data-studi-scene-theme>${escapeClosingTags(studiSceneThemeStyles, "style")}</style>`;
  const styles = extraStyles
    ? `<style data-studi-scene-file="styles.css">${escapeClosingTags(extraStyles, "style")}</style>`
    : "";
  const contrastGuardStyles = `<style data-studi-scene-contrast-guard>${escapeClosingTags(studiSceneContrastGuardStyles, "style")}</style>`;

  return [
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    `<script>${escapeClosingTags(studiSceneRuntimeScript, "script")}</script>`,
    themeStyles,
    styles,
    contrastGuardStyles,
  ].join("");
}

function buildSceneV2SrcDoc(payload: SceneSparkV2Payload): string {
  const indexHtml = payload.files["index.html"];
  const bodyScript = payload.files["script.js"]
    ? `<script data-studi-scene-file="script.js">${escapeClosingTags(payload.files["script.js"], "script")}</script>`
    : "";
  const headContent = buildRuntimeHead({
    csp: sceneV2Csp,
    extraStyles: payload.files["styles.css"] ?? "",
  });

  if (/<\/body>/i.test(indexHtml)) {
    return injectHeadContent(indexHtml, headContent).replace(
      /<\/body>/i,
      `${bodyScript}</body>`,
    );
  }

  return injectHeadContent(`${indexHtml}${bodyScript}`, headContent);
}

function buildSceneV1SrcDoc(html: string): string {
  return injectHeadContent(html, buildRuntimeHead({ csp: sceneV1Csp }));
}

export function buildSceneSrcDoc(payload: SceneSparkPayload): string {
  if ("version" in payload && payload.version === sparkSceneV2Version) {
    return buildSceneV2SrcDoc(payload);
  }

  return buildSceneV1SrcDoc("html" in payload ? payload.html : "");
}

function isMessagePayload(value: unknown): value is Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) =>
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean",
  );
}

export function isStudiSceneMessage(
  value: unknown,
): value is StudiSceneMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<StudiSceneMessage>;
  return (
    candidate.source === "studi-scene" &&
    candidate.version === 1 &&
    (candidate.type === "ready" ||
      candidate.type === "resize" ||
      candidate.type === "interaction" ||
      candidate.type === "checkpoint" ||
      candidate.type === "error") &&
    (candidate.payload === undefined || isMessagePayload(candidate.payload))
  );
}
