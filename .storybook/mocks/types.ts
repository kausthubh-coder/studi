import type { UIMessage } from "@convex-dev/agent/react";

export type StoryAuthStatus = "loading" | "authenticated" | "unauthenticated";

export type StoryClerkUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  primaryEmailAddress: {
    emailAddress: string;
  } | null;
};

export type StoryAuthRuntime = {
  status: StoryAuthStatus;
  user: StoryClerkUser | null;
  getToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
};

export type StoryQueryResolver = unknown | ((args: unknown) => unknown);

export type StoryBackendHandler = (
  args?: Record<string, unknown>,
) => unknown | Promise<unknown>;

export type StoryConvexRuntime = {
  queries: Record<string, StoryQueryResolver>;
  actions: Record<string, StoryBackendHandler>;
  mutations: Record<string, StoryBackendHandler>;
};

export type StoryAgentRuntime = {
  results: UIMessage[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (numItems: number) => void;
};

export type StudiMockRuntime = {
  auth: StoryAuthRuntime;
  convex: StoryConvexRuntime;
  agent: StoryAgentRuntime;
};

declare global {
  // Storybook external-package mocks are optimized into Vite's cache, so they
  // cannot safely import workspace files by a relative path. The preview
  // provider installs the isolated per-story runtime here before rendering.
  var __STUDI_STORYBOOK_RUNTIME__: StudiMockRuntime | undefined;
}

export type StudiStoryParameters = {
  auth?: Partial<StoryAuthRuntime>;
  convex?: {
    queries?: Record<string, StoryQueryResolver>;
    actions?: Record<string, StoryBackendHandler>;
    mutations?: Record<string, StoryBackendHandler>;
  };
  agent?: Partial<StoryAgentRuntime>;
};
