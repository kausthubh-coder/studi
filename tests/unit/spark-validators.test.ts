import { describe, expect, it } from "vitest";
import {
  normalizeSparkSceneDraft,
  sparkSceneV2Version,
} from "@/lib/sparks/contracts";
import {
  normalizeSceneHtmlWithTemplate,
  validateDesmosPayload,
  validateFlashCardPayload,
  validateQuizPayload,
  validateSceneHtml,
  validateSceneV2Payload,
} from "@/convex/sparks/validators";

describe("spark validators", () => {
  it("normalizes scene html into a full document with the allowed tailwind script", () => {
    const normalized = normalizeSceneHtmlWithTemplate("<div>Hello</div>");

    expect(normalized.toLowerCase()).toContain("<!doctype html>");
    expect(normalized).toContain("<html");
    expect(normalized).toContain("<head");
    expect(normalized).toContain("<body");
    expect(normalized).toContain(
      "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4",
    );
  });

  it("accepts a valid normalized scene and rejects disallowed external scripts", () => {
    const valid = validateSceneHtml(
      normalizeSceneHtmlWithTemplate("<div>Graph</div>"),
    );
    expect(valid.ok).toBe(true);

    const invalid = validateSceneHtml(
      '<!doctype html><html><head><script src="https://evil.example.com/x.js"></script></head><body></body></html>',
    );
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(" ")).toMatch(/External script/i);
  });

  it("validates scene v2 files and blocks unsafe browser capabilities", () => {
    const valid = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "See how the input changes the output.",
      files: {
        "index.html": '<main><button id="try">Try</button></main>',
        "styles.css": "main { min-height: 260px; }",
        "script.js": "window.StudiScene?.ready();",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: false,
        recordsAnswers: false,
      },
      controls: [],
      checkpoints: [],
    });
    expect(valid.ok).toBe(true);

    const invalid = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Sneak data out.",
      files: {
        "index.html": "<main>Bad</main>",
        "script.js":
          "fetch('https://example.com'); localStorage.setItem('x', 'y'); eval('1 + 1');",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: true,
        recordsAnswers: false,
      },
      controls: [],
      checkpoints: [],
    });

    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(" ")).toMatch(/fetch|storage|eval|network/i);
  });

  it("rejects scene v2 external scripts, navigation, oversized files, and invalid metadata", () => {
    const invalid = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "",
      files: {
        "index.html":
          '<main><a href="https://example.com" target="_blank">Leave</a><script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script><meta http-equiv="refresh" content="0;url=https://example.com"></main>',
        "script.js":
          "window.location.href = 'https://example.com'; window.open('https://example.com');",
        "styles.css": "body {}".repeat(2_000),
        "bad.js": "console.log('nope')",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: false,
        recordsAnswers: false,
      },
      controls: [
        {
          id: "",
          type: "slider",
          label: "",
          min: 10,
          max: 1,
        },
        {
          id: "choice",
          type: "choice",
          label: "Pick",
        },
      ],
      checkpoints: [
        {
          id: "checkpoint",
          prompt: "Pick one.",
          answerType: "choice",
        },
      ],
    } as never);

    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(" ")).toMatch(/learningObjective/i);
    expect(invalid.errors.join(" ")).toMatch(/External script/i);
    expect(invalid.errors.join(" ")).toMatch(/Navigation|Popups/i);
    expect(invalid.errors.join(" ")).toMatch(/too large/i);
    expect(invalid.errors.join(" ")).toMatch(/not allowed: bad\.js/i);
    expect(invalid.errors.join(" ")).toMatch(/Control 1 id/i);
    expect(invalid.errors.join(" ")).toMatch(/Control 1 label/i);
    expect(invalid.errors.join(" ")).toMatch(
      /Control 1 min must be less than max/i,
    );
    expect(invalid.errors.join(" ")).toMatch(/Control 2 choices/i);
    expect(invalid.errors.join(" ")).toMatch(/Checkpoint 1 choices/i);
  });

  it("returns scene v2 metadata errors instead of throwing on malformed payloads", () => {
    const invalid = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: 42,
      files: null,
      capabilities: null,
      controls: "bad",
      checkpoints: null,
    } as never);

    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(" ")).toMatch(/learningObjective/i);
    expect(invalid.errors.join(" ")).toMatch(/files must be an object/i);
    expect(invalid.errors.join(" ")).toMatch(/capabilities must be an object/i);
    expect(invalid.errors.join(" ")).toMatch(/controls must be an array/i);
    expect(invalid.errors.join(" ")).toMatch(/checkpoints must be an array/i);
  });

  it("rejects pointer-only drag scenes without a keyboard contract", () => {
    const pointerOnly = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Move an outlier and compare mean with median.",
      files: {
        "index.html": '<main><svg><circle id="outlier"></circle></svg></main>',
        "script.js":
          "document.getElementById('outlier')?.addEventListener('pointerdown', startDrag);",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: true,
        needsNetwork: false,
        recordsAnswers: true,
      },
      controls: [
        {
          id: "outlier",
          type: "slider",
          label: "Outlier value",
          min: 0,
          max: 20,
        },
      ],
      checkpoints: [],
    });

    expect(pointerOnly.ok).toBe(false);
    expect(pointerOnly.errors.join(" ")).toMatch(/keyboard|pointer-only/i);

    const keyboardAccessible = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Move an outlier and compare mean with median.",
      files: {
        "index.html":
          '<main><svg><circle id="outlier" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="20" aria-valuenow="6"></circle></svg></main>',
        "script.js":
          "const point = document.getElementById('outlier'); point?.addEventListener('pointerdown', startDrag); point?.addEventListener('keydown', moveWithArrowKeys); window.StudiScene?.interaction('outlier', point?.getAttribute('aria-valuenow')); window.StudiScene?.onRestore((state) => restoreOutlier(state));",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: true,
        needsNetwork: false,
        recordsAnswers: true,
      },
      controls: [
        {
          id: "outlier",
          type: "slider",
          label: "Outlier value",
          min: 0,
          max: 20,
        },
      ],
      checkpoints: [],
    });

    expect(keyboardAccessible.ok).toBe(true);

    const nativeRange = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Move an outlier and compare mean with median.",
      files: {
        "index.html":
          '<main><label for="outlier">Outlier</label><input id="outlier" type="range" min="0" max="20" value="6"></main>',
        "script.js":
          "const point = document.getElementById('outlier'); point?.addEventListener('pointerdown', startDrag); point?.addEventListener('input', updateOutlier); window.StudiScene?.interaction('outlier', point?.value); window.StudiScene?.onRestore((state) => restoreOutlier(state));",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: false,
        recordsAnswers: true,
      },
      controls: [
        {
          id: "outlier",
          type: "slider",
          label: "Outlier value",
          min: 0,
          max: 20,
        },
      ],
      checkpoints: [],
    });

    expect(nativeRange.ok).toBe(true);
  });

  it("does not let one native range exempt a pointer-only SVG control", () => {
    const mixedControls = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Compare two changes to the same distribution.",
      files: {
        "index.html":
          '<main><label for="spread">Spread</label><input id="spread" type="range" min="0" max="20" value="6"><svg><circle id="outlier"></circle></svg></main>',
        "script.js":
          "const spread = document.getElementById('spread'); spread?.addEventListener('input', updateSpread); const point = document.getElementById('outlier'); point?.addEventListener('pointerdown', startDrag); window.StudiScene?.onRestore((state) => restore(state));",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: true,
        needsNetwork: false,
        recordsAnswers: true,
      },
      controls: [
        {
          id: "spread",
          type: "slider",
          label: "Spread",
          min: 0,
          max: 20,
        },
        {
          id: "outlier",
          type: "slider",
          label: "Outlier value",
          min: 0,
          max: 20,
        },
      ],
      checkpoints: [],
    });

    expect(mixedControls.ok).toBe(false);
    expect(mixedControls.errors.join(" ")).toMatch(
      /outlier.*(?:keyboard|range|slider)|(?:keyboard|range|slider).*outlier/i,
    );
  });

  it("validates pointer targets even when slider metadata is misclassified or missing", () => {
    const files = {
      "index.html":
        '<main><svg><circle id="outlier"></circle></svg></main>',
      "script.js":
        "const point = document.getElementById('outlier'); point?.addEventListener('pointerdown', startDrag); window.StudiScene?.onRestore((state) => restoreOutlier(state));",
    };
    const capabilities = {
      usesCanvas: false,
      usesSvg: true,
      needsNetwork: false,
      recordsAnswers: true,
    };

    const misclassified = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Move an outlier and compare the summaries.",
      files,
      capabilities,
      controls: [
        {
          id: "outlier",
          type: "button",
          label: "Move outlier",
        },
      ],
      checkpoints: [],
    });
    expect(misclassified.ok).toBe(false);
    expect(misclassified.errors.join(" ")).toMatch(
      /outlier.*(?:keyboard|focus|pointer)|(?:keyboard|focus|pointer).*outlier/i,
    );

    const missingMetadata = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Move an outlier and compare the summaries.",
      files,
      capabilities,
      controls: [],
      checkpoints: [],
    });
    expect(missingMetadata.ok).toBe(false);
    expect(missingMetadata.errors.join(" ")).toMatch(/outlier/i);

    const nativeButton = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Reveal a hint after making a prediction.",
      files: {
        "index.html":
          '<main><button id="hint" type="button">Show hint</button></main>',
        "script.js":
          "const hint = document.getElementById('hint'); hint?.addEventListener('pointerdown', showPressedState); hint?.addEventListener('click', revealHint); window.StudiScene?.interaction('hint', true); window.StudiScene?.onRestore((state) => restoreHint(state));",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: false,
        recordsAnswers: true,
      },
      controls: [
        {
          id: "hint",
          type: "button",
          label: "Show hint",
        },
      ],
      checkpoints: [],
    });
    expect(nativeButton.ok).toBe(true);
  });

  it("rejects a native button whose only behavior is pointerdown", () => {
    const pointerOnlyNativeButton = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Move an outlier and compare the summaries.",
      files: {
        "index.html":
          '<main><button id="outlier" type="button">Move outlier</button></main>',
        "script.js":
          "const outlier = document.getElementById('outlier'); outlier?.addEventListener('pointerdown', moveOutlier); window.StudiScene?.onRestore((state) => restoreOutlier(state));",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: false,
        recordsAnswers: true,
      },
      controls: [
        {
          id: "outlier",
          type: "button",
          label: "Move outlier",
        },
      ],
      checkpoints: [],
    });

    expect(pointerOnlyNativeButton.ok).toBe(false);
    expect(pointerOnlyNativeButton.errors.join(" ")).toMatch(
      /outlier.*(?:click|keyboard|activation)|(?:click|keyboard|activation).*outlier/i,
    );

    const pointerOnlyNativeRange = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Move an outlier and compare the summaries.",
      files: {
        "index.html":
          '<main><input id="outlier-range" type="range" min="0" max="20" value="6"></main>',
        "script.js":
          "const range = document.getElementById('outlier-range'); range?.addEventListener('pointerdown', moveOutlier); window.StudiScene?.onRestore((state) => restoreOutlier(state));",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: false,
        recordsAnswers: true,
      },
      controls: [
        {
          id: "outlier-range",
          type: "slider",
          label: "Outlier value",
          min: 0,
          max: 20,
        },
      ],
      checkpoints: [],
    });

    expect(pointerOnlyNativeRange.ok).toBe(false);
    expect(pointerOnlyNativeRange.errors.join(" ")).toMatch(
      /outlier-range.*(?:input|change|keyboard)|(?:input|change|keyboard).*outlier-range/i,
    );
  });

  it("requires stateful metadata to emit restorable host state", () => {
    const controlWithoutEmission = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Move an outlier and compare the summaries.",
      files: {
        "index.html":
          '<main><input id="outlier" type="range" min="0" max="20" value="6"></main>',
        "script.js":
          "const outlier = document.getElementById('outlier'); outlier?.addEventListener('input', updateOutlier); window.StudiScene?.onRestore((state) => restoreOutlier(state));",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: false,
        recordsAnswers: true,
      },
      controls: [
        {
          id: "outlier",
          type: "slider",
          label: "Outlier value",
          min: 0,
          max: 20,
        },
      ],
      checkpoints: [],
    });
    expect(controlWithoutEmission.ok).toBe(false);
    expect(controlWithoutEmission.errors.join(" ")).toMatch(/interaction/i);

    const checkpointWithoutEmission = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Predict whether the mean changes.",
      files: {
        "index.html":
          '<main><button id="predict" type="button">Check prediction</button></main>',
        "script.js":
          "document.getElementById('predict')?.addEventListener('click', checkPrediction); window.StudiScene?.onRestore((state) => restorePrediction(state));",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: false,
        recordsAnswers: true,
      },
      controls: [],
      checkpoints: [
        {
          id: "predict",
          prompt: "Does the mean change?",
          answerType: "boolean",
        },
      ],
    });
    expect(checkpointWithoutEmission.ok).toBe(false);
    expect(checkpointWithoutEmission.errors.join(" ")).toMatch(/checkpoint/i);

    const checkpointWithEmission = validateSceneV2Payload({
      version: sparkSceneV2Version,
      learningObjective: "Predict whether the mean changes.",
      files: {
        "index.html":
          '<main><button id="predict" type="button">Check prediction</button></main>',
        "script.js":
          "document.getElementById('predict')?.addEventListener('click', checkPrediction); window.StudiScene?.checkpoint('predict', true, true); window.StudiScene?.onRestore((state) => restorePrediction(state));",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: false,
        recordsAnswers: true,
      },
      controls: [],
      checkpoints: [
        {
          id: "predict",
          prompt: "Does the mean change?",
          answerType: "boolean",
        },
      ],
    });
    expect(checkpointWithEmission.ok).toBe(true);
  });

  it("rejects unsafe scene v2 data after draft normalization", () => {
    const artifact = normalizeSparkSceneDraft({
      version: sparkSceneV2Version,
      learningObjective: "Show why network access should be blocked.",
      files: {
        "index.html": "<main>Unsafe scene</main>",
        "styles.css": "body {}".repeat(2_000),
        "bad.js": "console.log('bad')",
      },
      capabilities: {
        usesCanvas: false,
        usesSvg: false,
        needsNetwork: true,
        recordsAnswers: false,
      },
      controls: [],
      checkpoints: [],
    });

    if (artifact.version !== sparkSceneV2Version) {
      throw new Error("Expected a scene v2 artifact.");
    }

    expect(artifact.payload.capabilities.needsNetwork).toBe(true);
    const invalid = validateSceneV2Payload(artifact.payload);
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(" ")).toMatch(/network/i);
    expect(invalid.errors.join(" ")).toMatch(/bad\.js/i);
    expect(invalid.errors.join(" ")).toMatch(/too large/i);
  });

  it("requires desmos viewport bounds to be ordered", () => {
    const ok = validateDesmosPayload({
      expressions: [{ id: "eq1", latex: "y=x^2" }],
      viewport: { left: -10, right: 10, bottom: -10, top: 10 },
    });
    expect(ok.ok).toBe(true);

    const bad = validateDesmosPayload({
      expressions: [{ id: "eq1", latex: "y=x^2" }],
      viewport: { left: 10, right: -10, bottom: 10, top: -10 },
    });
    expect(bad.ok).toBe(false);
  });

  it("validates quiz correctness and minimum question count", () => {
    const base = {
      instructions: "Pick the best answer.",
      questions: Array.from({ length: 3 }, (_unused, index) => ({
        id: `q${index}`,
        prompt: `Question ${index}?`,
        choices: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
        ],
        correctChoiceId: "a",
      })),
    };
    expect(validateQuizPayload(base).ok).toBe(true);

    const badCorrect = {
      ...base,
      questions: base.questions.map((q) => ({
        ...q,
        correctChoiceId: "missing",
      })),
    };
    expect(validateQuizPayload(badCorrect).ok).toBe(false);
  });

  it("requires at least four flash cards with front and back", () => {
    const cards = Array.from({ length: 4 }, (_unused, index) => ({
      id: `c${index}`,
      front: `Front ${index}`,
      back: `Back ${index}`,
    }));
    expect(validateFlashCardPayload({ cards }).ok).toBe(true);

    expect(validateFlashCardPayload({ cards: cards.slice(0, 2) }).ok).toBe(
      false,
    );
  });
});
