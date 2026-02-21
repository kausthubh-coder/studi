"use client";

import dynamic from "next/dynamic";
import { useMutation, useQuery } from "convex/react";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { CodePlaygroundPayload } from "@/lib/sparks/contracts";

type MonacoEditorProps = {
  height?: string | number;
  language?: string;
  value?: string;
  onChange?: (value: string | undefined) => void;
  theme?: string;
  options?: Record<string, unknown>;
};

const MonacoEditor = dynamic(
  async () => (await import("@monaco-editor/react")).default,
  {
    ssr: false,
    loading: () => (
      <div className="code-spark-editor-loading">Loading editor...</div>
    ),
  },
) as ComponentType<MonacoEditorProps>;

type CodePlaygroundSceneProps = {
  payload: CodePlaygroundPayload;
  sparkTitle: string;
  sparkInstanceId: string;
  threadId?: string | null;
};

type WorkerRunResult = {
  requestId: string;
  stdout: string;
  stderr: string;
  error: string | null;
  durationMs: number;
};

type PendingRun = {
  resolve: (result: WorkerRunResult) => void;
  reject: (error: Error) => void;
};

type RunStatus = "idle" | "running" | "success" | "error";

const RUN_TIMEOUT_MS = 12_000;

function makeRequestId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function CodePlaygroundScene({
  payload,
  sparkTitle,
  sparkInstanceId,
  threadId,
}: CodePlaygroundSceneProps) {
  const persisted = useQuery(
    api.sparkFeedback.getCodeSparkState,
    threadId ? { threadId, sparkInstanceId } : "skip",
  );

  const upsertCodeSparkDraft = useMutation(
    api.sparkFeedback.upsertCodeSparkDraft,
  );
  const recordCodeSparkRun = useMutation(api.sparkFeedback.recordCodeSparkRun);

  const [draftCode, setDraftCode] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [stdout, setStdout] = useState("");
  const [stderr, setStderr] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const workerReadyPromiseRef = useRef<Promise<void> | null>(null);
  const pendingRunsRef = useRef<Map<string, PendingRun>>(new Map());
  const lastSavedCodeRef = useRef<string | null>(null);

  const code = draftCode ?? persisted?.code ?? payload.starterCode;

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    workerReadyPromiseRef.current = null;
    pendingRunsRef.current.clear();
  }, []);

  const ensureWorker = useCallback(async () => {
    if (workerReadyPromiseRef.current) {
      return workerReadyPromiseRef.current;
    }

    const worker = new Worker("/workers/pythonRunnerWorker.js");
    workerRef.current = worker;

    workerReadyPromiseRef.current = new Promise<void>((resolve, reject) => {
      const onWorkerError = (event: ErrorEvent) => {
        reject(new Error(event.message || "Python worker crashed."));
      };

      worker.addEventListener("error", onWorkerError);

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data as
          | { type: "ready" }
          | { type: "init_error"; error: string }
          | ({ type: "run_result" } & WorkerRunResult);

        if (data.type === "ready") {
          worker.removeEventListener("error", onWorkerError);
          resolve();
          return;
        }

        if (data.type === "init_error") {
          worker.removeEventListener("error", onWorkerError);
          reject(
            new Error(data.error || "Failed to initialize Python runtime."),
          );
          return;
        }

        if (data.type === "run_result") {
          const pending = pendingRunsRef.current.get(data.requestId);
          if (!pending) {
            return;
          }
          pendingRunsRef.current.delete(data.requestId);
          pending.resolve(data);
        }
      };

      worker.postMessage({ type: "init" });
    }).catch((error) => {
      terminateWorker();
      throw error;
    });

    return workerReadyPromiseRef.current;
  }, [terminateWorker]);

  const runCode = useCallback(
    async (currentCode: string): Promise<WorkerRunResult> => {
      await ensureWorker();

      const worker = workerRef.current;
      if (!worker) {
        throw new Error("Python worker is unavailable.");
      }

      const requestId = makeRequestId();
      return await new Promise<WorkerRunResult>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          pendingRunsRef.current.delete(requestId);
          terminateWorker();
          reject(
            new Error(
              `Execution timed out after ${Math.round(RUN_TIMEOUT_MS / 1000)}s.`,
            ),
          );
        }, RUN_TIMEOUT_MS);

        pendingRunsRef.current.set(requestId, {
          resolve: (result) => {
            clearTimeout(timeoutId);
            resolve(result);
          },
          reject: (error) => {
            clearTimeout(timeoutId);
            reject(error);
          },
        });

        worker.postMessage({
          type: "run",
          requestId,
          code: currentCode,
          testCode: payload.testCode,
        });
      });
    },
    [ensureWorker, payload.testCode, terminateWorker],
  );

  useEffect(() => {
    return () => {
      terminateWorker();
    };
  }, [terminateWorker]);

  useEffect(() => {
    if (persisted === undefined || lastSavedCodeRef.current !== null) {
      return;
    }
    lastSavedCodeRef.current = persisted?.code ?? payload.starterCode;
  }, [payload.starterCode, persisted]);

  useEffect(() => {
    if (!threadId || persisted === undefined) {
      return;
    }

    if (lastSavedCodeRef.current === code) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void upsertCodeSparkDraft({
        threadId,
        sparkInstanceId,
        sparkTitle,
        language: "python",
        code,
      })
        .then(() => {
          lastSavedCodeRef.current = code;
        })
        .catch((error) => {
          console.error("Failed to save code spark draft", error);
        });
    }, 700);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [
    code,
    persisted,
    sparkInstanceId,
    sparkTitle,
    threadId,
    upsertCodeSparkDraft,
  ]);

  const onRunClick = useCallback(async () => {
    setRunStatus("running");
    setErrorText(null);

    try {
      const result = await runCode(code);
      const nextStatus: RunStatus = result.error ? "error" : "success";

      setRunStatus(nextStatus);
      setStdout(result.stdout);
      setStderr(result.stderr);
      setErrorText(result.error);
      setDurationMs(result.durationMs);

      if (threadId) {
        void recordCodeSparkRun({
          threadId,
          sparkInstanceId,
          sparkTitle,
          language: "python",
          code,
          result: {
            status: nextStatus,
            stdout: result.stdout,
            stderr: result.stderr,
            error: result.error ?? undefined,
          },
        }).catch((error) => {
          console.error("Failed to save code spark run", error);
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to run Python code.";
      setRunStatus("error");
      setStdout("");
      setStderr("");
      setErrorText(message);
      setDurationMs(null);

      if (threadId) {
        void recordCodeSparkRun({
          threadId,
          sparkInstanceId,
          sparkTitle,
          language: "python",
          code,
          result: {
            status: "error",
            error: message,
          },
        }).catch((saveError) => {
          console.error("Failed to save code spark error run", saveError);
        });
      }
    }
  }, [
    code,
    recordCodeSparkRun,
    runCode,
    sparkInstanceId,
    sparkTitle,
    threadId,
  ]);

  const onResetClick = useCallback(() => {
    setDraftCode(payload.starterCode);
    setRunStatus("idle");
    setStdout("");
    setStderr("");
    setErrorText(null);
    setDurationMs(null);
  }, [payload.starterCode]);

  const runMeta = useMemo(() => {
    if (runStatus === "running") {
      return "Running...";
    }
    if (durationMs !== null && runStatus !== "idle") {
      return `Last run: ${durationMs} ms`;
    }
    return "Ready";
  }, [durationMs, runStatus]);

  return (
    <div className="spark-scene">
      {/* Bar */}
      <div className="spark-scene-bar">
        <span aria-hidden style={{ fontSize: "1rem", lineHeight: 1 }}>
          🐍
        </span>
        <span
          className="text-[11px] text-fg-muted"
          style={{ fontFamily: "var(--font-jakarta)", fontWeight: 500 }}
        >
          Python Playground
        </span>

        {/* Status pill */}
        {runStatus !== "idle" && (
          <span
            className="code-spark-status-pill"
            data-status={runStatus}
          >
            {runStatus === "running"
              ? "Running…"
              : runStatus === "success"
                ? `Done ${durationMs}ms`
                : "Error"}
          </span>
        )}
        {runStatus === "idle" && durationMs !== null && (
          <span className="code-spark-meta">{durationMs}ms</span>
        )}

        <button
          type="button"
          className="spark-scene-expand"
          onClick={onResetClick}
          disabled={runStatus === "running"}
          style={{ marginLeft: "auto" }}
        >
          Reset
        </button>
        <button
          type="button"
          className="code-spark-run-btn"
          onClick={onRunClick}
          disabled={runStatus === "running"}
        >
          {runStatus === "running" ? "Running…" : "▶ Run"}
        </button>
      </div>

      {/* Notebook layout: instructions left | editor+output right */}
      <div className="code-spark-layout">
        <div className="code-spark-instructions">
          <p>{payload.instructions}</p>
          {payload.runHint && (
            <p className="code-spark-hint">{payload.runHint}</p>
          )}
        </div>

        <div className="code-spark-editor-shell">
          <MonacoEditor
            height="320px"
            language="python"
            value={code}
            onChange={(value: string | undefined) => setDraftCode(value ?? "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbersMinChars: 3,
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
              automaticLayout: true,
              padding: { top: 10 },
              tabSize: 2,
              fontVariantNumeric: "tabular-nums",
            }}
          />
        </div>

        <div className="code-spark-output-shell" data-status={runStatus}>
          <div className="code-spark-output-title">Output</div>
          {errorText ? (
            <pre className="code-spark-error">{errorText}</pre>
          ) : null}
          {stdout ? <pre className="code-spark-stdout">{stdout}</pre> : null}
          {stderr ? <pre className="code-spark-stderr">{stderr}</pre> : null}
          {!stdout && !stderr && !errorText ? (
            <p className="code-spark-placeholder">
              Run the code to see results here.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
