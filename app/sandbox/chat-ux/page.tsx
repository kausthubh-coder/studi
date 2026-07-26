"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  IconArrow,
  IconChevronDown,
  IconPlus,
} from "@/components/studi-chat/icons";

/**
 * Isolated chat UX playground — mock data only, no Convex/Clerk wiring.
 * Lets us A/B different ways to surface agent "thinking" state and the
 * composer's send↔stop control before touching the real StudiChat component.
 *
 * Design rule this file is built around: the *fact* that Studi is working,
 * and roughly what on, is always visible (composer status line). The
 * *detail* of how it got there collapses to a small reopenable chip the
 * moment an answer starts appearing — a tutor doesn't make you read its
 * scratch work, but it doesn't hide it either.
 */

type StepKind = "reasoning" | "tool" | "spark";
type StepStatus = "pending" | "active" | "complete";

type Step = {
  id: string;
  kind: StepKind;
  label: string;
  detail: string;
  status: StepStatus;
};

type Phase = "idle" | "reading" | "working" | "answering" | "done" | "stopped";

type AgentVariant =
  | "marginalia"
  | "notebook"
  | "whisper"
  | "orbital"
  | "constellation"
  | "inkbloom";
type ComposerMode = "banner" | "morph";

const SCRIPT: {
  kind: StepKind;
  label: string;
  detail: string;
  duration: number;
}[] = [
  {
    kind: "reasoning",
    label: "Reading your question",
    detail: "Compound interest, monthly contributions, a 10-year horizon.",
    duration: 900,
  },
  {
    kind: "reasoning",
    label: "Recalling the compound interest formula",
    detail: "A = P(1 + r/n)^(nt) — checking which pieces you already gave me.",
    duration: 1200,
  },
  {
    kind: "tool",
    label: "Looking up a growth example",
    detail: "Pulling numbers for a simple, relatable case.",
    duration: 1000,
  },
  {
    kind: "spark",
    label: "Building an interactive Spark",
    detail: "A growth chart you can drag and explore.",
    duration: 1700,
  },
  {
    kind: "reasoning",
    label: "Drafting an explanation",
    detail: "Leading with intuition before the formula.",
    duration: 1000,
  },
];

const QUESTION = "Can you help me understand how compound interest works?";

const ANSWER =
  "Great question — let's build this from intuition first.\n\n" +
  "**Compound interest** means you earn interest not just on what you put in, but on the interest you've already earned. Money makes money, which then makes more money.\n\n" +
  "Picture $1,000 growing at 8% a year. After year one you have $1,080. In year two, you earn 8% on $1,080 — not $1,000 — so you gain $86.40 instead of $80.\n\n" +
  "I dropped a Spark below so you can drag the interest rate and years yourself.\n\n" +
  "That small extra bit is compounding. Stretch it over 10 years and it stops looking small.";

function makeSteps(): Step[] {
  return SCRIPT.map((step, index) => ({
    id: `step-${index}`,
    kind: step.kind,
    label: step.label,
    detail: step.detail,
    status: "pending" as StepStatus,
  }));
}

function formatThinkingLabel(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `Thought for ${seconds}s`;
}

