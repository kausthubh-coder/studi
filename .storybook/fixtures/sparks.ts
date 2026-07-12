import {
  sparkSceneV2Version,
  sparkSceneVersion,
  type DesmosGraphPayload,
  type FlashCardSparkPayload,
  type QuizSparkPayload,
  type SceneSparkV2Payload,
  type SparkArtifact,
} from "@/lib/sparks/contracts";

export const derivativeQuizPayload = {
  instructions: "Choose an answer, then explain your prediction.",
  questions: [
    {
      id: "derivative_meaning",
      prompt: "What does a derivative describe at a point?",
      choices: [
        { id: "height", text: "The function's total height" },
        { id: "slope", text: "Its instantaneous rate of change" },
        { id: "area", text: "The area beneath the curve" },
      ],
      correctChoiceId: "slope",
      explanation:
        "The derivative is the limiting slope of secant lines near that point.",
    },
  ],
} satisfies QuizSparkPayload;

export const calculusFlashCards = {
  instructions: "Predict the back before flipping each card.",
  cards: [
    {
      id: "derivative",
      front: "Derivative",
      back: "The instantaneous rate of change of a function.",
    },
    {
      id: "tangent",
      front: "Tangent line",
      back: "A line whose slope matches the derivative at the contact point.",
    },
  ],
} satisfies FlashCardSparkPayload;

export const slopeScenePayload = {
  version: sparkSceneV2Version,
  learningObjective: "Connect a secant slope to a tangent slope.",
  estimatedInteractionSeconds: 45,
  capabilities: {
    usesCanvas: false,
    usesSvg: false,
    needsNetwork: false,
    recordsAnswers: false,
  },
  files: {
    "index.html": `
      <main class="studi-scene">
        <h2>Move the second point</h2>
        <p id="value">Secant slope: 2</p>
        <button id="ready" type="button">Try a closer point</button>
      </main>
    `,
    "styles.css":
      ".studi-scene { padding: 24px; color: var(--studi-scene-ink); }",
    "script.js": `
      window.StudiScene?.ready();
      window.StudiScene?.resize(360);
      document.querySelector('#ready')?.addEventListener('click', () => {
        document.querySelector('#value').textContent = 'Secant slope: 2.9';
      });
    `,
  },
  controls: [
    {
      id: "ready",
      type: "button",
      label: "Try a closer point",
    },
  ],
  checkpoints: [],
} satisfies SceneSparkV2Payload;

export const parabolaDesmosPayload: DesmosGraphPayload = {
  expressions: [
    { id: "parabola", latex: "y=x^2", color: "#e05a3a" },
    { id: "point", latex: "(2,4)", pointStyle: "POINT" },
  ],
  viewport: {
    left: -5,
    right: 5,
    bottom: -2,
    top: 10,
  },
  hint: "Drag the point and predict how the slope changes.",
};

export const derivativeQuizArtifact = {
  kind: "spark_quiz",
  version: sparkSceneVersion,
  sparkType: "quiz",
  mode: "editable",
  artifactId: "artifact_story_derivative_quiz",
  title: "Derivative intuition check",
  summary: "Connect a derivative with local rate of change.",
  payload: derivativeQuizPayload,
} satisfies SparkArtifact;

export const calculusFlashCardArtifact = {
  kind: "spark_flash_card",
  version: sparkSceneVersion,
  sparkType: "flash_card",
  mode: "editable",
  artifactId: "artifact_story_calculus_cards",
  title: "Calculus recall",
  summary: "Practice the vocabulary behind derivatives.",
  payload: calculusFlashCards,
} satisfies SparkArtifact;

export const slopeSceneArtifact = {
  kind: "spark_scene",
  version: sparkSceneV2Version,
  sparkType: "scene",
  mode: "editable",
  artifactId: "artifact_story_slope_scene",
  title: "Secant to tangent",
  summary: "Move one point closer and watch the secant slope converge.",
  payload: slopeScenePayload,
} satisfies SparkArtifact;

export const parabolaDesmosArtifact = {
  kind: "spark_desmos_graph",
  version: sparkSceneVersion,
  sparkType: "desmos_graph",
  mode: "editable",
  artifactId: "artifact_story_parabola",
  title: "Explore a parabola",
  summary: "Drag a point along y = x² and compare local slopes.",
  payload: parabolaDesmosPayload,
} satisfies SparkArtifact;
