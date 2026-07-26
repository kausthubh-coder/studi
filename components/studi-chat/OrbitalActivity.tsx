import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { IconChevronDown } from "@/components/studi-chat/icons";
import type {
  ActivityStep,
  AgentUiState,
} from "@/components/studi-chat/MessageRenderer";

type OrbitMode =
  | "settle"
  | "reasoning"
  | "tool"
  | "spark"
  | "answering"
  | "error";

const MAX_SATELLITES = 4;
const TRAIL_LAYERS = 2;

const ORBIT_PRESETS: Record<
  OrbitMode,
  {
    count: number;
    radius: number;
    speed: number;
    rgb: [number, number, number];
    coreScale: number;
  }
> = {
  settle: {
    count: 1,
    radius: 8,
    speed: 0.1,
    rgb: [176, 160, 144],
    coreScale: 0.75,
  },
  reasoning: {
    count: 1,
    radius: 30,
    speed: 0.5,
    rgb: [58, 158, 138],
    coreScale: 1,
  },
  tool: {
    count: 3,
    radius: 22,
    speed: 1.4,
    rgb: [58, 158, 138],
    coreScale: 1.05,
  },
  spark: {
    count: 4,
    radius: 34,
    speed: 2,
    rgb: [232, 160, 48],
    coreScale: 1.4,
  },
  answering: {
    count: 1,
    radius: 12,
    speed: 0.85,
    rgb: [224, 90, 58],
    coreScale: 1.15,
  },
  error: {
    count: 2,
    radius: 20,
    speed: 0.2,
    rgb: [176, 74, 74],
    coreScale: 1,
  },
};

function orbitModeForKind(
  phase: AgentUiState["phase"],
  activeStepKind: ActivityStep["kind"] | undefined,
  hasFinalText: boolean,
  hasError: boolean,
): OrbitMode {
  if (hasError) return "error";
  if (hasFinalText) return "answering";
  if (phase === "spark" || activeStepKind === "spark") return "spark";
  if (phase === "tool" || activeStepKind === "tool") return "tool";
  if (phase === "reasoning" || activeStepKind === "reasoning") {
    return "reasoning";
  }
  return "settle";
}

function modeCaption(mode: OrbitMode): string {
  switch (mode) {
    case "reasoning":
      return "Thinking it through";
    case "tool":
      return "Looking into it";
    case "spark":
      return "Building an interactive Spark";
    case "answering":
      return "Writing the explanation";
    case "error":
      return "Ran into a problem";
    default:
      return "Studi's steps";
  }
}

