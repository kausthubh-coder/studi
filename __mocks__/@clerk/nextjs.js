import React from "react";
import { fn } from "storybook/test";

const { cloneElement, createElement, isValidElement } = React;

function useStudiMockRuntime() {
  const runtime = globalThis.__STUDI_STORYBOOK_RUNTIME__;
  if (!runtime) {
    throw new Error("Missing Studi Storybook mock runtime.");
  }
  return runtime;
}

function ClerkProviderMock({ children }) {
  return children ?? null;
}

function useAuthMock() {
  const { auth } = useStudiMockRuntime();
  const authenticated = auth.status === "authenticated";
  return {
    isLoaded: auth.status !== "loading",
    isSignedIn: authenticated,
    userId: authenticated ? (auth.user?.id ?? null) : null,
    getToken: auth.getToken,
    signOut: auth.signOut,
  };
}

function useUserMock() {
  const { auth } = useStudiMockRuntime();
  const authenticated = auth.status === "authenticated";
  return {
    isLoaded: auth.status !== "loading",
    isSignedIn: authenticated,
    user: authenticated ? auth.user : null,
  };
}

function SignedInMock({ children }) {
  const { auth } = useStudiMockRuntime();
  return auth.status === "authenticated" ? (children ?? null) : null;
}

function SignedOutMock({ children }) {
  const { auth } = useStudiMockRuntime();
  return auth.status === "unauthenticated" ? (children ?? null) : null;
}

function PricingTableMock() {
  return createElement(
    "section",
    {
      "aria-label": "Storybook pricing table fixture",
      "data-clerk-mock": "pricing-table",
      style: {
        display: "grid",
        gap: "12px",
        padding: "20px",
        color: "var(--fg)",
        fontFamily: "var(--font-jakarta)",
      },
    },
    createElement("strong", null, "Mock pricing plans"),
    createElement(
      "p",
      { style: { margin: 0, color: "var(--fg-muted)" } },
      "Clerk checkout is intentionally disconnected in Storybook.",
    ),
  );
}

function UserProfileMock() {
  const { auth } = useStudiMockRuntime();
  return createElement(
    "section",
    {
      "aria-label": "Storybook user profile fixture",
      "data-clerk-mock": "user-profile",
      style: {
        display: "grid",
        gap: "8px",
        padding: "20px",
        color: "var(--fg)",
        fontFamily: "var(--font-jakarta)",
      },
    },
    createElement("strong", null, auth.user?.fullName ?? "Mock learner"),
    createElement(
      "span",
      { style: { color: "var(--fg-muted)" } },
      auth.user?.primaryEmailAddress?.emailAddress ?? "learner@storybook.test",
    ),
  );
}

function SignOutButtonMock({ children }) {
  const { auth } = useStudiMockRuntime();
  if (!isValidElement(children)) {
    return children ?? null;
  }

  const originalOnClick = children.props.onClick;
  return cloneElement(children, {
    "data-clerk-mock": "sign-out",
    onClick: async (event) => {
      originalOnClick?.(event);
      await auth.signOut();
    },
  });
}

function RedirectToSignInMock({ redirectUrl }) {
  return createElement(
    "div",
    {
      role: "status",
      "data-clerk-mock": "redirect-to-sign-in",
      "data-redirect-url": redirectUrl ?? "/",
    },
    "Sign-in redirect (mocked)",
  );
}

export const ClerkProvider = fn(ClerkProviderMock).mockName("ClerkProvider");
export const useAuth = fn(useAuthMock).mockName("useAuth");
export const useUser = fn(useUserMock).mockName("useUser");
export const SignedIn = fn(SignedInMock).mockName("SignedIn");
export const SignedOut = fn(SignedOutMock).mockName("SignedOut");
export const PricingTable = fn(PricingTableMock).mockName("PricingTable");
export const UserProfile = fn(UserProfileMock).mockName("UserProfile");
export const SignOutButton = fn(SignOutButtonMock).mockName("SignOutButton");
export const RedirectToSignIn =
  fn(RedirectToSignInMock).mockName("RedirectToSignIn");
