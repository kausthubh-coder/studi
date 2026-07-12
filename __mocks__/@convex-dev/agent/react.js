import { fn } from "storybook/test";

function useStudiMockRuntime() {
  const runtime = globalThis.__STUDI_STORYBOOK_RUNTIME__;
  if (!runtime) {
    throw new Error("Missing Studi Storybook mock runtime.");
  }
  return runtime;
}

function useUIMessagesMock(_reference, args) {
  const { agent } = useStudiMockRuntime();
  if (args === "skip") {
    return {
      results: [],
      status: "LoadingFirstPage",
      loadMore: agent.loadMore,
    };
  }

  return agent;
}

export const useUIMessages = fn(useUIMessagesMock).mockName("useUIMessages");
