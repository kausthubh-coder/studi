"use client";

import { useAction } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectToSandbox,
  type SandboxClient,
} from "@codesandbox/sdk/browser";
import {
  deserializeSandboxSession,
  type SerializedSandboxSession,
} from "@/lib/lab/clientSession";
import { isPreviewablePort } from "@/lib/lab/preview";

type ConnectionState = "connecting" | "connected" | "disconnected";

type UseLabSandboxClientResult = {
  sandbox: SandboxClient | null;
  connectionState: ConnectionState;
  error: string | null;
  availablePorts: number[];
  reconnect: () => Promise<void>;
};

const createLabClientSessionRef =
  "labIde:createLabClientSession" as unknown as FunctionReference<
    "action",
    "public",
    {
      threadId: string;
      sessionId?: string;
    },
    SerializedSandboxSession
  >;

async function disposeSandboxClient(client: SandboxClient | null) {
  if (!client) {
    return;
  }

  await client.disconnect().catch(() => undefined);
  client.dispose();
}

export function useLabSandboxClient(threadId: string): UseLabSandboxClientResult {
  const createLabClientSession = useAction(createLabClientSessionRef);
  const createLabClientSessionRefValue = useRef(createLabClientSession);
  const clientRef = useRef<SandboxClient | null>(null);
  const requestIdRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [availablePorts, setAvailablePorts] = useState<number[]>([]);
  const [sandbox, setSandbox] = useState<SandboxClient | null>(null);

  useEffect(() => {
    createLabClientSessionRefValue.current = createLabClientSession;
  }, [createLabClientSession]);

  const reconnect = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setConnectionState("connecting");
    setError(null);

    const previousClient = clientRef.current;
    clientRef.current = null;
    setSandbox(null);
    setAvailablePorts([]);

    await disposeSandboxClient(previousClient);

    try {
      const initialSession = deserializeSandboxSession(
        await createLabClientSessionRefValue.current({
          threadId,
          sessionId: sessionIdRef.current ?? undefined,
        }),
      );
      const nextClient = await connectToSandbox({
        session: initialSession,
        getSession: async (sessionId) =>
          deserializeSandboxSession(
            await createLabClientSessionRefValue.current({
              threadId,
              sessionId,
            }),
          ),
        onFocusChange: (cb) => {
          const handleFocus = () => cb(true);
          const handleBlur = () => cb(false);
          window.addEventListener("focus", handleFocus);
          window.addEventListener("blur", handleBlur);
          return () => {
            window.removeEventListener("focus", handleFocus);
            window.removeEventListener("blur", handleBlur);
          };
        },
      });

      if (requestIdRef.current !== requestId) {
        await disposeSandboxClient(nextClient);
        return;
      }

      nextClient.keepActiveWhileConnected(true);
      sessionIdRef.current = initialSession.sessionId ?? null;

      const knownPorts = await nextClient.ports.getAll().catch(() => []);
      setAvailablePorts(
        Array.from(
          new Set(
            knownPorts
              .map((entry) => entry.port)
              .filter((port) => isPreviewablePort(port)),
          ),
        ).sort((a, b) => a - b),
      );

      nextClient.ports.onDidPortOpen((entry) => {
        if (!isPreviewablePort(entry.port)) {
          return;
        }
        setAvailablePorts((previous) =>
          Array.from(new Set([...previous, entry.port])).sort((a, b) => a - b),
        );
      });

      nextClient.ports.onDidPortClose((port) => {
        setAvailablePorts((previous) =>
          previous.filter((candidate) => candidate !== port),
        );
      });

      clientRef.current = nextClient;
      setSandbox(nextClient);
      setConnectionState("connected");
    } catch (caughtError) {
      if (requestIdRef.current !== requestId) {
        return;
      }

      setConnectionState("disconnected");
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to connect the lab sandbox.",
      );
    }
  }, [threadId]);

  useEffect(() => {
    sessionIdRef.current = null;
    queueMicrotask(() => {
      void reconnect();
    });
    return () => {
      requestIdRef.current += 1;
      const currentClient = clientRef.current;
      clientRef.current = null;
      setSandbox(null);
      void disposeSandboxClient(currentClient);
    };
  }, [threadId, reconnect]);

  return {
    sandbox,
    connectionState,
    error,
    availablePorts,
    reconnect,
  };
}
