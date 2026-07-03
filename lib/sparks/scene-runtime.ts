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
  const styles = extraStyles
    ? `<style data-studi-scene-file="styles.css">${escapeClosingTags(extraStyles, "style")}</style>`
    : "";

  return [
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    `<script>${escapeClosingTags(studiSceneRuntimeScript, "script")}</script>`,
    styles,
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
