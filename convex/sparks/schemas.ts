import { z } from "zod";
import type {
  DesmosGraphPayload,
  FlashCardSparkPayload,
  QuizSparkPayload,
} from "../../lib/sparks/contracts";

export const tailwindBrowserScriptSrc =
  "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4";

export const createSparkInputSchema = z.object({
  sparkId: z
    .enum([
      "scene",
      "quiz",
      "flash_card",
      "desmos_graph",
      "code",
      "test",
    ])
    .describe(
      "Spark id to generate. Use scene, quiz, flash_card, desmos_graph, code, or test.",
    ),
  context: z
    .string()
    .min(1)
    .describe("Short description of what the learner should explore."),
  title: z
    .string()
    .optional()
    .describe("Optional display title for the spark artifact."),
  summary: z
    .string()
    .optional()
    .describe("Optional one-line display summary for the spark artifact."),
});

const desmosTableValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.null(),
]);

const desmosTableColumnSchema = z.object({
  latex: z.string().optional(),
  values: z.array(desmosTableValueSchema).optional(),
});

const desmosEquationExpressionSchema = z.object({
  id: z.string().optional(),
  type: z.literal("expression").optional(),
  latex: z.string().min(1),
  color: z.string().optional(),
  hidden: z.boolean().optional(),
});

const desmosTableExpressionSchema = z.object({
  id: z.string().optional(),
  type: z.literal("table"),
  columns: z.array(desmosTableColumnSchema).min(1),
  hidden: z.boolean().optional(),
});

const desmosTextExpressionSchema = z.object({
  id: z.string().optional(),
  type: z.literal("text"),
  text: z.string().min(1),
});

const desmosExpressionSchema = z.union([
  desmosEquationExpressionSchema,
  desmosTableExpressionSchema,
  desmosTextExpressionSchema,
]);

const desmosPayloadSchema: z.ZodType<DesmosGraphPayload> = z.object({
  expressions: z.array(desmosExpressionSchema).min(1),
  viewport: z
    .object({
      left: z.number(),
      right: z.number(),
      bottom: z.number(),
      top: z.number(),
    })
    .optional(),
  hint: z.string().optional(),
});

const quizChoiceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
});

const quizQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.array(quizChoiceSchema).min(2),
  correctChoiceId: z.string().min(1),
  explanation: z.string().optional(),
});

const quizPayloadSchema: z.ZodType<QuizSparkPayload> = z.object({
  instructions: z.string().optional(),
  questions: z.array(quizQuestionSchema).min(3),
});

const flashCardItemSchema = z.object({
  id: z.string().min(1),
  front: z.string().min(1),
  back: z.string().min(1),
});

const flashCardPayloadSchema: z.ZodType<FlashCardSparkPayload> = z.object({
  instructions: z.string().optional(),
  cards: z.array(flashCardItemSchema).min(4),
});

const sceneCapabilitiesSchema = z.object({
  usesCanvas: z.boolean().default(false),
  usesSvg: z.boolean().default(false),
  needsNetwork: z.boolean().default(false),
  recordsAnswers: z.boolean().default(false),
});

const sceneControlSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["slider", "toggle", "button", "choice"]),
  label: z.string().min(1),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  choices: z.array(z.string()).optional(),
});

const sceneCheckpointSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  answerType: z.enum(["choice", "text", "number", "boolean"]),
  choices: z.array(z.string()).optional(),
});

const sceneFilesSchema = z
  .object({
    "index.html": z.string().min(1),
    "styles.css": z.string().optional(),
    "script.js": z.string().optional(),
  })
  .strict();

export const sceneWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  version: z.literal(2),
  learningObjective: z.string().min(1),
  estimatedInteractionSeconds: z.number().optional(),
  capabilities: sceneCapabilitiesSchema,
  files: sceneFilesSchema,
  controls: z.array(sceneControlSchema),
  checkpoints: z.array(sceneCheckpointSchema),
}).strict();

export const desmosWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: desmosPayloadSchema,
});

export const quizWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: quizPayloadSchema,
});

export const flashCardWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: flashCardPayloadSchema,
});

export type SceneDraft = z.infer<typeof sceneWorkerOutputSchema>;
export type DesmosDraft = z.infer<typeof desmosWorkerOutputSchema>;
export type QuizDraft = z.infer<typeof quizWorkerOutputSchema>;
export type FlashCardDraft = z.infer<typeof flashCardWorkerOutputSchema>;
