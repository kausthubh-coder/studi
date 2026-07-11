"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { SceneSparkPayload } from "@/lib/sparks/contracts";
import {
  buildSceneSrcDoc,
  isStudiSceneMessage,
} from "@/lib/sparks/scene-runtime";
import {
  getSceneSessionState,
  recordSceneSessionMessage,
} from "@/lib/sparks/scene-session-state";

type HtmlCssJsSandboxSceneProps = {
  payload: SceneSparkPayload;
  isExpanded: boolean;
  sessionKey?: string;
};

const HtmlCssJsSandboxScene = memo(function HtmlCssJsSandboxScene({
  payload,
  isExpanded,
  sessionKey,
}: HtmlCssJsSandboxSceneProps) {
  const srcDoc = useMemo(() => buildSceneSrcDoc(payload), [payload]);

  return (
    <SandboxFrame
      key={srcDoc}
      srcDoc={srcDoc}
      isExpanded={isExpanded}
      sessionKey={sessionKey}
    />
  );
});

const SandboxFrame = memo(function SandboxFrame({
  srcDoc,
  isExpanded,
  sessionKey,
}: {
  srcDoc: string;
  isExpanded: boolean;
  sessionKey?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [height, setHeight] = useState(440);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setStatus((currentStatus) =>
        currentStatus === "ready" ? currentStatus : "failed",
      );
      setErrorMessage(
        (currentMessage) =>
          currentMessage ?? "Scene did not report that it was ready.",
      );
    }, 5_000);

    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      if (!isStudiSceneMessage(event.data)) {
        return;
      }

      if (sessionKey) {
        recordSceneSessionMessage(sessionKey, event.data);
      }

      if (event.data.type === "ready") {
        setStatus("ready");
        setErrorMessage(null);
        const sessionState = sessionKey
          ? getSceneSessionState(sessionKey)
          : null;
        if (sessionState) {
          iframeRef.current?.contentWindow?.postMessage(
            {
              source: "studi-host",
              version: 1,
              type: "restore",
              payload: { state: JSON.stringify(sessionState) },
            },
            "*",
          );
        }
        return;
      }

      if (event.data.type === "resize") {
        const nextHeight = event.data.payload?.height;
        if (typeof nextHeight === "number" && Number.isFinite(nextHeight)) {
          setHeight(Math.max(220, Math.min(1200, nextHeight)));
        }
        return;
      }

      if (event.data.type === "error") {
        setStatus("failed");
        const message = event.data.payload?.message;
        setErrorMessage(
          typeof message === "string" && message.trim()
            ? message.trim()
            : "Scene reported an error.",
        );
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage);
    };
  }, [sessionKey]);

  return (
    <div className="spark-scene-content">
      <iframe
        ref={iframeRef}
        title="spark-scene-preview"
        srcDoc={srcDoc}
        loading="lazy"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        style={{ height: isExpanded ? "100%" : `${height}px` }}
      />
      {status === "loading" ? (
        <div className="spark-scene-status" role="status">
          Loading scene...
        </div>
      ) : null}
      {status === "failed" ? (
        <div
          className="spark-scene-status spark-scene-status-error"
          role="alert"
        >
          {errorMessage ?? "Scene could not start."}
        </div>
      ) : null}
    </div>
  );
});

export default HtmlCssJsSandboxScene;
