"use client";

import { memo, useCallback } from "react";
import DesmosGraphScene from "@/components/sparks/scenes/DesmosGraphScene";
import CodePlaygroundScene from "@/components/sparks/scenes/CodePlaygroundScene";
import HtmlCssJsSandboxScene from "@/components/sparks/scenes/HtmlCssJsSandboxScene";
import WebPlaygroundScene from "@/components/sparks/scenes/WebPlaygroundScene";
import QuizScene from "@/components/sparks/scenes/QuizScene";
import FlashCardScene from "@/components/sparks/scenes/FlashCardScene";
import { getSparkTypeLabel, type SparkArtifact } from "@/lib/sparks/contracts";
import { IconSparkle, IconExpand } from "@/components/studi-chat/icons";

type SparkSceneRendererProps = {
  artifact: SparkArtifact;
  threadId?: string | null;
  sparkInstanceId: string;
  onExpandSpark: (
    artifact: SparkArtifact,
    threadId: string | null,
    sparkInstanceId: string,
  ) => void;
  onOpenLab?: () => void;
  expandedSparkInstanceId: string | null;
};

function getBadgeClass(kind: SparkArtifact["kind"]): string {
  if (kind === "spark_scene") return "badge-scene";
  if (kind === "spark_quiz") return "badge-quiz";
  if (kind === "spark_flash_card") return "badge-flash";
  if (kind === "spark_code_playground") return "badge-code";
  if (kind === "spark_web_playground") return "badge-quiz";
  if (kind === "spark_desmos_graph") return "badge-desmos";
  return "badge-scene";
}

const SparkSceneRenderer = memo(function SparkSceneRenderer({
  artifact,
  threadId,
  sparkInstanceId,
  onExpandSpark,
  onOpenLab,
  expandedSparkInstanceId,
}: SparkSceneRendererProps) {
  const isExpandable =
    artifact.kind === "spark_scene" ||
    artifact.kind === "spark_desmos_graph" ||
    artifact.kind === "spark_code_playground" ||
    artifact.kind === "spark_web_playground";
  const isExpanded =
    isExpandable && expandedSparkInstanceId === sparkInstanceId;
  const isCodePlayground = artifact.kind === "spark_code_playground";
  const badgeClass = getBadgeClass(artifact.kind);

  const handleExpand = useCallback(() => {
    onExpandSpark(artifact, threadId ?? null, sparkInstanceId);
  }, [artifact, threadId, sparkInstanceId, onExpandSpark]);

  /* ── Minimized state — shown in chat when spark is open in side panel ── */
  if (isExpanded) {
    return (
      <section
        className="spark-card spark-card-minimized"
        data-spark-kind={artifact.kind}
      >
        <span className={`spark-type-badge ${badgeClass}`}>
          <IconSparkle className="h-3 w-3" />
          {getSparkTypeLabel(artifact.sparkType)}
        </span>
        <p className="spark-card-min-title">{artifact.title}</p>
        <span className="spark-card-viewing">Viewing&nbsp;&rarr;</span>
      </section>
    );
  }

  /* ── Full inline card ── */
  const scene =
    artifact.kind === "spark_scene" ? (
      <HtmlCssJsSandboxScene payload={artifact.payload} isExpanded={false} />
    ) : artifact.kind === "spark_quiz" ? (
      <QuizScene payload={artifact.payload} isExpanded={false} />
    ) : artifact.kind === "spark_flash_card" ? (
      <FlashCardScene payload={artifact.payload} isExpanded={false} />
    ) : artifact.kind === "spark_desmos_graph" ? (
      <DesmosGraphScene payload={artifact.payload} isExpanded={false} />
    ) : artifact.kind === "spark_web_playground" ? (
      <WebPlaygroundScene payload={artifact.payload} isExpanded={false} />
    ) : (
      <CodePlaygroundScene
        payload={artifact.payload}
        threadId={threadId}
        sparkTitle={artifact.title}
        sparkInstanceId={sparkInstanceId}
        isExpanded={false}
        onExpand={handleExpand}
        onOpenLab={onOpenLab}
      />
    );

  return (
    <section className="spark-card" data-spark-kind={artifact.kind}>
      {/* Scene / Desmos get an integrated card header; Code handles its own */}
      {!isCodePlayground && (
        <div className="spark-card-header">
          <span className={`spark-type-badge ${badgeClass}`}>
            <IconSparkle className="h-3 w-3" />
            {getSparkTypeLabel(artifact.sparkType)}
          </span>
          <div className="spark-card-header-text">
            <p className="spark-card-title">{artifact.title}</p>
            {artifact.summary && (
              <p className="spark-card-summary">{artifact.summary}</p>
            )}
          </div>
          {isExpandable ? (
            <button
              type="button"
              className="spark-card-expand"
              onClick={handleExpand}
              aria-label="Expand spark"
            >
              <IconExpand />
              <span>Expand</span>
            </button>
          ) : null}
        </div>
      )}
      {scene}
    </section>
  );
});

export default SparkSceneRenderer;
