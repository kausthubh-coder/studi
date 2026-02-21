"use client";

import HtmlCssJsSandboxScene from "@/components/sparks/scenes/HtmlCssJsSandboxScene";
import {
  getSparkTypeLabel,
  type SparkSceneArtifact,
  type SparkType,
} from "@/lib/sparks/contracts";

type SparkSceneRendererProps = {
  artifact: SparkSceneArtifact;
};

const sparkSceneRegistry: Record<
  SparkType,
  (artifact: SparkSceneArtifact) => React.JSX.Element
> = {
  scene: (artifact) => <HtmlCssJsSandboxScene payload={artifact.payload} />,
};

export default function SparkSceneRenderer({
  artifact,
}: SparkSceneRendererProps) {
  const renderScene = sparkSceneRegistry[artifact.sparkType];

  return (
    <section
      className="my-4 overflow-hidden rounded-xl"
      style={{
        border: "1px solid rgba(168,92,58,0.25)",
        background:
          "linear-gradient(180deg, rgba(168,92,58,0.10) 0%, rgba(168,92,58,0.04) 100%)",
      }}
    >
      <header
        className="px-4 py-3"
        style={{ borderBottom: "1px solid rgba(168,92,58,0.2)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] uppercase"
            style={{
              letterSpacing: "0.08em",
              color: "var(--accent)",
              border: "1px solid rgba(168,92,58,0.35)",
            }}
          >
            Spark Scene
          </span>
          <span className="text-xs" style={{ color: "var(--fg-faint)" }}>
            {getSparkTypeLabel(artifact.sparkType)}
          </span>
        </div>
        <p
          className="mt-2 font-heading text-sm leading-snug"
          style={{ color: "var(--fg)" }}
        >
          {artifact.title}
        </p>
        {artifact.summary && (
          <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
            {artifact.summary}
          </p>
        )}
      </header>

      <div className="p-3">{renderScene(artifact)}</div>
    </section>
  );
}
