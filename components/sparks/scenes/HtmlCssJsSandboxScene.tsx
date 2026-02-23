"use client";

import { memo, useMemo } from "react";
import type { SceneSparkPayload } from "@/lib/sparks/contracts";

type HtmlCssJsSandboxSceneProps = {
  payload: SceneSparkPayload;
  isExpanded: boolean;
};

const HtmlCssJsSandboxScene = memo(function HtmlCssJsSandboxScene({
  payload,
  isExpanded,
}: HtmlCssJsSandboxSceneProps) {
  const srcDoc = useMemo(() => payload.html, [payload.html]);

  return (
    <div className="spark-scene-content">
      <iframe
        title="spark-scene-preview"
        srcDoc={srcDoc}
        loading="lazy"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        style={{ height: isExpanded ? "100%" : "440px" }}
      />
    </div>
  );
});

export default HtmlCssJsSandboxScene;
