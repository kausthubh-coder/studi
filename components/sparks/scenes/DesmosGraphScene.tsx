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
    <div className="spark-scene">
      <div className="spark-scene-bar">
        <span className="font-heading text-[11px] text-fg-muted">
          {status === "ready" ? "Desmos Graph" : "Loading Desmos"}
        </span>
        {payload.hint && (
          <span className="ml-auto text-[11px] text-fg-faint">
            {payload.hint}
          </span>
        )}
      </div>

      {!hasApiKey && (
        <div className="spark-fail" style={{ borderRadius: 0 }}>
          <p className="text-sm text-fg-muted">
            Missing <code className="text-accent">NEXT_PUBLIC_DESMOS_API_KEY</code>.
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="spark-fail" style={{ borderRadius: 0 }}>
          <p className="text-sm text-fg-muted">
            {errorText ?? "Unable to initialize Desmos graph."}
          </p>
        </div>
      )}

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
