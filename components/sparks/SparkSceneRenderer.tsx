"use client";

import { memo } from "react";
import DesmosGraphScene from "@/components/sparks/scenes/DesmosGraphScene";
import CodePlaygroundScene from "@/components/sparks/scenes/CodePlaygroundScene";
import HtmlCssJsSandboxScene from "@/components/sparks/scenes/HtmlCssJsSandboxScene";
import { getSparkTypeLabel, type SparkArtifact } from "@/lib/sparks/contracts";
import { IconSparkle } from "@/components/studi-chat/icons";

type SparkSceneRendererProps = {
  artifact: SparkArtifact;
  threadId?: string | null;
  sparkInstanceId: string;
};

function getBadgeClass(kind: SparkArtifact["kind"]): string {
  if (kind === "spark_scene") return "badge-scene";
  if (kind === "spark_code_playground") return "badge-code";
  if (kind === "spark_desmos_graph") return "badge-desmos";
  return "badge-scene";
}

const SparkSceneRenderer = memo(function SparkSceneRenderer({
  artifact,
  threadId,
  sparkInstanceId,
}: SparkSceneRendererProps) {
  const scene =
    artifact.kind === "spark_scene" ? (
      <HtmlCssJsSandboxScene payload={artifact.payload} />
    ) : artifact.kind === "spark_desmos_graph" ? (
      <DesmosGraphScene payload={artifact.payload} />
    ) : (
      <CodePlaygroundScene
        payload={artifact.payload}
        threadId={threadId}
        sparkTitle={artifact.title}
        sparkInstanceId={sparkInstanceId}
      />
    );

  const badgeClass = getBadgeClass(artifact.kind);

  return (
    // data-spark-kind drives type-specific bar tinting via CSS cascade
    <section
      className="animate-scale-in my-5"
      data-spark-kind={artifact.kind}
    >
      <header className="mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={`spark-type-badge ${badgeClass}`}>
            <IconSparkle className="h-3 w-3" />
            {getSparkTypeLabel(artifact.sparkType)}
          </span>
        </div>
        <p
          className="mt-2 font-brand text-lg leading-snug text-fg"
        >
          {artifact.title}
        </p>
        {artifact.summary && (
          <p
            className="mt-1 text-sm text-fg-muted"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            {artifact.summary}
          </p>
        )}
      </header>

      {scene}
    </section>
  );
});

export default SparkSceneRenderer;
