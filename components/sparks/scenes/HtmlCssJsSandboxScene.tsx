"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { SceneSparkPayload } from "@/lib/sparks/contracts";
import { IconExpand, IconCollapse } from "@/components/studi-chat/icons";

type HtmlCssJsSandboxSceneProps = {
  payload: SceneSparkPayload;
};

export default function HtmlCssJsSandboxScene({
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
        <div className="spark-scene-bar">
          <span className="font-heading text-[11px] text-fg-muted">
            Preview
          </span>
          <button
            type="button"
            onClick={openModal}
            className="spark-scene-expand"
            aria-label="Expand spark"
          >
            <IconExpand />
            <span>Expand</span>
          </button>
        </div>
        <iframe
          title="spark-scene-preview"
          srcDoc={srcDoc}
          loading="lazy"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={{ height: "420px" }}
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
                <div className="spark-scene-bar">
                  <span className="font-heading text-[11px] text-fg-muted">
                    Preview
                  </span>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="spark-scene-expand"
                    aria-label="Close expanded spark"
                  >
                    <IconCollapse />
                    <span>Close</span>
                  </button>
                </div>
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
}
