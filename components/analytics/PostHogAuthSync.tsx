"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import posthog from "posthog-js";

let logoutHandled = false;

function getPrimaryEmailDomain(emailAddress: string | undefined): string | undefined {
  if (!emailAddress) {
    return undefined;
  }

  const atIndex = emailAddress.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === emailAddress.length - 1) {
    return undefined;
  }

  return emailAddress.slice(atIndex + 1).toLowerCase();
}

export function handleExplicitPosthogLogout(route: string) {
  logoutHandled = true;
  posthog.capture("user_logged_out", {
    route,
    reason: "explicit_sign_out",
  });
  posthog.reset(true);
}

export function PostHogAuthSync() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const pathname = usePathname();
  const previousSignedInRef = useRef<boolean | null>(null);
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    if (isSignedIn && user) {
      const primaryEmail = user.primaryEmailAddress?.emailAddress;
      posthog.identify(user.id, {
        user_created_at: user.createdAt?.toISOString(),
        primary_email_domain: getPrimaryEmailDomain(primaryEmail),
      });

      if (
        previousSignedInRef.current !== true ||
        previousUserIdRef.current !== user.id
      ) {
        posthog.capture("user_logged_in", {
          route: pathname,
          auth_source: "clerk_session",
        });
      }

      previousSignedInRef.current = true;
      previousUserIdRef.current = user.id;
      return;
    }

    if (previousSignedInRef.current === true) {
      if (logoutHandled) {
        logoutHandled = false;
      } else {
        posthog.capture("user_logged_out", {
          route: pathname,
          reason: "auth_transition",
        });
        posthog.reset(true);
      }
    }

    previousSignedInRef.current = false;
    previousUserIdRef.current = null;
  }, [isLoaded, isSignedIn, pathname, user]);

  return null;
}
