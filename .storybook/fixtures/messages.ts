import type { UIMessage } from "@convex-dev/agent/react";

import { derivativeQuizArtifact } from "./sparks";

function storyMessage(message: Record<string, unknown>): UIMessage {
  return message as unknown as UIMessage;
}

export const learnerDerivativeQuestion = storyMessage({
  id: "message_story_user_derivative",
  key: "message_story_user_derivative",
  order: 0,
  stepOrder: 0,
  role: "user",
  status: "done",
  text: "Why is a derivative a slope?",
  parts: [{ type: "text", text: "Why is a derivative a slope?" }],
  _creationTime: Date.UTC(2026, 6, 10, 16, 0, 0),
});

export const tutorDerivativeAnswer = storyMessage({
  id: "message_story_assistant_derivative",
  key: "message_story_assistant_derivative",
  order: 1,
  stepOrder: 0,
  role: "assistant",
  status: "done",
  text: "",
  parts: [
    {
      type: "text",
      text: "Imagine two nearby points on $y=x^2$. What happens to the secant line as the points move together?",
    },
  ],
  _creationTime: Date.UTC(2026, 6, 10, 16, 0, 5),
});

export const tutorStreamingReasoning = storyMessage({
  id: "message_story_assistant_streaming",
  key: "message_story_assistant_streaming",
  order: 2,
  stepOrder: 0,
  role: "assistant",
  status: "streaming",
  text: "",
  parts: [
    {
      type: "reasoning",
      state: "streaming",
      text: "Choosing a concrete visual that keeps the learner predicting.",
    },
  ],
  _creationTime: Date.UTC(2026, 6, 10, 16, 0, 8),
});

export const tutorQuizSparkAnswer = storyMessage({
  id: "message_story_assistant_spark",
  key: "message_story_assistant_spark",
  order: 3,
  stepOrder: 0,
  role: "assistant",
  status: "done",
  text: "Try the check, then tell me what made the correct choice click.",
  parts: [
    {
      type: "tool-create_spark",
      state: "output-available",
      input: {
        sparkId: "quiz",
        context: "Check the learner's derivative intuition.",
      },
      output: {
        status: "success",
        workerSummary: "Built a one-question derivative quiz.",
        warnings: [],
        artifact: derivativeQuizArtifact,
      },
    },
    {
      type: "text",
      text: "Try the check, then tell me what made the correct choice click.",
    },
  ],
  _creationTime: Date.UTC(2026, 6, 10, 16, 0, 12),
});

export const derivativeConversation = [
  learnerDerivativeQuestion,
  tutorDerivativeAnswer,
];
