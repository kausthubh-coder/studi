"use client";

import { useMemo, useState } from "react";
import type { SceneSparkPayload } from "@/lib/sparks/contracts";

type HtmlCssJsSandboxSceneProps = {
  payload: SceneSparkPayload;
};

type SceneTab = "preview" | "html";

const tabLabel: Record<SceneTab, string> = {
  preview: "Preview",
  html: "HTML",
};

export default function HtmlCssJsSandboxScene({
  payload,
}: HtmlCssJsSandboxSceneProps) {
  const [activeTab, setActiveTab] = useState<SceneTab>("preview");
  const [isExpanded, setIsExpanded] = useState(false);

  const srcDoc = useMemo(() => payload.html, [payload.html]);
  const sceneHeight = isExpanded ? "min(78vh, 860px)" : "420px";

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        border: "1px solid rgba(72, 113, 151, 0.32)",
        background:
          "radial-gradient(110% 150% at 10% 4%, rgba(35,64,92,0.56) 0%, rgba(9,16,29,0.97) 58%)",
        boxShadow: "0 14px 34px rgba(12, 18, 28, 0.18)",
      }}
    >
      <div
        className="flex items-center gap-1.5 px-3 py-2"
        style={{
          borderBottom: "1px solid rgba(133, 167, 201, 0.22)",
          background: "rgba(9, 16, 27, 0.45)",
        }}
      >
        {(Object.keys(tabLabel) as SceneTab[]).map((tab) => {
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="rounded-full px-3 py-1 text-xs transition-colors"
              style={{
                background: active
                  ? "rgba(156, 215, 255, 0.16)"
                  : "rgba(8, 17, 31, 0.38)",
                color: active ? "#b7eeff" : "rgba(205, 223, 242, 0.72)",
                border: active
                  ? "1px solid rgba(135, 213, 255, 0.46)"
                  : "1px solid rgba(135, 175, 210, 0.2)",
              }}
            >
              {tabLabel[tab]}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setIsExpanded((previous) => !previous)}
          aria-expanded={isExpanded}
          className="ml-auto rounded-full px-3 py-1 text-[11px] uppercase transition-colors"
          style={{
            letterSpacing: "0.08em",
            color: "rgba(212, 228, 247, 0.82)",
            border: "1px solid rgba(135, 175, 210, 0.28)",
            background: "rgba(8, 17, 31, 0.36)",
          }}
        >
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>

      <div className="p-2">
        {activeTab === "preview" ? (
          <iframe
            title="spark-scene-preview"
            srcDoc={srcDoc}
            loading="lazy"
            className="w-full rounded-xl transition-[height] duration-300"
            style={{
              height: sceneHeight,
              border: "none",
              background: "#060b14",
            }}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
        ) : (
          <pre
            className="overflow-auto rounded-xl p-4 text-xs"
            style={{
              height: sceneHeight,
              border: "1px solid rgba(133, 175, 210, 0.28)",
              background: "rgba(8, 14, 25, 0.75)",
              color: "#dce8f9",
            }}
          >
            <code>{payload.html}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