function OrbitalScene({ mode }: { mode: OrbitMode }) {
  const coreRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const pingRef = useRef<HTMLDivElement>(null);
  const satelliteRefs = useRef<(HTMLDivElement | null)[]>([]);
  const trailRefs = useRef<(HTMLDivElement | null)[][]>(
    Array.from({ length: TRAIL_LAYERS }, () =>
      Array(MAX_SATELLITES).fill(null),
    ),
  );
  const modeRef = useRef<OrbitMode>(mode);
  const prevModeRef = useRef<OrbitMode>(mode);
  const reducedMotionRef = useRef(false);
  const currentRef = useRef({
    radius: ORBIT_PRESETS[mode].radius,
    speed: ORBIT_PRESETS[mode].speed,
    count: ORBIT_PRESETS[mode].count,
    coreScale: ORBIT_PRESETS[mode].coreScale,
    rgb: [...ORBIT_PRESETS[mode].rgb] as [number, number, number],
  });
  const satelliteStateRef = useRef(
    Array.from({ length: MAX_SATELLITES }, (_, index) => ({
      angle: (index / MAX_SATELLITES) * Math.PI * 2,
      opacity: 0,
    })),
  );

  const applyStaticFrame = useCallback((targetMode: OrbitMode) => {
    const preset = ORBIT_PRESETS[targetMode];
    const color = `rgb(${preset.rgb.join(",")})`;
    if (coreRef.current) {
      coreRef.current.style.transform = `translate(-50%, -50%) scale(${preset.coreScale})`;
      coreRef.current.style.background = color;
    }
    if (glowRef.current) {
      glowRef.current.style.background = color;
      glowRef.current.style.opacity = "0.35";
    }
    satelliteRefs.current.forEach((element, index) => {
      if (!element) return;
      const visible = index < preset.count;
      const angle =
        (index / Math.max(preset.count, 1)) * Math.PI * 2;
      const orbitRadius = preset.radius * (1 + index * 0.2);
      const x = Math.cos(angle) * orbitRadius;
      const y = Math.sin(angle) * orbitRadius * 0.36;
      element.style.background = color;
      element.style.opacity = visible ? "0.9" : "0";
      element.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(0.85)`;
    });
    trailRefs.current.forEach((layer) => {
      layer.forEach((element) => {
        if (element) element.style.opacity = "0";
      });
    });
  }, []);

  useEffect(() => {
    modeRef.current = mode;
    if (reducedMotionRef.current) applyStaticFrame(mode);
    if (
      mode === "spark" &&
      prevModeRef.current !== "spark" &&
      pingRef.current &&
      !reducedMotionRef.current
    ) {
      const element = pingRef.current;
      element.classList.remove("is-active");
      void element.offsetWidth;
      element.classList.add("is-active");
    }
    prevModeRef.current = mode;
  }, [applyStaticFrame, mode]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    reducedMotionRef.current = mediaQuery.matches;

    if (mediaQuery.matches) {
      applyStaticFrame(modeRef.current);
      return;
    }

    let animationFrame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      const preset = ORBIT_PRESETS[modeRef.current];
      const current = currentRef.current;
      const easing = Math.min(delta * 4, 1);
      current.radius += (preset.radius - current.radius) * easing;
      current.speed +=
        (preset.speed - current.speed) * Math.min(delta * 3, 1);
      current.count +=
        (preset.count - current.count) * Math.min(delta * 5, 1);
      current.coreScale +=
        (preset.coreScale - current.coreScale) * easing;
      current.rgb[0] += (preset.rgb[0] - current.rgb[0]) * easing;
      current.rgb[1] += (preset.rgb[1] - current.rgb[1]) * easing;
      current.rgb[2] += (preset.rgb[2] - current.rgb[2]) * easing;

      const color = `rgb(${current.rgb[0].toFixed(0)}, ${current.rgb[1].toFixed(0)}, ${current.rgb[2].toFixed(0)})`;
      if (coreRef.current) {
        coreRef.current.style.transform = `translate(-50%, -50%) scale(${current.coreScale.toFixed(3)})`;
        coreRef.current.style.background = color;
      }
      if (glowRef.current) {
        glowRef.current.style.background = color;
        glowRef.current.style.transform = `translate(-50%, -50%) scale(${(current.coreScale * 1.2).toFixed(3)})`;
      }

      satelliteStateRef.current.forEach((satellite, index) => {
        const speedFactor = 1 / (1 + index * 0.32);
        const radiusFactor = 1 + index * 0.24;
        const squash = 0.3 + (index % MAX_SATELLITES) * 0.045;
        satellite.angle += current.speed * speedFactor * delta;
        const visible = index < Math.round(current.count) ? 1 : 0;
        satellite.opacity +=
          (visible - satellite.opacity) * Math.min(delta * 6, 1);

        const radius = current.radius * radiusFactor;
        const depth = Math.sin(satellite.angle);
        const scale = 0.55 + ((depth + 1) / 2) * 0.6;
        const x = Math.cos(satellite.angle) * radius;
        const y = depth * radius * squash;
        const element = satelliteRefs.current[index];
        if (element) {
          element.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(2)})`;
          element.style.opacity = (
            satellite.opacity *
            (0.5 + ((depth + 1) / 2) * 0.5)
          ).toFixed(2);
          element.style.background = color;
          element.style.zIndex = depth > 0 ? "2" : "0";
        }

        for (let layer = 0; layer < TRAIL_LAYERS; layer += 1) {
          const trailAngle = satellite.angle - (layer + 1) * 0.22;
          const trailDepth = Math.sin(trailAngle);
          const trailScale =
            (0.4 + ((trailDepth + 1) / 2) * 0.45) *
            (1 - layer * 0.26);
          const trailX = Math.cos(trailAngle) * radius;
          const trailY = trailDepth * radius * squash;
          const trail = trailRefs.current[layer][index];
          if (!trail) continue;
          trail.style.transform = `translate(-50%, -50%) translate(${trailX.toFixed(1)}px, ${trailY.toFixed(1)}px) scale(${trailScale.toFixed(2)})`;
          trail.style.opacity = (
            satellite.opacity *
            (0.32 - layer * 0.12) *
            (0.5 + ((trailDepth + 1) / 2) * 0.5)
          ).toFixed(2);
          trail.style.background = color;
        }
      });
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [applyStaticFrame]);

  return (
    <div
      className="activity-orbital-scene"
      data-testid="orbital-scene"
      aria-hidden
    >
      <div className="activity-orbital-ring" />
      <div className="activity-orbital-ring activity-orbital-ring-outer" />
      <div className="activity-orbital-glow" ref={glowRef} />
      <div className="activity-orbital-ping" ref={pingRef} />
      <div className="activity-orbital-core" ref={coreRef} />
      {Array.from({ length: MAX_SATELLITES }).flatMap((_, index) =>
        Array.from({ length: TRAIL_LAYERS }).map((__, layer) => (
          <div
            key={`trail-${index}-${layer}`}
            className="activity-orbital-trail"
            ref={(element) => {
              trailRefs.current[layer][index] = element;
            }}
          />
        )),
      )}
      {Array.from({ length: MAX_SATELLITES }).map((_, index) => (
        <div
          key={`satellite-${index}`}
          className="activity-orbital-satellite"
          ref={(element) => {
            satelliteRefs.current[index] = element;
          }}
        />
      ))}
    </div>
  );
}

