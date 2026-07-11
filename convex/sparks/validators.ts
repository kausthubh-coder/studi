import type {
  CreateSparkToolInput,
  DesmosGraphPayload,
  DesmosSparkDraft,
  FlashCardSparkPayload,
  QuizSparkPayload,
  SceneSparkV2Payload,
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

const allowedSceneV2FileNames = new Set([
  "index.html",
  "styles.css",
  "script.js",
]);

const blockedSceneCodePatterns: Array<[RegExp, string]> = [
  [/\bfetch\s*\(/i, "fetch() is not allowed in Scene Spark v2."],
  [/\bXMLHttpRequest\b/i, "XMLHttpRequest is not allowed in Scene Spark v2."],
  [/\bWebSocket\b/i, "WebSocket is not allowed in Scene Spark v2."],
  [/\bEventSource\b/i, "EventSource is not allowed in Scene Spark v2."],
  [/\bsendBeacon\s*\(/i, "sendBeacon() is not allowed in Scene Spark v2."],
  [
    /\bnavigator\.sendBeacon\s*\(/i,
    "sendBeacon() is not allowed in Scene Spark v2.",
  ],
  [/\blocalStorage\b/i, "Browser storage is not allowed in Scene Spark v2."],
  [/\bsessionStorage\b/i, "Browser storage is not allowed in Scene Spark v2."],
  [/\bindexedDB\b/i, "Browser storage is not allowed in Scene Spark v2."],
  [/\bdocument\.cookie\b/i, "Cookies are not allowed in Scene Spark v2."],
  [/\beval\s*\(/i, "eval() is not allowed in Scene Spark v2."],
  [/\bFunction\s*\(/, "Function() is not allowed in Scene Spark v2."],
  [/\bimport\s*\(/i, "Dynamic import is not allowed in Scene Spark v2."],
  [/\bwindow\.open\s*\(/i, "Popups are not allowed in Scene Spark v2."],
  [/\bopen\s*\(/i, "Popups are not allowed in Scene Spark v2."],
  [
    /\btop\.location\b/i,
    "Top-level navigation is not allowed in Scene Spark v2.",
  ],
  [
    /\bparent\.location\b/i,
    "Parent navigation is not allowed in Scene Spark v2.",
  ],
  [/\bwindow\.location\b/i, "Navigation is not allowed in Scene Spark v2."],
  [/\bdocument\.location\b/i, "Navigation is not allowed in Scene Spark v2."],
  [
    /\blocation\.(assign|replace|href)\b/i,
    "Navigation is not allowed in Scene Spark v2.",
  ],
  [
    /\bnavigator\.serviceWorker\b/i,
    "Service workers are not allowed in Scene Spark v2.",
  ],
];

function validateSceneCodeSafety(code: string): string[] {
  const errors: string[] = [];
  for (const [pattern, message] of blockedSceneCodePatterns) {
    if (pattern.test(code)) {
      errors.push(message);
    }
  }
  return errors;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type SceneHtmlElement = {
  tagName: string;
  attributes: string;
};

function readHtmlAttribute(attributes: string, name: string): string | null {
  const match = attributes.match(
    new RegExp(
      `\\b${escapeRegExp(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
      "i",
    ),
  );
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function findSceneElementById(
  indexHtml: string,
  controlId: string,
): SceneHtmlElement | null {
  const tagPattern = /<\s*([a-z][\w:-]*)\b([^>]*)>/gi;
  for (const match of indexHtml.matchAll(tagPattern)) {
    const attributes = match[2] ?? "";
    if (readHtmlAttribute(attributes, "id") === controlId) {
      return {
        tagName: (match[1] ?? "").toLowerCase(),
        attributes,
      };
    }
  }
  return null;
}

function hasEventHandlerForControl(
  code: string,
  controlId: string,
  elementAttributes: string,
  eventNames: string[],
): boolean {
  const eventPattern = eventNames.map(escapeRegExp).join("|");
  if (
    new RegExp(`\\bon(?:${eventPattern})\\s*=`, "i").test(elementAttributes)
  ) {
    return true;
  }

  const escapedId = escapeRegExp(controlId);
  const lookup = `(?:document\\s*\\.\\s*)?(?:getElementById\\s*\\(\\s*["']${escapedId}["']\\s*\\)|querySelector\\s*\\(\\s*["']#${escapedId}["']\\s*\\))`;
  const namedEvent = `["'](?:${eventPattern})["']`;
  const directHandler = new RegExp(
    `${lookup}\\s*\\?*\\.\\s*addEventListener\\s*\\(\\s*${namedEvent}`,
    "i",
  );
  if (directHandler.test(code)) {
    return true;
  }

  const assignmentPattern = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${lookup}`,
    "gi",
  );
  for (const match of code.matchAll(assignmentPattern)) {
    const variableName = match[1];
    if (!variableName) continue;
    const variableHandler = new RegExp(
      `\\b${escapeRegExp(variableName)}\\s*\\?*\\.\\s*addEventListener\\s*\\(\\s*${namedEvent}`,
      "i",
    );
    const assignedHandler = new RegExp(
      `\\b${escapeRegExp(variableName)}\\s*\\.\\s*on(?:${eventPattern})\\s*=`,
      "i",
    );
    if (variableHandler.test(code) || assignedHandler.test(code)) {
      return true;
    }
  }

  return false;
}

function hasKeyboardHandlerForControl(
  code: string,
  controlId: string,
  elementAttributes: string,
): boolean {
  return hasEventHandlerForControl(code, controlId, elementAttributes, [
    "keydown",
    "keyup",
  ]);
}

function validateSceneV2SliderAccessibility(
  controls: unknown,
  indexHtml: string,
  code: string,
): string[] {
  if (!Array.isArray(controls)) return [];

  const errors: string[] = [];
  for (const control of controls) {
    if (!isPlainRecord(control) || control.type !== "slider") continue;
    const id = typeof control.id === "string" ? control.id.trim() : "";
    if (!id) continue;

    const element = findSceneElementById(indexHtml, id);
    if (!element) {
      errors.push(
        `Slider control "${id}" must use the same stable id on its interactive element.`,
      );
      continue;
    }

    const isNativeRange =
      element.tagName === "input" &&
      readHtmlAttribute(element.attributes, "type")?.toLowerCase() === "range";
    if (isNativeRange) continue;

    const hasSliderSemantics =
      readHtmlAttribute(element.attributes, "role")?.toLowerCase() ===
        "slider" &&
      readHtmlAttribute(element.attributes, "tabindex") === "0" &&
      readHtmlAttribute(element.attributes, "aria-valuemin") !== null &&
      readHtmlAttribute(element.attributes, "aria-valuemax") !== null &&
      readHtmlAttribute(element.attributes, "aria-valuenow") !== null;
    const hasKeyboardHandler = hasKeyboardHandlerForControl(
      code,
      id,
      element.attributes,
    );

    if (!hasSliderSemantics || !hasKeyboardHandler) {
      errors.push(
        `Slider control "${id}" must be a native range input or a focusable role="slider" with value semantics and a keyboard handler bound to that control id.`,
      );
    }
  }

  return errors;
}

type PointerTargetExtraction = {
  targetIds: Set<string>;
  hasUnresolvedTarget: boolean;
};

function extractPointerTargets(
  indexHtml: string,
  code: string,
): PointerTargetExtraction {
  const targetIds = new Set<string>();
  const variableIds = new Map<string, string>();
  const lookupAssignments = [
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:document\s*\.\s*)?getElementById\s*\(\s*["']([^"']+)["']\s*\)/gi,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:document\s*\.\s*)?querySelector\s*\(\s*["']#([^"']+)["']\s*\)/gi,
  ];
  for (const pattern of lookupAssignments) {
    for (const match of code.matchAll(pattern)) {
      const variableName = match[1];
      const targetId = match[2];
      if (variableName && targetId) variableIds.set(variableName, targetId);
    }
  }

  const listenerPattern =
    /\baddEventListener\s*\(\s*["'](?:pointerdown|mousedown|touchstart)["']/gi;
  const propertyPattern =
    /\.\s*on(?:pointerdown|mousedown|touchstart)\s*=/gi;
  const pointerBindingCount =
    Array.from(code.matchAll(listenerPattern)).length +
    Array.from(code.matchAll(propertyPattern)).length;
  let resolvedBindingCount = 0;

  const directBindings = [
    /(?:document\s*\.\s*)?getElementById\s*\(\s*["']([^"']+)["']\s*\)\s*\?*\.\s*addEventListener\s*\(\s*["'](?:pointerdown|mousedown|touchstart)["']/gi,
    /(?:document\s*\.\s*)?querySelector\s*\(\s*["']#([^"']+)["']\s*\)\s*\?*\.\s*addEventListener\s*\(\s*["'](?:pointerdown|mousedown|touchstart)["']/gi,
    /(?:document\s*\.\s*)?getElementById\s*\(\s*["']([^"']+)["']\s*\)\s*\?*\.\s*on(?:pointerdown|mousedown|touchstart)\s*=/gi,
    /(?:document\s*\.\s*)?querySelector\s*\(\s*["']#([^"']+)["']\s*\)\s*\?*\.\s*on(?:pointerdown|mousedown|touchstart)\s*=/gi,
  ];
  for (const pattern of directBindings) {
    for (const match of code.matchAll(pattern)) {
      const targetId = match[1];
      if (!targetId) continue;
      targetIds.add(targetId);
      resolvedBindingCount += 1;
    }
  }

  const variableBindings = [
    /\b([A-Za-z_$][\w$]*)\s*\?*\.\s*addEventListener\s*\(\s*["'](?:pointerdown|mousedown|touchstart)["']/gi,
    /\b([A-Za-z_$][\w$]*)\s*\.\s*on(?:pointerdown|mousedown|touchstart)\s*=/gi,
  ];
  for (const pattern of variableBindings) {
    for (const match of code.matchAll(pattern)) {
      const variableName = match[1];
      const targetId = variableName ? variableIds.get(variableName) : undefined;
      if (!targetId) continue;
      targetIds.add(targetId);
      resolvedBindingCount += 1;
    }
  }

  let hasUnresolvedTarget = resolvedBindingCount < pointerBindingCount;
  const tagPattern = /<\s*([a-z][\w:-]*)\b([^>]*)>/gi;
  for (const match of indexHtml.matchAll(tagPattern)) {
    const attributes = match[2] ?? "";
    const hasInlinePointerHandler =
      /\bon(?:pointerdown|mousedown|touchstart)\s*=/i.test(attributes);
    const draggable = readHtmlAttribute(attributes, "draggable");
    const isDraggable =
      (draggable !== null && draggable.toLowerCase() !== "false") ||
      /\bdraggable\b(?!\s*=)/i.test(attributes);
    if (!hasInlinePointerHandler && !isDraggable) continue;

    const targetId = readHtmlAttribute(attributes, "id");
    if (targetId) targetIds.add(targetId);
    else hasUnresolvedTarget = true;
  }

  return { targetIds, hasUnresolvedTarget };
}

function isNativeKeyboardControl(element: SceneHtmlElement): boolean {
  if (
    element.tagName === "button" ||
    element.tagName === "select" ||
    element.tagName === "textarea" ||
    element.tagName === "summary"
  ) {
    return true;
  }
  if (element.tagName === "input") {
    return (
      readHtmlAttribute(element.attributes, "type")?.toLowerCase() !== "hidden"
    );
  }
  return (
    element.tagName === "a" &&
    readHtmlAttribute(element.attributes, "href") !== null
  );
}

function hasNativeActivationEquivalent(
  element: SceneHtmlElement,
  code: string,
  targetId: string,
): boolean {
  let activationEvents: string[];
  if (
    element.tagName === "button" ||
    element.tagName === "summary" ||
    element.tagName === "a"
  ) {
    activationEvents = ["click"];
  } else if (element.tagName === "input") {
    const inputType =
      readHtmlAttribute(element.attributes, "type")?.toLowerCase() ?? "text";
    activationEvents = ["button", "submit", "reset", "image"].includes(
      inputType,
    )
      ? ["click"]
      : inputType === "checkbox" || inputType === "radio"
        ? ["click", "change"]
        : ["input", "change"];
  } else {
    activationEvents = ["input", "change"];
  }

  return (
    hasEventHandlerForControl(
      code,
      targetId,
      element.attributes,
      activationEvents,
    ) || hasKeyboardHandlerForControl(code, targetId, element.attributes)
  );
}

function hasCustomKeyboardSemantics(
  element: SceneHtmlElement,
  code: string,
  targetId: string,
): boolean {
  const role = readHtmlAttribute(element.attributes, "role")?.toLowerCase();
  const supportedRoles = new Set([
    "button",
    "checkbox",
    "option",
    "radio",
    "slider",
    "spinbutton",
    "switch",
  ]);
  if (
    !role ||
    !supportedRoles.has(role) ||
    readHtmlAttribute(element.attributes, "tabindex") !== "0" ||
    !hasKeyboardHandlerForControl(code, targetId, element.attributes)
  ) {
    return false;
  }

  if (role === "slider" || role === "spinbutton") {
    return (
      readHtmlAttribute(element.attributes, "aria-valuemin") !== null &&
      readHtmlAttribute(element.attributes, "aria-valuemax") !== null &&
      readHtmlAttribute(element.attributes, "aria-valuenow") !== null
    );
  }
  return true;
}

function validatePointerTargetAccessibility(
  controls: unknown,
  indexHtml: string,
  code: string,
): string[] {
  const errors: string[] = [];
  const declaredSliderIds = new Set(
    Array.isArray(controls)
      ? controls
          .filter(
            (control) =>
              isPlainRecord(control) &&
              control.type === "slider" &&
              typeof control.id === "string" &&
              control.id.trim(),
          )
          .map((control) =>
            String((control as Record<string, unknown>).id).trim(),
          )
      : [],
  );
  const { targetIds, hasUnresolvedTarget } = extractPointerTargets(
    indexHtml,
    code,
  );

  if (hasUnresolvedTarget) {
    errors.push(
      "Pointer-start handlers must be bound to an interactive element with a stable id so keyboard access can be validated.",
    );
  }

  for (const targetId of targetIds) {
    const element = findSceneElementById(indexHtml, targetId);
    if (!element) {
      errors.push(
        `Pointer target "${targetId}" must use the same stable id on its interactive element.`,
      );
      continue;
    }
    if (isNativeKeyboardControl(element)) {
      if (hasNativeActivationEquivalent(element, code, targetId)) continue;
      errors.push(
        `Pointer target "${targetId}" must bind a same-target click, input, change, or keyboard handler so native keyboard activation performs the same behavior.`,
      );
      continue;
    }
    if (declaredSliderIds.has(targetId)) continue;
    if (hasCustomKeyboardSemantics(element, code, targetId)) {
      continue;
    }

    errors.push(
      `Pointer target "${targetId}" must be a native keyboard control or expose a focusable interactive role and keyboard handler bound to that id.`,
    );
  }

  return errors;
}

function validateSceneV2Controls(controls: unknown): string[] {
  const errors: string[] = [];

  if (!Array.isArray(controls)) {
    return ["Scene v2 controls must be an array."];
  }

  controls.forEach((control, index) => {
    const label = `Control ${index + 1}`;
    if (!isPlainRecord(control)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    const id = typeof control.id === "string" ? control.id : "";
    const controlLabel = typeof control.label === "string" ? control.label : "";
    if (!id.trim()) {
      errors.push(`${label} id is required.`);
    }
    if (!controlLabel.trim()) {
      errors.push(`${label} label is required.`);
    }
    if (
      control.type === "slider" &&
      typeof control.min === "number" &&
      typeof control.max === "number" &&
      control.min >= control.max
    ) {
      errors.push(`${label} min must be less than max.`);
    }
    if (
      (control.type === "choice" || control.type === "button") &&
      control.choices !== undefined &&
      !Array.isArray(control.choices)
    ) {
      errors.push(`${label} choices must be an array when provided.`);
    }
    if (
      control.type === "choice" &&
      (!Array.isArray(control.choices) || control.choices.length < 2)
    ) {
      errors.push(`${label} choices must include at least 2 options.`);
    }
  });

  return errors;
}

function validateSceneV2Checkpoints(checkpoints: unknown): string[] {
  const errors: string[] = [];

  if (!Array.isArray(checkpoints)) {
    return ["Scene v2 checkpoints must be an array."];
  }

  checkpoints.forEach((checkpoint, index) => {
    const label = `Checkpoint ${index + 1}`;
    if (!isPlainRecord(checkpoint)) {
      errors.push(`${label} must be an object.`);
      return;
    }
    const id = typeof checkpoint.id === "string" ? checkpoint.id : "";
    const prompt =
      typeof checkpoint.prompt === "string" ? checkpoint.prompt : "";
    if (!id.trim()) {
      errors.push(`${label} id is required.`);
    }
    if (!prompt.trim()) {
      errors.push(`${label} prompt is required.`);
    }
    if (
      checkpoint.answerType === "choice" &&
      (!Array.isArray(checkpoint.choices) || checkpoint.choices.length < 2)
    ) {
      errors.push(`${label} choices must include at least 2 options.`);
    }
  });

  return errors;
}

export function validateSceneV2Payload(
  payload: SceneSparkV2Payload | unknown,
): SparkValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const candidate = isPlainRecord(payload) ? payload : {};

  const learningObjective = candidate.learningObjective;
  if (typeof learningObjective !== "string" || !learningObjective.trim()) {
    errors.push("Scene v2 learningObjective is required.");
  }

  const capabilities = candidate.capabilities;
  if (!isPlainRecord(capabilities)) {
    errors.push("Scene v2 capabilities must be an object.");
  } else if (capabilities.needsNetwork) {
    errors.push("Scene v2 cannot require network access.");
  }

  const files: Record<string, unknown> = isPlainRecord(candidate.files)
    ? candidate.files
    : {};
  if (!isPlainRecord(candidate.files)) {
    errors.push("Scene v2 files must be an object.");
  }

  const fileEntries = Object.entries(files);
  if (typeof files["index.html"] !== "string" || !files["index.html"].trim()) {
    errors.push("Scene v2 requires files.index.html.");
  }

  for (const [fileName, contents] of fileEntries) {
    if (!allowedSceneV2FileNames.has(fileName)) {
      errors.push(`Scene v2 file is not allowed: ${fileName}.`);
      continue;
    }
    if (typeof contents !== "string") {
      errors.push(`Scene v2 file must be a string: ${fileName}.`);
      continue;
    }
    if (contents.length > 9_000) {
      errors.push(`Scene v2 file is too large: ${fileName}.`);
    }
  }

  const indexHtml =
    typeof files["index.html"] === "string" ? files["index.html"] : "";
  const combinedCode = fileEntries
    .filter(([, contents]) => typeof contents === "string")
    .map(([, contents]) => contents)
    .join("\n");
  const behaviorCode = [
    typeof files["script.js"] === "string" ? files["script.js"] : "",
    ...extractInlineScriptBlocks(indexHtml),
  ].join("\n");
  errors.push(...validateSceneCodeSafety(combinedCode));

  errors.push(
    ...validateSceneV2SliderAccessibility(
      candidate.controls,
      indexHtml,
      combinedCode,
    ),
  );
  errors.push(
    ...validatePointerTargetAccessibility(
      candidate.controls,
      indexHtml,
      behaviorCode,
    ),
  );

  const hasStatefulMetadata =
    (Array.isArray(candidate.controls) && candidate.controls.length > 0) ||
    (Array.isArray(candidate.checkpoints) && candidate.checkpoints.length > 0);
  if (
    hasStatefulMetadata &&
    !/\bStudiScene\s*\?*\.\s*onRestore\s*\(/i.test(combinedCode)
  ) {
    errors.push(
      "Interactive Scene v2 controls must restore progress with window.StudiScene.onRestore(...).",
    );
  }

  const externalScriptSrcs = extractExternalScriptSrcs(indexHtml);
  if (externalScriptSrcs.length > 0) {
    errors.push(
      `External script is not allowed in Scene Spark v2: ${externalScriptSrcs[0]}.`,
    );
  }

  if (/<\s*link\b[^>]*\bhref\s*=/i.test(indexHtml)) {
    errors.push(
      "External stylesheets and preloads are not allowed in Scene Spark v2.",
    );
  }

  if (/<\s*meta\b[^>]*http-equiv\s*=\s*["']?refresh/i.test(indexHtml)) {
    errors.push("Navigation by meta refresh is not allowed in Scene Spark v2.");
  }

  if (/\bhref\s*=\s*["']\s*(?:https?:|javascript:)/i.test(indexHtml)) {
    errors.push("Navigation links are not allowed in Scene Spark v2.");
  }

  if (/\btarget\s*=\s*["']?_blank/i.test(indexHtml)) {
    errors.push("Popups are not allowed in Scene Spark v2.");
  }

  if (/<iframe\b/i.test(indexHtml)) {
    errors.push("Nested iframes are not allowed in Scene Spark v2.");
  }

  if (/<form\b/i.test(indexHtml)) {
    errors.push("Forms are not allowed in Scene Spark v2.");
  }

  if (
    Array.isArray(candidate.controls) &&
    Array.isArray(candidate.checkpoints) &&
    candidate.controls.length === 0 &&
    candidate.checkpoints.length === 0
  ) {
    warnings.push("Scene v2 has no controls or checkpoints.");
  }

  errors.push(...validateSceneV2Controls(candidate.controls));
  errors.push(...validateSceneV2Checkpoints(candidate.checkpoints));

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
