import { z } from "zod";
import type {
  CodePlaygroundPayload,
  DesmosGraphPayload,
  FlashCardSparkPayload,
  QuizSparkPayload,
  WebPlaygroundPayload,
} from "../../lib/sparks/contracts";
import {
  codePlaygroundLanguages,
  sparkTypes,
} from "../../lib/sparks/manifest";

export const tailwindBrowserScriptSrc =
  "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4";

export const createSparkInputSchema = z.object({
  sparkId: z
    .enum(sparkTypes)
    .describe(
      `Spark id to generate. Use ${sparkTypes.join(", ")}.`,
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

const codePlaygroundPayloadSchema: z.ZodType<CodePlaygroundPayload> = z.object({
  language: z.enum(codePlaygroundLanguages),
  instructions: z.string().min(1),
  starterCode: z.string().min(1),
  testCode: z.string().optional(),
  runHint: z.string().optional(),
});

const webPlaygroundPayloadSchema: z.ZodType<WebPlaygroundPayload> = z.object({
  html: z.string().min(1),
  css: z.string().optional(),
  js: z.string().optional(),
  instructions: z.string().optional(),
  runHint: z.string().optional(),
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

export const sceneWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  html: z.string(),
});

export const desmosWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: desmosPayloadSchema,
});

export const codePlaygroundWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: codePlaygroundPayloadSchema,
});

export const webPlaygroundWorkerOutputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  workerSummary: z.string(),
  payload: webPlaygroundPayloadSchema,
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
export type CodePlaygroundDraft = z.infer<
  typeof codePlaygroundWorkerOutputSchema
>;
export type WebPlaygroundDraft = z.infer<typeof webPlaygroundWorkerOutputSchema>;
export type QuizDraft = z.infer<typeof quizWorkerOutputSchema>;
export type FlashCardDraft = z.infer<typeof flashCardWorkerOutputSchema>;