export function OrbitalActivity({
  messageKey,
  phase,
  steps,
  isStreaming,
  finalText,
}: {
  messageKey: string;
  phase: AgentUiState["phase"];
  steps: ActivityStep[];
  isStreaming: boolean;
  finalText: string;
}) {
  const shouldStayOpen = isStreaming && finalText.trim().length === 0;
  const [collapsed, setCollapsed] = useState(!shouldStayOpen);

  useEffect(() => {
    if (shouldStayOpen) {
      const timer = window.setTimeout(() => setCollapsed(false), 0);
      return () => window.clearTimeout(timer);
    }
    if (!isStreaming) return;
    const timer = window.setTimeout(() => setCollapsed(true), 900);
    return () => window.clearTimeout(timer);
  }, [isStreaming, shouldStayOpen]);

  if (steps.length === 0) return null;

  const activeStep = steps.find((step) => step.status === "active");
  const errorStep = steps.find((step) => step.status === "error");
  const hasError = Boolean(errorStep);
  const mode = orbitModeForKind(
    phase,
    activeStep?.kind,
    finalText.trim().length > 0,
    hasError,
  );
  const panelId = `${messageKey}-orbital-steps`;

  return (
    <div
      className="activity-orbital-block not-prose"
      data-mode={mode}
      data-error={hasError || undefined}
    >
      <button
        type="button"
        className="activity-orbital-toggle"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        aria-controls={panelId}
      >
        <span
          className="activity-orbital-toggle-dot"
          data-mode={mode}
          aria-hidden
        />
        <span>
          {collapsed
            ? errorStep?.label ?? "Studi's steps"
            : modeCaption(mode)}
        </span>
        <IconChevronDown
          className={`activity-orbital-chevron${collapsed ? "" : " is-open"}`}
        />
      </button>

      {!collapsed ? (
        <div id={panelId} className="activity-orbital-panel">
          <OrbitalScene mode={mode} />
          <ul className="activity-orbital-step-list">
            {steps.map((step) => (
              <li
                key={step.id}
                data-status={step.status}
                data-kind={step.kind}
              >
                <span className="activity-orbital-step-dot" aria-hidden />
                <span>{step.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
