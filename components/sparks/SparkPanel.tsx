"use client";

import { memo } from "react";
import type { ExpandedSpark } from "@/components/studi-chat/types";
import HtmlCssJsSandboxScene from "@/components/sparks/scenes/HtmlCssJsSandboxScene";
import DesmosGraphScene from "@/components/sparks/scenes/DesmosGraphScene";
import CodePlaygroundScene from "@/components/sparks/scenes/CodePlaygroundScene";
import WebPlaygroundScene from "@/components/sparks/scenes/WebPlaygroundScene";
import QuizScene from "@/components/sparks/scenes/QuizScene";
import FlashCardScene from "@/components/sparks/scenes/FlashCardScene";
import { IconSparkle } from "@/components/studi-chat/icons";
import { getSparkTypeLabel } from "@/lib/sparks/contracts";

function getBadgeClass(kind: string): string {
  if (kind === "spark_scene") return "badge-scene";
  if (kind === "spark_quiz") return "badge-quiz";
  if (kind === "spark_flash_card") return "badge-flash";
  if (kind === "spark_code_playground") return "badge-code";
  if (kind === "spark_web_playground") return "badge-quiz";
  if (kind === "spark_desmos_graph") return "badge-desmos";
  return "badge-scene";
}

export const SparkPanel = memo(function SparkPanel({
  spark,
  onClose,
  onOpenLab,
}: {
  spark: ExpandedSpark;
  onClose: () => void;
  onOpenLab?: () => void;
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
    ) : artifact.kind === "spark_web_playground" ? (
      <WebPlaygroundScene payload={artifact.payload} isExpanded />
    ) : (
      <CodePlaygroundScene
        payload={artifact.payload}
        threadId={threadId}
        sparkTitle={artifact.title}
        sparkInstanceId={sparkInstanceId}
        onOpenLab={onOpenLab}
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
          className="spark-panel-back"
          onClick={onClose}
          aria-label="Close spark panel"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Close</span>
        </button>
      </div>
      <div className="spark-panel-body">{scene}</div>
    </div>
  );
});
