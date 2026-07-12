import { createContext, useContext, useMemo, type ReactNode } from "react";
import { fn } from "storybook/test";

import { adaStoryUser } from "../fixtures/auth";
import { freePreviewBilling } from "../fixtures/billing";
import { passedCodeSparkResult } from "../fixtures/code-spark";
import type {
  StoryBackendHandler,
  StudiMockRuntime,
  StudiStoryParameters,
} from "./types";

function asyncResult<T>(name: string, value: T): StoryBackendHandler {
  return fn(async () => value).mockName(name);
}

function createDefaultRuntime(): StudiMockRuntime {
  return {
    auth: {
      status: "authenticated",
      user: adaStoryUser,
      getToken: fn(async () => null).mockName("storybookGetToken"),
      signOut: fn(async () => undefined).mockName("storybookSignOut"),
    },
    convex: {
      queries: {
        "chat:listThreads": [],
        "billing:getViewerBillingState": freePreviewBilling,
        "codeSparks:getSessionForSpark": null,
      },
      actions: {
        "chatActions:sendFirstMessage": asyncResult("sendFirstMessage", {
          threadId: "thread_story_created",
        }),
        "chatActions:sendMessage": asyncResult("sendMessage", null),
        "chatActions:deleteThread": asyncResult("deleteThread", {
          deleted: true,
        }),
        "billingActions:syncCurrentUserBillingProfile": asyncResult(
          "syncCurrentUserBillingProfile",
          { planKey: "free_onboarding", status: "onboarding" },
        ),
        "waitlistPublic:joinWaitlist": asyncResult("joinWaitlist", {
          success: true,
          alreadyOnList: false,
        }),
        "codeSparkActions:run": asyncResult(
          "runCodeSpark",
          passedCodeSparkResult,
        ),
      },
      mutations: {
        "chat:backfillThreadActivityForCurrentUser": asyncResult(
          "backfillThreadActivityForCurrentUser",
          { scanned: 0, patched: 0 },
        ),
        "chat:generateUploadUrl": asyncResult(
          "generateUploadUrl",
          "storybook://upload",
        ),
        "chat:saveAttachment": asyncResult("saveAttachment", {
          attachmentId: "attachment_story_upload",
          filename: "story-notes.png",
          mimeType: "image/png",
          size: 128,
        }),
        "codeSparks:upsertSessionFromArtifact": asyncResult(
          "upsertCodeSparkSession",
          {},
        ),
        "codeSparks:writeFile": asyncResult("writeCodeSparkFile", {}),
      },
    },
    agent: {
      results: [],
      status: "Exhausted",
      loadMore: fn().mockName("loadMoreUIMessages"),
    },
  };
}

function mergeRuntime(
  defaults: StudiMockRuntime,
  overrides: StudiStoryParameters | undefined,
): StudiMockRuntime {
  if (!overrides) {
    return defaults;
  }

  return {
    auth: {
      ...defaults.auth,
      ...overrides.auth,
    },
    convex: {
      queries: {
        ...defaults.convex.queries,
        ...overrides.convex?.queries,
      },
      actions: {
        ...defaults.convex.actions,
        ...overrides.convex?.actions,
      },
      mutations: {
        ...defaults.convex.mutations,
        ...overrides.convex?.mutations,
      },
    },
    agent: {
      ...defaults.agent,
      ...overrides.agent,
    },
  };
}

const StudiMockContext = createContext<StudiMockRuntime | null>(null);

export function StudiMockProvider({
  children,
  parameters,
}: {
  children: ReactNode;
  parameters?: StudiStoryParameters;
}) {
  const runtime = useMemo(
    () => mergeRuntime(createDefaultRuntime(), parameters),
    [parameters],
  );

  // Storybook's manual mocks are separate modules, so expose the active fixture
  // synchronously before child hooks render.
  // eslint-disable-next-line react-hooks/immutability
  globalThis.__STUDI_STORYBOOK_RUNTIME__ = runtime;

  return (
    <StudiMockContext.Provider value={runtime}>
      {children}
    </StudiMockContext.Provider>
  );
}

export function useStudiMockRuntime(): StudiMockRuntime {
  const runtime = useContext(StudiMockContext);
  if (!runtime) {
    throw new Error(
      "Studi Storybook mocks must render inside StudiMockProvider.",
    );
  }
  return runtime;
}
