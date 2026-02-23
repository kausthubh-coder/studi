"use client";

import { memo } from "react";
import type { ExpandedSpark } from "@/components/studi-chat/types";
import HtmlCssJsSandboxScene from "@/components/sparks/scenes/HtmlCssJsSandboxScene";
import DesmosGraphScene from "@/components/sparks/scenes/DesmosGraphScene";
import CodePlaygroundScene from "@/components/sparks/scenes/CodePlaygroundScene";
import QuizScene from "@/components/sparks/scenes/QuizScene";
import FlashCardScene from "@/components/sparks/scenes/FlashCardScene";
import { IconSparkle } from "@/components/studi-chat/icons";
import { getSparkTypeLabel } from "@/lib/sparks/contracts";

function getBadgeClass(kind: string): string {
  if (kind === "spark_scene") return "badge-scene";
  if (kind === "spark_quiz") return "badge-scene";
  if (kind === "spark_flash_card") return "badge-scene";
  if (kind === "spark_code_playground") return "badge-code";
  if (kind === "spark_desmos_graph") return "badge-desmos";
  return "badge-scene";
}

export const SparkPanel = memo(function SparkPanel({
  spark,
  onClose,
}: {
  spark: ExpandedSpark;
  onClose: () => void;
}) {
  const { artifact, threadId, sparkInstanceId } = spark;

  const scene =
    artifact.kind === "spark_scene" ? (
      <HtmlCssJsSandboxScene payload={artifact.payload} isExpanded />
    ) : artifact.kind === "spark_quiz" ? (
      <QuizScene payload={artifact.payload} isExpanded />
    ) : artifact.kind === "spark_flash_card" ? (
      <FlashCardScene payload={artifact.payload} isExpanded />
    ) : artifact.kind === "spark_desmos_graph" ? (
      <DesmosGraphScene payload={artifact.payload} isExpanded />
    ) : (
      <CodePlaygroundScene
        payload={artifact.payload}
        threadId={threadId}
        sparkTitle={artifact.title}
        sparkInstanceId={sparkInstanceId}
        isExpanded
      />
    );

  const badgeClass = getBadgeClass(artifact.kind);

  return (
    <div className="spark-panel" data-spark-kind={artifact.kind}>
      <div className="spark-panel-header">
        <span className={`spark-type-badge ${badgeClass}`}>
          <IconSparkle className="h-3 w-3" />
          {getSparkTypeLabel(artifact.sparkType)}
        </span>
        <p className="spark-panel-title">{artifact.title}</p>
        <button
          type="button"
          className="spark-scene-expand"
          onClick={onClose}
          aria-label="Close spark panel"
        >
          <span>Close</span>
        </button>
      </div>
      <div className="spark-panel-body">{scene}</div>
    </div>
  );
});
