"use client";

import { useEffect, useRef, useState } from "react";
import type { DesmosGraphPayload } from "@/lib/sparks/contracts";

type DesmosGraphSceneProps = {
  payload: DesmosGraphPayload;
};

type DesmosCalculator = {
  setBlank: (options?: { allowUndo?: boolean }) => void;
  setExpressions: (expressionStates: Array<Record<string, unknown>>) => void;
  updateSettings: (settings: Record<string, unknown>) => void;
  setMathBounds: (bounds: {
    left: number;
    right: number;
    bottom: number;
    top: number;
  }) => void;
  destroy: () => void;
};

type DesmosNamespace = {
  GraphingCalculator: (
    element: HTMLElement,
    options?: Record<string, unknown>,
  ) => DesmosCalculator;
};

declare global {
  interface Window {
    Desmos?: DesmosNamespace;
    __studiDesmosLoader?: Promise<void>;
  }
}

function loadDesmosScript(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Desmos can only load in the browser."));
  }

  if (window.Desmos) {
    return Promise.resolve();
  }

  if (window.__studiDesmosLoader) {
    return window.__studiDesmosLoader;
  }

  window.__studiDesmosLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.desmos.com/api/v1.11/calculator.js?apiKey=${encodeURIComponent(apiKey)}`;
    script.onload = () => {
      if (window.Desmos) {
        resolve();
        return;
      }
      reject(new Error("Desmos script loaded but API was unavailable."));
    };
    script.onerror = () => {
      reject(new Error("Failed to load Desmos API script."));
    };

    document.head.appendChild(script);
  }).catch((error) => {
    window.__studiDesmosLoader = undefined;
    throw error;
  });

  return window.__studiDesmosLoader;
}

function applyDesmosPayload(
  calculator: DesmosCalculator,
  payload: DesmosGraphPayload,
): void {
  calculator.setBlank({ allowUndo: false });

  if (payload.settings) {
    calculator.updateSettings(payload.settings);
  }

  calculator.setExpressions(
    payload.expressions as Array<Record<string, unknown>>,
  );

  if (payload.viewport) {
    calculator.setMathBounds(payload.viewport);
  }
}

export default function DesmosGraphScene({ payload }: DesmosGraphSceneProps) {
  const apiKey = process.env.NEXT_PUBLIC_DESMOS_API_KEY;
  const hasApiKey = Boolean(apiKey && apiKey.trim().length > 0);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const calculatorRef = useRef<DesmosCalculator | null>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!hasApiKey || !apiKey) {
      return;
    }

    let isCancelled = false;

    const setup = async () => {
      try {
        await loadDesmosScript(apiKey);

        if (isCancelled || !mountRef.current || !window.Desmos) {
          return;
        }

        const calculator = window.Desmos.GraphingCalculator(mountRef.current, {
          expressions: true,
          keypad: true,
          settingsMenu: true,
          zoomButtons: true,
        });

        calculatorRef.current = calculator;

        if (!isCancelled) {
          setStatus("ready");
          setErrorText(null);
        }
      } catch (error) {
        if (!isCancelled) {
          setStatus("error");
          setErrorText(
            error instanceof Error
              ? error.message
              : "Failed to render Desmos graph.",
          );
        }
      }
    };

    void setup();

    return () => {
      isCancelled = true;
      if (calculatorRef.current) {
        calculatorRef.current.destroy();
        calculatorRef.current = null;
      }
    };
  }, [apiKey, hasApiKey]);

  useEffect(() => {
    if (!calculatorRef.current || status !== "ready") {
      return;
    }

    applyDesmosPayload(calculatorRef.current, payload);
  }, [payload, status]);

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{
        border: "1px solid rgba(58, 109, 168, 0.28)",
        background:
          "radial-gradient(120% 140% at 0% 0%, rgba(47,97,156,0.2) 0%, rgba(13,19,30,0.96) 66%)",
        boxShadow: "0 14px 34px rgba(12, 18, 28, 0.18)",
      }}
    >
      <div
        className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
        style={{
          borderBottom: "1px solid rgba(133, 167, 201, 0.22)",
          color: "rgba(215, 231, 247, 0.82)",
          background: "rgba(9, 16, 27, 0.45)",
        }}
      >
        <span>{status === "ready" ? "Desmos Graph" : "Loading Desmos"}</span>
        {payload.hint ? <span>{payload.hint}</span> : null}
      </div>

      {!hasApiKey ? (
        <div
          className="p-4 text-sm"
          style={{
            color: "#ffd6d6",
            background: "rgba(81, 15, 15, 0.38)",
            borderTop: "1px solid rgba(182, 71, 71, 0.35)",
          }}
        >
          Missing NEXT_PUBLIC_DESMOS_API_KEY.
        </div>
      ) : null}

      {status === "error" ? (
        <div
          className="p-4 text-sm"
          style={{
            color: "#ffd6d6",
            background: "rgba(81, 15, 15, 0.38)",
            borderTop: "1px solid rgba(182, 71, 71, 0.35)",
          }}
        >
          {errorText ?? "Unable to initialize Desmos graph."}
        </div>
      ) : null}

      <div
        ref={mountRef}
        style={{
          height: "460px",
          background: "#ffffff",
          display: hasApiKey ? "block" : "none",
        }}
      />
    </div>
  );
}
