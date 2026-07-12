import type { ThreadSummary } from "@/components/studi-chat/types";

export const storyThreads = [
  {
    threadId: "thread_story_derivatives",
    title: "Understanding derivatives",
    lastMessageAt: Date.UTC(2026, 6, 10, 16, 0, 0),
  },
  {
    threadId: "thread_story_physics",
    title: "Newton's laws",
    lastMessageAt: Date.UTC(2026, 6, 8, 16, 0, 0),
  },
  {
    threadId: "thread_story_new",
    title: "New Thread",
  },
] satisfies ThreadSummary[];
