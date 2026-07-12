import { fn } from "storybook/test";

function ConvexProviderWithClerkMock({ children }) {
  return children ?? null;
}

export const ConvexProviderWithClerk = fn(ConvexProviderWithClerkMock).mockName(
  "ConvexProviderWithClerk",
);
