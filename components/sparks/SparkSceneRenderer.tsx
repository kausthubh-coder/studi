"use client";

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

export default function SparkSceneRenderer({
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

  return (
    <section className="animate-scale-in my-5">
      <header className="mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full border border-accent-dim bg-accent-dim px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-accent">
            <IconSparkle className="h-3 w-3" />
            Spark
          </span>
          <span className="text-xs text-fg-faint">
            {getSparkTypeLabel(artifact.sparkType)}
          </span>
        </div>
        <p className="mt-2 font-heading text-base leading-snug text-fg">
          {artifact.title}
        </p>
        {artifact.summary && (
          <p className="mt-1 text-sm text-fg-muted">{artifact.summary}</p>
        )}
      </header>

      {scene}
    </section>
  );
}
