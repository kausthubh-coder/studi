"use client";

import { memo, useCallback } from "react";
import DesmosGraphScene from "@/components/sparks/scenes/DesmosGraphScene";
import HtmlCssJsSandboxScene from "@/components/sparks/scenes/HtmlCssJsSandboxScene";
import QuizScene from "@/components/sparks/scenes/QuizScene";
import FlashCardScene from "@/components/sparks/scenes/FlashCardScene";
import CodeSparkScene from "@/components/sparks/scenes/CodeSparkScene";
import { getSparkTypeLabel, type SparkArtifact } from "@/lib/sparks/contracts";
import { getSceneSessionKey } from "@/lib/sparks/scene-session-state";
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
  expandedSparkInstanceId: string | null;
};

function getBadgeClass(kind: SparkArtifact["kind"]): string {
  if (kind === "spark_scene") return "badge-scene";
  if (kind === "spark_quiz") return "badge-quiz";
  if (kind === "spark_flash_card") return "badge-flash";
  if (kind === "spark_desmos_graph") return "badge-desmos";
  if (kind === "spark_code") return "badge-code";
  return "badge-scene";
}

const SparkSceneRenderer = memo(function SparkSceneRenderer({
  artifact,
  threadId,
  sparkInstanceId,
  onExpandSpark,
  expandedSparkInstanceId,
}: SparkSceneRendererProps) {
  const isExpandable =
    artifact.kind === "spark_scene" ||
    artifact.kind === "spark_desmos_graph" ||
    artifact.kind === "spark_code";
  const isExpanded =
    isExpandable && expandedSparkInstanceId === sparkInstanceId;
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
  let scene: React.ReactNode;
  switch (artifact.kind) {
    case "spark_scene":
      scene = (
        <HtmlCssJsSandboxScene
          payload={artifact.payload}
          isExpanded={false}
          sessionKey={getSceneSessionKey(threadId, sparkInstanceId)}
        />
      );
      break;
    case "spark_quiz":
      scene = <QuizScene payload={artifact.payload} isExpanded={false} />;
      break;
    case "spark_flash_card":
      scene = <FlashCardScene payload={artifact.payload} isExpanded={false} />;
      break;
    case "spark_desmos_graph":
      scene = (
        <DesmosGraphScene payload={artifact.payload} isExpanded={false} />
      );
      break;
    case "spark_code":
      scene = (
        <CodeSparkScene
          payload={artifact.payload}
          title={artifact.title}
          threadId={threadId}
          sparkId={artifact.artifactId ?? sparkInstanceId}
          isExpanded={false}
        />
      );
      break;
  }

  return (
    <section className="spark-card" data-spark-kind={artifact.kind}>
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
      {scene}
    </section>
  );
});

export default SparkSceneRenderer;