function useTutorRun() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<Step[]>(makeSteps);
  const [revealedAnswer, setRevealedAnswer] = useState("");
  const [runId, setRunId] = useState(0);
  const [thinkingMs, setThinkingMs] = useState<number | null>(null);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);

  const clearAll = useCallback(() => {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearAll();
    setPhase("idle");
    setSteps(makeSteps());
    setRevealedAnswer("");
    setThinkingMs(null);
  }, [clearAll]);

  const stop = useCallback(() => {
    clearAll();
    setPhase("stopped");
    setThinkingMs(performance.now() - startedAtRef.current);
    setSteps((prev) =>
      prev.map((step) =>
        step.status === "active" ? { ...step, status: "pending" } : step,
      ),
    );
  }, [clearAll]);

  const start = useCallback(() => {
    clearAll();
    setRevealedAnswer("");
    setSteps(makeSteps());
    setThinkingMs(null);
    setPhase("reading");
    setRunId((id) => id + 1);
    startedAtRef.current = performance.now();

    let elapsed = 300;
    timers.current.push(setTimeout(() => setPhase("working"), elapsed));

    SCRIPT.forEach((step, index) => {
      const startAt = elapsed;
      timers.current.push(
        setTimeout(() => {
          setSteps((prev) =>
            prev.map((s, i) =>
              i === index
                ? { ...s, status: "active" }
                : i < index
                  ? { ...s, status: "complete" }
                  : s,
            ),
          );
        }, startAt),
      );
      elapsed += step.duration;
      const endAt = elapsed;
      timers.current.push(
        setTimeout(() => {
          setSteps((prev) =>
            prev.map((s, i) =>
              i === index ? { ...s, status: "complete" } : s,
            ),
          );
        }, endAt),
      );
    });

    timers.current.push(
      setTimeout(() => {
        setPhase("answering");
        setThinkingMs(performance.now() - startedAtRef.current);
        const words = ANSWER.split(" ");
        let count = 0;
        intervalRef.current = setInterval(() => {
          count += 1;
          setRevealedAnswer(words.slice(0, count).join(" "));
          if (count >= words.length) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = null;
            setPhase("done");
          }
        }, 38);
      }, elapsed + 250),
    );
  }, [clearAll]);

  useEffect(() => clearAll, [clearAll]);

  const isBusy =
    phase === "reading" || phase === "working" || phase === "answering";

  const activeStep = steps.find((s) => s.status === "active");

  const statusLabel = useMemo(() => {
    switch (phase) {
      case "reading":
        return "Reading your question…";
      case "working":
        return activeStep ? `${activeStep.label}…` : "Thinking it through…";
      case "answering":
        return "Writing the explanation…";
      case "stopped":
        return "Stopped — nothing else will be added.";
      case "done":
        return "Done.";
      default:
        return "";
    }
  }, [phase, activeStep]);

  return {
    phase,
    steps,
    revealedAnswer,
    isBusy,
    statusLabel,
    runId,
    thinkingMs,
    activeStepKind: activeStep?.kind,
    start,
    stop,
    reset,
  };
}

/** Shared progressive-disclosure hook: detail stays open while `stayOpen`
 * is true, then tucks itself away (after a short beat) the moment it flips
 * false — e.g. the instant the answer starts streaming. Always reopenable. */
function useAutoCollapse(stayOpen: boolean, delayMs = 900) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!stayOpen) {
      const timer = setTimeout(() => setCollapsed(true), delayMs);
      return () => clearTimeout(timer);
    }
  }, [stayOpen, delayMs]);
  return [collapsed, setCollapsed] as const;
}

/* ── Tiny inline icons kept local to the sandbox ─────────────── */

function IconStop({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m17 3 4 4L7 21l-4 1 1-4Z" />
    </svg>
  );
}

/* ── Answer text formatting (lightweight, no markdown pipeline) ─ */

function formatAnswer(text: string): React.ReactNode {
  const paragraphs = text.split("\n\n");
  return paragraphs.map((paragraph, pIndex) => (
    <p key={pIndex} className={pIndex > 0 ? "mt-3" : ""}>
      {paragraph.split(/(\*\*[^*]+\*\*)/g).map((chunk, cIndex) => {
        if (chunk.startsWith("**") && chunk.endsWith("**")) {
          return <strong key={cIndex}>{chunk.slice(2, -2)}</strong>;
        }
        return <span key={cIndex}>{chunk}</span>;
      })}
    </p>
  ));
}

