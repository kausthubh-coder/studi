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

  const srcDoc = useMemo(() => payload.html, [payload.html]);

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--border)", background: "var(--bg-alt)" }}
    >
      <div
        className="flex items-center gap-1 px-2 py-2"
        style={{ borderBottom: "1px solid var(--border-faint)" }}
      >
        {(Object.keys(tabLabel) as SceneTab[]).map((tab) => {
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="rounded-md px-2.5 py-1 text-xs transition-colors"
              style={{
                background: active ? "var(--accent-dim)" : "transparent",
                color: active ? "var(--accent)" : "var(--fg-muted)",
              }}
            >
              {tabLabel[tab]}
            </button>
          );
        })}
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[10px] uppercase"
          style={{
            letterSpacing: "0.08em",
            color: "var(--fg-faint)",
            border: "1px solid var(--border)",
          }}
        >
          Read only
        </span>
      </div>

      <div className="p-3">
        {activeTab === "preview" ? (
          <iframe
            title="spark-scene-preview"
            srcDoc={srcDoc}
            loading="lazy"
            className="w-full rounded-md"
            style={{ height: 280, border: "1px solid var(--border-faint)" }}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
          />
        ) : (
          <pre
            className="max-h-[280px] overflow-auto rounded-md p-3 text-xs"
            style={{
              border: "1px solid var(--border-faint)",
              background: "#1d1a16",
              color: "#f4efe8",
            }}
          >
            <code>{payload.html}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
