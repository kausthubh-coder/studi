import { getFunctionName } from "convex/server";
import { fn } from "storybook/test";

function useStudiMockRuntime() {
  const runtime = globalThis.__STUDI_STORYBOOK_RUNTIME__;
  if (!runtime) {
    throw new Error("Missing Studi Storybook mock runtime.");
  }
  return runtime;
}

function referenceName(reference) {
  if (typeof reference === "string") {
    return reference.replace(".", ":");
  }

  try {
    return getFunctionName(reference);
  } catch {
    return "unknown:reference";
  }
}

function configuredEntry(entries, name, kind) {
  if (!Object.prototype.hasOwnProperty.call(entries, name)) {
    throw new Error(`Unhandled Storybook Convex ${kind}: ${name}`);
  }
  return entries[name];
}

function useQueryMock(reference, args) {
  const { convex } = useStudiMockRuntime();

  if (args === "skip") {
    return undefined;
  }

  const name = referenceName(reference);
  const resolver = configuredEntry(convex.queries, name, "query");
  return typeof resolver === "function" ? resolver(args) : resolver;
}

function useActionMock(reference) {
  const { convex } = useStudiMockRuntime();
  const name = referenceName(reference);
  return configuredEntry(convex.actions, name, "action");
}

function useMutationMock(reference) {
  const { convex } = useStudiMockRuntime();
  const name = referenceName(reference);
  return configuredEntry(convex.mutations, name, "mutation");
}

function AuthenticatedMock({ children }) {
  const { auth } = useStudiMockRuntime();
  return auth.status === "authenticated" ? (children ?? null) : null;
}

function AuthLoadingMock({ children }) {
  const { auth } = useStudiMockRuntime();
  return auth.status === "loading" ? (children ?? null) : null;
}

function UnauthenticatedMock({ children }) {
  const { auth } = useStudiMockRuntime();
  return auth.status === "unauthenticated" ? (children ?? null) : null;
}

function ConvexProviderMock({ children }) {
  return children ?? null;
}

export class ConvexReactClient {
  constructor(url) {
    this.url = url ?? "storybook://convex";
  }

  close() {}
}

export const useQuery = fn(useQueryMock).mockName("useQuery");
export const useAction = fn(useActionMock).mockName("useAction");
export const useMutation = fn(useMutationMock).mockName("useMutation");
export const Authenticated = fn(AuthenticatedMock).mockName("Authenticated");
export const AuthLoading = fn(AuthLoadingMock).mockName("AuthLoading");
export const Unauthenticated =
  fn(UnauthenticatedMock).mockName("Unauthenticated");
export const ConvexProvider = fn(ConvexProviderMock).mockName("ConvexProvider");
export const useConvexAuth = fn(() => {
  const { auth } = useStudiMockRuntime();
  return {
    isLoading: auth.status === "loading",
    isAuthenticated: auth.status === "authenticated",
  };
}).mockName("useConvexAuth");