function SparkPreviewCard() {
  return (
    <div className="sandbox-spark-card not-prose">
      <div className="sandbox-spark-card-header">
        <span className="sandbox-spark-dot" aria-hidden />
        Interest growth — drag to explore
      </div>
      <div className="sandbox-spark-card-body">
        <svg viewBox="0 0 220 70" className="sandbox-spark-svg" aria-hidden>
          <path
            d="M4 62 C 50 58, 90 45, 130 30 C 160 18, 190 10, 216 6"
            fill="none"
            stroke="var(--accent3)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

/* ── Agent-state variant renderers ───────────────────────────── */

function MarginaliaNotes({
  steps,
  phase,
  thinkingMs,
}: {
  steps: Step[];
  phase: Phase;
  thinkingMs: number | null;
}) {
  const stayOpen = phase === "reading" || phase === "working";
  const [collapsed, setCollapsed] = useAutoCollapse(stayOpen);
  if (phase === "idle") return null;

  const isStreaming = stayOpen;
  const collapsedLabel =
    phase === "stopped"
      ? "Stopped early"
      : thinkingMs
        ? formatThinkingLabel(thinkingMs)
        : "Studi's notes";

  return (
    <div className="sandbox-margin-col">
      <button
        type="button"
        className="sandbox-margin-toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span
          className="sandbox-margin-toggle-dot"
          data-active={isStreaming}
          aria-hidden
        />
        <span className="sandbox-margin-heading">
          {collapsed ? collapsedLabel : "Studi's notes"}
        </span>
        <IconChevronDown
          className={`sandbox-chevron${!collapsed ? " is-open" : ""}`}
        />
      </button>
      {!collapsed && (
        <>
          <div className="sandbox-margin-rule" />
          {steps.map((step) => (
            <div
              key={step.id}
              className="sandbox-margin-note"
              data-status={step.status}
              data-kind={step.kind}
            >
              <span className="sandbox-margin-dot" aria-hidden />
              <div>
                <p className="sandbox-margin-label">{step.label}</p>
                {step.status !== "pending" && (
                  <p className="sandbox-margin-detail">{step.detail}</p>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function NotebookActivity({
  steps,
  phase,
  thinkingMs,
}: {
  steps: Step[];
  phase: Phase;
  thinkingMs: number | null;
}) {
  const stayOpen = phase === "reading" || phase === "working";
  const [collapsed, setCollapsed] = useAutoCollapse(stayOpen);
  if (phase === "idle") return null;

  const completedCount = steps.filter((s) => s.status === "complete").length;
  const collapsedLabel =
    phase === "stopped"
      ? "Stopped early"
      : thinkingMs
        ? formatThinkingLabel(thinkingMs)
        : "Studi's notes";

  return (
    <div className="sandbox-notebook-card" data-streaming={stayOpen}>
      <button
        type="button"
        className="sandbox-notebook-header"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <IconPencil className="sandbox-notebook-pencil" />
        <span>{collapsed ? collapsedLabel : "Studi's notes"}</span>
        {!collapsed && (
          <span className="sandbox-notebook-count">
            {completedCount}/{steps.length}
          </span>
        )}
        <IconChevronDown
          className={`sandbox-chevron${!collapsed ? " is-open" : ""}`}
        />
      </button>
      {!collapsed && (
        <ul className="sandbox-notebook-list">
          {steps.map((step) => (
            <li
              key={step.id}
              className="sandbox-notebook-item"
              data-status={step.status}
              data-kind={step.kind}
            >
              <span className="sandbox-notebook-check" aria-hidden>
                {step.status === "complete" ? "✓" : ""}
              </span>
              <div>
                <p className="sandbox-notebook-label">{step.label}</p>
                {step.status !== "pending" && (
                  <p className="sandbox-notebook-detail">{step.detail}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WhisperLine({
  phase,
  statusLabel,
  steps,
  thinkingMs,
}: {
  phase: Phase;
  statusLabel: string;
  steps: Step[];
  thinkingMs: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  if (phase === "idle") return null;

  const isStreaming = phase === "reading" || phase === "working";
  if (isStreaming) {
    return (
      <p className="sandbox-whisper-line" role="status" aria-live="polite">
        {statusLabel}
      </p>
    );
  }

  const collapsedLabel =
    phase === "stopped"
      ? "Stopped early"
      : thinkingMs
        ? formatThinkingLabel(thinkingMs)
        : "Studi thought about this";

  return (
    <div className="sandbox-whisper-collapsed">
      <button
        type="button"
        className="sandbox-whisper-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="sandbox-whisper-toggle-dot" aria-hidden />
        {collapsedLabel}
        <IconChevronDown
          className={`sandbox-chevron${expanded ? " is-open" : ""}`}
        />
      </button>
      {expanded && (
        <ul className="sandbox-whisper-detail-list">
          {steps.map((step) => (
            <li key={step.id} data-kind={step.kind}>
              {step.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Orbital variant: pseudo-3D orbit whose shape eases toward a
 * different "physics" target per phase (reasoning/tool/spark/answering).
 * Satellites sit on slightly different orbital planes (own radius/squash/
 * speed), trail two fading ghosts each, and the core+glow color itself
 * eases through RGB space rather than snapping between phases. */

type OrbitMode = "settle" | "reasoning" | "tool" | "spark" | "answering";

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
  settle: { count: 1, radius: 8, speed: 0.1, rgb: [176, 160, 144], coreScale: 0.75 },
  reasoning: { count: 1, radius: 30, speed: 0.5, rgb: [58, 158, 138], coreScale: 1 },
  tool: { count: 3, radius: 22, speed: 1.4, rgb: [58, 158, 138], coreScale: 1.05 },
  spark: { count: 4, radius: 34, speed: 2, rgb: [232, 160, 48], coreScale: 1.4 },
  answering: { count: 1, radius: 12, speed: 0.85, rgb: [224, 90, 58], coreScale: 1.15 },
};

function orbitModeForKind(phase: Phase, kind: StepKind | undefined): OrbitMode {
  if (phase === "reading") return "reasoning";
  if (phase === "working") {
    if (kind === "spark") return "spark";
    if (kind === "tool") return "tool";
    return "reasoning";
  }
  if (phase === "answering") return "answering";
  return "settle";
}

function modeCaption(mode: OrbitMode): string {
  switch (mode) {
    case "reasoning":
      return "Thinking it through";
    case "tool":
      return "Looking something up";
    case "spark":
      return "Building a Spark";
    case "answering":
      return "Writing the explanation";
    default:
      return "Settled";
  }
}

function OrbitalScene({ mode }: { mode: OrbitMode }) {
  const coreRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const pingRef = useRef<HTMLDivElement>(null);
  const satelliteRefs = useRef<(HTMLDivElement | null)[]>([]);
  const trailRefs = useRef<(HTMLDivElement | null)[][]>(
    Array.from({ length: TRAIL_LAYERS }, () => Array(MAX_SATELLITES).fill(null)),
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
    Array.from({ length: MAX_SATELLITES }, (_, i) => ({
      angle: (i / MAX_SATELLITES) * Math.PI * 2,
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
    satelliteRefs.current.forEach((el, i) => {
      if (!el) return;
      const visible = i < preset.count;
      const angle = (i / Math.max(preset.count, 1)) * Math.PI * 2;
      const orbitRadius = preset.radius * (1 + i * 0.2);
      const x = Math.cos(angle) * orbitRadius;
      const y = Math.sin(angle) * orbitRadius * 0.36;
      el.style.background = color;
      el.style.opacity = visible ? "0.9" : "0";
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(0.85)`;
    });
    trailRefs.current.forEach((layer) => {
      layer.forEach((el) => {
        if (el) el.style.opacity = "0";
      });
    });
  }, []);

  useEffect(() => {
    modeRef.current = mode;
    if (reducedMotionRef.current) {
      applyStaticFrame(mode);
    }
    // Fire a brief expanding "ignition" ring the instant a Spark build
    // starts — the one moment worth a distinct flourish rather than a
    // smooth ease.
    if (
      mode === "spark" &&
      prevModeRef.current !== "spark" &&
      pingRef.current &&
      !reducedMotionRef.current
    ) {
      const el = pingRef.current;
      el.classList.remove("is-active");
      void el.offsetWidth;
      el.classList.add("is-active");
    }
    prevModeRef.current = mode;
  }, [mode, applyStaticFrame]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;

    if (reducedMotionRef.current) {
      applyStaticFrame(modeRef.current);
      return;
    }

    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const preset = ORBIT_PRESETS[modeRef.current];
      const cur = currentRef.current;
      // Exponential easing toward the phase's target values — an organic,
      // spring-flavored transition rather than an instant state-snap.
      // Color eases through RGB space too, like temperature settling.
      const k = Math.min(dt * 4, 1);
      cur.radius += (preset.radius - cur.radius) * k;
      cur.speed += (preset.speed - cur.speed) * Math.min(dt * 3, 1);
      cur.count += (preset.count - cur.count) * Math.min(dt * 5, 1);
      cur.coreScale += (preset.coreScale - cur.coreScale) * k;
      cur.rgb[0] += (preset.rgb[0] - cur.rgb[0]) * k;
      cur.rgb[1] += (preset.rgb[1] - cur.rgb[1]) * k;
      cur.rgb[2] += (preset.rgb[2] - cur.rgb[2]) * k;

      const colorStr = `rgb(${cur.rgb[0].toFixed(0)}, ${cur.rgb[1].toFixed(0)}, ${cur.rgb[2].toFixed(0)})`;

      if (coreRef.current) {
        coreRef.current.style.transform = `translate(-50%, -50%) scale(${cur.coreScale.toFixed(3)})`;
        coreRef.current.style.background = colorStr;
      }
      if (glowRef.current) {
        glowRef.current.style.background = colorStr;
        glowRef.current.style.transform = `translate(-50%, -50%) scale(${(cur.coreScale * 1.2).toFixed(3)})`;
      }

      satelliteStateRef.current.forEach((sat, i) => {
        // Outer satellites orbit slower and wider — a loose nod to real
        // orbital mechanics rather than every dot moving identically.
        const speedFactor = 1 / (1 + i * 0.32);
        const radiusFactor = 1 + i * 0.24;
        const squash = 0.3 + (i % MAX_SATELLITES) * 0.045;

        sat.angle += cur.speed * speedFactor * dt;
        const visible = i < Math.round(cur.count) ? 1 : 0;
        sat.opacity += (visible - sat.opacity) * Math.min(dt * 6, 1);

        const satRadius = cur.radius * radiusFactor;
        const depth = Math.sin(sat.angle);
        const scale = 0.55 + ((depth + 1) / 2) * 0.6;
        const x = Math.cos(sat.angle) * satRadius;
        const y = depth * satRadius * squash;

        const el = satelliteRefs.current[i];
        if (el) {
          el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${scale.toFixed(2)})`;
          el.style.opacity = (sat.opacity * (0.5 + ((depth + 1) / 2) * 0.5)).toFixed(2);
          el.style.background = colorStr;
          el.style.zIndex = depth > 0 ? "2" : "0";
        }

        // Two trailing ghosts per satellite, sampled at earlier angles —
        // a comet tail with no history buffer needed.
        for (let layer = 0; layer < TRAIL_LAYERS; layer += 1) {
          const trailAngle = sat.angle - (layer + 1) * 0.22;
          const tDepth = Math.sin(trailAngle);
          const tScale = (0.4 + ((tDepth + 1) / 2) * 0.45) * (1 - layer * 0.26);
          const tx = Math.cos(trailAngle) * satRadius;
          const ty = tDepth * satRadius * squash;
          const tEl = trailRefs.current[layer][i];
          if (!tEl) continue;
          tEl.style.transform = `translate(-50%, -50%) translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${tScale.toFixed(2)})`;
          tEl.style.opacity = (
            sat.opacity *
            (0.32 - layer * 0.12) *
            (0.5 + ((tDepth + 1) / 2) * 0.5)
          ).toFixed(2);
          tEl.style.background = colorStr;
        }
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyStaticFrame]);

  return (
    <div className="sandbox-orbital-scene" aria-hidden="true">
      <div className="sandbox-orbital-ring" />
      <div className="sandbox-orbital-ring sandbox-orbital-ring-outer" />
      <div className="sandbox-orbital-glow" ref={glowRef} />
      <div className="sandbox-orbital-ping" ref={pingRef} />
      <div className="sandbox-orbital-core" ref={coreRef} />
      {Array.from({ length: MAX_SATELLITES }).flatMap((_, i) =>
        Array.from({ length: TRAIL_LAYERS }).map((_, layer) => (
          <div
            key={`trail-${i}-${layer}`}
            className="sandbox-orbital-trail"
            ref={(el) => {
              trailRefs.current[layer][i] = el;
            }}
          />
        )),
      )}
      {Array.from({ length: MAX_SATELLITES }).map((_, i) => (
        <div
          key={`sat-${i}`}
          className="sandbox-orbital-satellite"
          ref={(el) => {
            satelliteRefs.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}

function OrbitalActivity({
  phase,
  steps,
  activeStepKind,
  thinkingMs,
}: {
  phase: Phase;
  steps: Step[];
  activeStepKind: StepKind | undefined;
  thinkingMs: number | null;
}) {
  const stayOpen = phase === "reading" || phase === "working";
  const [collapsed, setCollapsed] = useAutoCollapse(stayOpen);
  if (phase === "idle") return null;

  const mode = orbitModeForKind(phase, activeStepKind);
  const collapsedLabel =
    phase === "stopped"
      ? "Stopped early"
      : thinkingMs
        ? formatThinkingLabel(thinkingMs)
        : "Studi's steps";

  return (
    <div className="sandbox-orbital-block">
      <button
        type="button"
        className="sandbox-orbital-toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span
          className="sandbox-orbital-toggle-dot"
          data-mode={mode}
          aria-hidden
        />
        <span>{collapsed ? collapsedLabel : modeCaption(mode)}</span>
        <IconChevronDown
          className={`sandbox-chevron${!collapsed ? " is-open" : ""}`}
        />
      </button>

      {!collapsed && (
        <div className="sandbox-orbital-panel">
          <OrbitalScene mode={mode} />
          <ul className="sandbox-step-list">
            {steps.map((step) => (
              <li
                key={step.id}
                data-status={step.status}
                data-kind={step.kind}
              >
                <span className="sandbox-step-list-dot" aria-hidden />
                {step.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Constellation variant: steps light up as stars and connect
 * themselves into a small constellation as the tutor works through them —
 * a literal "connecting the dots" for a learning product. Pure CSS/SVG
 * transitions driven by React state, no animation loop needed. */

function ConstellationActivity({
  phase,
  steps,
  thinkingMs,
}: {
  phase: Phase;
  steps: Step[];
  thinkingMs: number | null;
}) {
  const stayOpen = phase === "reading" || phase === "working";
  const [collapsed, setCollapsed] = useAutoCollapse(stayOpen);
  if (phase === "idle") return null;

  const completeCount = steps.filter((s) => s.status === "complete").length;
  const gaps = Math.max(steps.length - 1, 1);
  const fraction = Math.min(1, completeCount / gaps);

  const collapsedLabel =
    phase === "stopped"
      ? "Stopped early"
      : thinkingMs
        ? formatThinkingLabel(thinkingMs)
        : "Studi's steps";

  const nodeX = (i: number) => 10 + i * (200 / Math.max(steps.length - 1, 1));
  const nodeY = (i: number) => 30 + Math.sin(i * 1.4 + 0.4) * 13;
  const points = steps.map((_, i) => `${nodeX(i)},${nodeY(i)}`).join(" ");

  return (
    <div className="sandbox-constellation-block">
      <button
        type="button"
        className="sandbox-constellation-toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span
          className="sandbox-constellation-toggle-dot"
          data-active={stayOpen}
          aria-hidden
        />
        <span>{collapsed ? collapsedLabel : "Connecting the idea"}</span>
        <IconChevronDown
          className={`sandbox-chevron${!collapsed ? " is-open" : ""}`}
        />
      </button>

      {!collapsed && (
        <div className="sandbox-constellation-panel">
          <svg viewBox="0 0 220 60" className="sandbox-constellation-svg" aria-hidden>
            <polyline
              points={points}
              fill="none"
              className="sandbox-constellation-line"
              pathLength={1}
              style={{
                strokeDasharray: 1,
                strokeDashoffset: 1 - fraction,
              }}
            />
            {steps.map((step, i) => (
              <circle
                key={step.id}
                cx={nodeX(i)}
                cy={nodeY(i)}
                r={step.status === "active" ? 4.4 : step.status === "complete" ? 3.4 : 2.2}
                className="sandbox-constellation-node"
                data-status={step.status}
                data-kind={step.kind}
              />
            ))}
          </svg>
          <ul className="sandbox-constellation-steps">
            {steps.map((step) => (
              <li key={step.id} data-status={step.status} data-kind={step.kind}>
                {step.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Ink Bloom variant: an organic ink blot that spreads while Studi
 * works and contracts to a single settled drop once it's done — the
 * "crafted paper notebook" brand metaphor taken literally. Shares the
 * same phase→mode taxonomy as Orbital (reasoning/tool/spark/answering). */

function InkBloomActivity({
  phase,
  steps,
  activeStepKind,
  thinkingMs,
}: {
  phase: Phase;
  steps: Step[];
  activeStepKind: StepKind | undefined;
  thinkingMs: number | null;
}) {
  const stayOpen = phase === "reading" || phase === "working";
  const [collapsed, setCollapsed] = useAutoCollapse(stayOpen);
  if (phase === "idle") return null;

  const mode = orbitModeForKind(phase, activeStepKind);
  const collapsedLabel =
    phase === "stopped"
      ? "Stopped early"
      : thinkingMs
        ? formatThinkingLabel(thinkingMs)
        : "Studi's steps";

  return (
    <div className="sandbox-ink-block">
      <button
        type="button"
        className="sandbox-orbital-toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <span
          className="sandbox-orbital-toggle-dot"
          data-mode={mode}
          aria-hidden
        />
        <span>{collapsed ? collapsedLabel : modeCaption(mode)}</span>
        <IconChevronDown
          className={`sandbox-chevron${!collapsed ? " is-open" : ""}`}
        />
      </button>

      {!collapsed && (
        <div className="sandbox-ink-panel">
          <div className="sandbox-ink-scene" data-mode={mode} aria-hidden>
            <span className="sandbox-ink-blob sandbox-ink-blob-1" />
            <span className="sandbox-ink-blob sandbox-ink-blob-2" />
            <span className="sandbox-ink-blob sandbox-ink-blob-3" />
          </div>
          <ul className="sandbox-step-list">
            {steps.map((step) => (
              <li
                key={step.id}
                data-status={step.status}
                data-kind={step.kind}
              >
                <span className="sandbox-step-list-dot" aria-hidden />
                {step.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Conversation preview (question + assistant reply) ───────── */

function ConversationPreview({
  agentVariant,
  run,
}: {
  agentVariant: AgentVariant;
  run: ReturnType<typeof useTutorRun>;
}) {
  const { phase, steps, revealedAnswer, statusLabel, thinkingMs, activeStepKind } =
    run;
  const showAnswer = phase === "answering" || phase === "done";
  const showSpark =
    showAnswer &&
    steps.some((s) => s.kind === "spark" && s.status === "complete");

  const mainColumn = (
    <div className="min-w-0 flex-1">
      <div className="sandbox-user-bubble">{QUESTION}</div>

      {phase !== "idle" && (
        <div className="sandbox-assistant-block">
          {agentVariant === "notebook" && (
            <NotebookActivity steps={steps} phase={phase} thinkingMs={thinkingMs} />
          )}
          {agentVariant === "whisper" && (
            <WhisperLine
              phase={phase}
              statusLabel={statusLabel}
              steps={steps}
              thinkingMs={thinkingMs}
            />
          )}
          {agentVariant === "orbital" && (
            <OrbitalActivity
              phase={phase}
              steps={steps}
              activeStepKind={activeStepKind}
              thinkingMs={thinkingMs}
            />
          )}
          {agentVariant === "constellation" && (
            <ConstellationActivity
              phase={phase}
              steps={steps}
              thinkingMs={thinkingMs}
            />
          )}
          {agentVariant === "inkbloom" && (
            <InkBloomActivity
              phase={phase}
              steps={steps}
              activeStepKind={activeStepKind}
              thinkingMs={thinkingMs}
            />
          )}

          {showAnswer && (
            <div className="sandbox-answer">
              {formatAnswer(revealedAnswer)}
              {showSpark && <SparkPreviewCard />}
            </div>
          )}

          {phase === "stopped" && (
            <p className="sandbox-stopped-note" role="status" aria-live="polite">
              Response stopped. Ask Studi to continue whenever you&apos;re ready.
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (agentVariant === "marginalia") {
    return (
      <div className="sandbox-thread-grid">
        {mainColumn}
        <MarginaliaNotes steps={steps} phase={phase} thinkingMs={thinkingMs} />
      </div>
    );
  }

  return <div className="sandbox-thread-grid sandbox-thread-grid-single">{mainColumn}</div>;
}

/* ── Composer variants ───────────────────────────────────────── */

function SandboxComposer({
  composerMode,
  isBusy,
  statusLabel,
  onStart,
  onStop,
}: {
  composerMode: ComposerMode;
  isBusy: boolean;
  statusLabel: string;
  onStart: () => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="sandbox-composer-wrap">
      {composerMode === "banner" && isBusy && (
        <div
          role="status"
          aria-live="polite"
          className="sandbox-banner"
        >
          <span className="status-loader-ring shrink-0" aria-hidden />
          <span className="sandbox-banner-text">
            <strong className="block">Studi is working on your next step.</strong>
            {statusLabel}
          </span>
          <button
            type="button"
            className="sandbox-banner-stop"
            onClick={onStop}
          >
            Stop
          </button>
        </div>
      )}

      {composerMode === "morph" && (
        <p
          className="sandbox-status-line"
          role="status"
          aria-live="polite"
          data-visible={isBusy}
        >
          {isBusy ? statusLabel : " "}
        </p>
      )}

      <form
        className="composer-card sandbox-composer-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (!isBusy && value.trim().length > 0) {
            setValue("");
            onStart();
          }
        }}
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask a follow-up..."
          rows={1}
          className="min-h-[42px] max-h-40"
        />
        <div className="composer-bottom-row">
          <button
            type="button"
            className="composer-plus-btn"
            aria-label="More options"
            tabIndex={-1}
          >
            <IconPlus />
          </button>

          <button
            type={composerMode === "morph" && isBusy ? "button" : "submit"}
            onClick={
              composerMode === "morph" && isBusy
                ? (e) => {
                    e.preventDefault();
                    onStop();
                  }
                : undefined
            }
            disabled={composerMode === "banner" && isBusy}
            className="composer-send-btn sandbox-send-btn"
            data-busy={composerMode === "morph" && isBusy}
            aria-label={
              composerMode === "morph" && isBusy ? "Stop response" : "Send message"
            }
          >
            <span className="sandbox-send-icon-swap">
              <IconArrow className="sandbox-icon-arrow" />
              <IconStop className="sandbox-icon-stop" />
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Segmented control ───────────────────────────────────────── */

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="sandbox-segmented-group">
      <p className="sandbox-segmented-label">{label}</p>
      <div className="sandbox-segmented" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className="sandbox-segmented-btn"
            data-active={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span className="sandbox-segmented-btn-label">{option.label}</span>
            <span className="sandbox-segmented-btn-hint">{option.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */

export default function ChatUxSandboxPage() {
  const [agentVariant, setAgentVariant] = useState<AgentVariant>("marginalia");
  const [composerMode, setComposerMode] = useState<ComposerMode>("morph");
  const run = useTutorRun();

  const handlePlay = useCallback(() => {
    run.reset();
    setTimeout(() => run.start(), 30);
  }, [run]);

  return (
    <div className="sandbox-page">
      <div className="sandbox-shell">
        <header className="mb-6">
          <p className="font-heading text-xs italic text-fg-faint">
            Design sandbox — not wired to real chat
          </p>
          <h1 className="mt-1 font-heading text-2xl text-fg">
            Chat UX playground
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">
            Comparing ways to show the tutor&apos;s thinking and the composer&apos;s
            send/stop control. The step detail always tucks itself away the
            moment Studi starts answering, and always reopens on click — the
            composer status line is the one thing that never disappears.{" "}
            <Link href="/chat" className="underline">
              Open the live chat
            </Link>{" "}
            to compare against production.
          </p>
        </header>

        <div className="sandbox-control-rail">
          <Segmented
            label="How the tutor's thinking is shown"
            value={agentVariant}
            onChange={setAgentVariant}
            options={[
              {
                value: "marginalia",
                label: "Marginalia",
                hint: "Notes run in the margin, answer stays clean",
              },
              {
                value: "notebook",
                label: "Notebook page",
                hint: "Inline checklist card, ink-bordered",
              },
              {
                value: "whisper",
                label: "Whisper line",
                hint: "One quiet status line, no card",
              },
              {
                value: "orbital",
                label: "Orbital",
                hint: "Pseudo-3D orbit with trails, shifts with phase",
              },
              {
                value: "constellation",
                label: "Constellation",
                hint: "Steps light up and connect as stars",
              },
              {
                value: "inkbloom",
                label: "Ink bloom",
                hint: "An ink blot spreads, then settles to a drop",
              },
            ]}
          />

          <Segmented
            label="Composer control"
            value={composerMode}
            onChange={setComposerMode}
            options={[
              {
                value: "banner",
                label: "Current: banner + Stop",
                hint: "Boxed notice above the composer",
              },
              {
                value: "morph",
                label: "New: send morphs to stop",
                hint: "The send button itself becomes Stop",
              },
            ]}
          />

          <div className="sandbox-transport">
            <button
              type="button"
              className="sandbox-transport-btn"
              onClick={handlePlay}
              disabled={run.isBusy}
            >
              {run.phase === "idle" ? "Run demo question" : "Replay"}
            </button>
            <button
              type="button"
              className="sandbox-transport-btn sandbox-transport-btn-ghost"
              onClick={run.reset}
            >
              Reset
            </button>
          </div>
        </div>

        <div className="sandbox-stage">
          <ConversationPreview
            key={run.runId}
            agentVariant={agentVariant}
            run={run}
          />
        </div>

        <SandboxComposer
          composerMode={composerMode}
          isBusy={run.isBusy}
          statusLabel={run.statusLabel}
          onStart={handlePlay}
          onStop={run.stop}
        />
      </div>
    </div>
  );
}
