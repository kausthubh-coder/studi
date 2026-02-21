"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { SceneSparkPayload } from "@/lib/sparks/contracts";
import { IconExpand, IconCollapse } from "@/components/studi-chat/icons";

type HtmlCssJsSandboxSceneProps = {
  payload: SceneSparkPayload;
};

const TrafficLights = () => (
  <span className="scene-traffic-lights" aria-hidden>
    <span className="scene-tl-dot scene-tl-red" />
    <span className="scene-tl-dot scene-tl-amber" />
    <span className="scene-tl-dot scene-tl-green" />
  </span>
);

const SceneBar = memo(function SceneBar({
  onExpand,
  isModal,
}: {
  onExpand: () => void;
  isModal: boolean;
}) {
  return (
    <div className="spark-scene-bar">
      <TrafficLights />
      <span
        className="text-[11px] text-fg-muted"
        style={{ fontFamily: "var(--font-jakarta)", fontWeight: 500 }}
      >
        Scene Preview
      </span>
      <button
        type="button"
        onClick={onExpand}
        className="spark-scene-expand"
        aria-label={isModal ? "Close expanded spark" : "Expand spark"}
      >
        {isModal ? <IconCollapse /> : <IconExpand />}
        <span>{isModal ? "Close" : "Expand"}</span>
      </button>
    </div>
  );
});

const HtmlCssJsSandboxScene = memo(function HtmlCssJsSandboxScene({
  payload,
}: HtmlCssJsSandboxSceneProps) {
  const [isModal, setIsModal] = useState(false);
  const srcDoc = useMemo(() => payload.html, [payload.html]);

  const openModal = useCallback(() => setIsModal(true), []);
  const closeModal = useCallback(() => setIsModal(false), []);

  useEffect(() => {
    if (!isModal) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isModal, closeModal]);

  useEffect(() => {
    if (!isModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isModal]);

  return (
    <>
      {/* Inline preview */}
      <div className="spark-scene">
        <SceneBar onExpand={openModal} isModal={false} />
        <iframe
          title="spark-scene-preview"
          srcDoc={srcDoc}
          loading="lazy"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={{ height: "440px" }}
        />
      </div>

      {/* Modal overlay via portal */}
      {isModal &&
        createPortal(
          <div
            className="spark-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal();
            }}
          >
            <div className="spark-overlay-inner">
              <div className="spark-scene">
                <SceneBar onExpand={closeModal} isModal />
                <iframe
                  title="spark-scene-expanded"
                  srcDoc={srcDoc}
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                  style={{ height: "100%" }}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
});

export default HtmlCssJsSandboxScene;
