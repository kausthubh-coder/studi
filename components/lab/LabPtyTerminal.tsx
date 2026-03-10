"use client";

import { useAction } from "convex/react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { AlertCircle, Loader2, RotateCcw, SquareTerminal } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/convex/_generated/api";

type LabPtyTerminalProps = {
  threadId: string;
  sessionId: string | null;
  onSessionIdChange: (sessionId: string) => void;
  onOutputChunk: (chunk: string) => void;
};

type ConnectionState = "connecting" | "connected" | "disconnected";

type ActionFailure = {
  status: "failed";
  summary: string;
  error: {
    hint?: string;
    requestId?: string;
    endpoint?: string;
  };
};

function parseSsePayload<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function buildFailureMessage(response: ActionFailure): string {
  const details = [
    response.summary,
    response.error.hint,
    response.error.endpoint ? `Endpoint: ${response.error.endpoint}` : undefined,
    response.error.requestId
      ? `Request ID: ${response.error.requestId}`
      : undefined,
  ].filter(Boolean);

  return details.join(" ");
}

export function LabPtyTerminal({
  threadId,
  sessionId,
  onSessionIdChange,
  onOutputChunk,
}: LabPtyTerminalProps) {
  const ensurePtySession = useAction(api.labIde.ensureLabPtySession);
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const inputQueueRef = useRef(Promise.resolve());
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapStage, setBootstrapStage] = useState(
    "Ensuring PTY session.",
  );

  const sendInput = useCallback(
    (data: string) => {
      const currentSessionId = sessionId?.trim();
      if (!currentSessionId) {
        return;
      }

      inputQueueRef.current = inputQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const response = await fetch("/api/lab/pty/input", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              threadId,
              sessionId: currentSessionId,
              data,
            }),
          });

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as
              | { error?: string }
              | null;
            console.warn("[lab-pty-terminal] input failed", {
              threadId,
              sessionId: currentSessionId,
              status: response.status,
              error: payload?.error ?? "Unable to send PTY input.",
            });
          }
        });
    },
    [sessionId, threadId],
  );

  const resizeRemote = useCallback(
    (cols: number, rows: number) => {
      const currentSessionId = sessionId?.trim();
      if (!currentSessionId || connectionState !== "connected") {
        return;
      }

      void fetch("/api/lab/pty/resize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId,
          sessionId: currentSessionId,
          cols,
          rows,
        }),
      })
        .then(async (response) => {
          if (response.ok) {
            return;
          }
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          console.warn("[lab-pty-terminal] resize failed", {
            threadId,
            sessionId: currentSessionId,
            cols,
            rows,
            status: response.status,
            error: payload?.error ?? "Unable to resize PTY.",
          });
        })
        .catch((error) => {
          console.warn("[lab-pty-terminal] resize request failed", {
            threadId,
            sessionId: currentSessionId,
            cols,
            rows,
            error: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [connectionState, sessionId, threadId],
  );

  const fitTerminal = useCallback(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) {
      return;
    }

    fitAddon.fit();
    resizeRemote(term.cols, term.rows);
  }, [resizeRemote]);

  const connectStream = useCallback(
    (nextSessionId: string) => {
      eventSourceRef.current?.close();
      setConnectionState("connecting");
      setTerminalError(null);
      setBootstrapStage("Opening PTY stream.");
      let receivedStructuredError = false;

      const source = new EventSource(
        `/api/lab/pty/stream?threadId=${encodeURIComponent(
          threadId,
        )}&sessionId=${encodeURIComponent(nextSessionId)}`,
      );
      eventSourceRef.current = source;

      source.addEventListener("ready", () => {
        setConnectionState("connected");
        setBootstrapStage("Connected to PTY session.");
      });

      source.addEventListener("data", (event) => {
        const payload = parseSsePayload<string>((event as MessageEvent).data);
        if (typeof payload !== "string") {
          return;
        }
        termRef.current?.write(payload);
        onOutputChunk(payload);
      });

      source.addEventListener("exit", (event) => {
        const payload = parseSsePayload<{
          exitCode?: number;
          error?: string;
        }>((event as MessageEvent).data);
        setConnectionState("disconnected");
        setBootstrapStage("PTY session exited.");
        if (payload?.error) {
          setTerminalError(payload.error);
        }
      });

      source.addEventListener("error", (event) => {
        const payload = parseSsePayload<string>((event as MessageEvent).data);
        receivedStructuredError = true;
        setConnectionState("disconnected");
        setBootstrapStage("PTY stream disconnected.");
        setTerminalError(payload ?? "Terminal stream disconnected.");
        console.warn("[lab-pty-terminal] stream error event", {
          threadId,
          sessionId: nextSessionId,
          error: payload ?? "Terminal stream disconnected.",
        });
        source.close();
      });

      source.onerror = () => {
        setConnectionState("disconnected");
        setBootstrapStage("PTY stream disconnected.");
        if (!receivedStructuredError) {
          setTerminalError("Terminal stream disconnected.");
        }
        console.warn("[lab-pty-terminal] event source disconnected", {
          threadId,
          sessionId: nextSessionId,
          structuredError: receivedStructuredError,
        });
        source.close();
      };
    },
    [onOutputChunk, threadId],
  );

  const bootstrap = useCallback(async () => {
    const term = termRef.current;
    if (!term) {
      return;
    }

    setIsBootstrapping(true);
    setConnectionState("connecting");
    setTerminalError(null);
    setBootstrapStage("Ensuring PTY session.");

    try {
      fitAddonRef.current?.fit();
      const response = await ensurePtySession({
        threadId,
        sessionId: sessionId ?? undefined,
        cols: term.cols,
        rows: term.rows,
      });

      if (response.status === "failed") {
        throw new Error(buildFailureMessage(response as ActionFailure));
      }

      onSessionIdChange(response.sessionId);
      setBootstrapStage("Connecting PTY stream.");
      connectStream(response.sessionId);
    } catch (error) {
      console.warn("[lab-pty-terminal] bootstrap failed", {
        threadId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      setConnectionState("disconnected");
      setBootstrapStage("PTY bootstrap failed.");
      setTerminalError(
        error instanceof Error ? error.message : "Unable to connect terminal.",
      );
    } finally {
      setIsBootstrapping(false);
    }
  }, [connectStream, ensurePtySession, onSessionIdChange, sessionId, threadId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || termRef.current) {
      return;
    }

    const term = new Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      fontFamily:
        '"SF Mono", "JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 12,
      lineHeight: 1.35,
      scrollback: 4000,
      theme: {
        background: "#17120e",
        foreground: "#f4ecdf",
        cursor: "#f3b56a",
        selectionBackground: "rgba(243, 181, 106, 0.28)",
        black: "#221912",
        red: "#ef6c5b",
        green: "#77c7a6",
        yellow: "#f3d57a",
        blue: "#78b6ff",
        magenta: "#f2a6d5",
        cyan: "#7adad7",
        white: "#f4ecdf",
        brightBlack: "#6f655d",
        brightRed: "#ff8b78",
        brightGreen: "#9ee1c4",
        brightYellow: "#ffe48f",
        brightBlue: "#96c7ff",
        brightMagenta: "#ffc2e7",
        brightCyan: "#97f0ee",
        brightWhite: "#fff8ef",
      },
    });
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(container);
    termRef.current = term;

    const disposeInput = term.onData((data) => {
      sendInput(data);
    });

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = window.setTimeout(() => {
        fitTerminal();
      }, 100);
    });
    resizeObserver.observe(container);
    fitTerminal();
    void bootstrap();

    return () => {
      disposeInput.dispose();
      resizeObserver.disconnect();
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }
      eventSourceRef.current?.close();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [bootstrap, fitTerminal, sendInput]);

  useEffect(() => {
    if (connectionState === "connected") {
      fitTerminal();
    }
  }, [connectionState, fitTerminal]);

  const statusLabel = useMemo(() => {
    if (isBootstrapping) {
      return "Connecting";
    }
    if (connectionState === "connected") {
      return "Connected";
    }
    return "Disconnected";
  }, [connectionState, isBootstrapping]);

  return (
    <div className="lab-terminal">
      <div className="lab-terminal-toolbar">
        <div className="lab-terminal-status" data-state={connectionState}>
          {isBootstrapping ? (
            <Loader2 size={12} className="animate-spin" strokeWidth={2.3} />
          ) : (
            <SquareTerminal size={12} strokeWidth={2.2} />
          )}
          <span>{statusLabel}</span>
        </div>
        <div className="lab-terminal-toolbar-actions">
          <button
            type="button"
            className="lab-terminal-toolbar-btn"
            onClick={() => void bootstrap()}
          >
            <RotateCcw size={12} strokeWidth={2.2} />
            Reconnect
          </button>
          <button
            type="button"
            className="lab-terminal-toolbar-btn"
            disabled={connectionState !== "connected"}
            onClick={() => sendInput("\u0003")}
          >
            Ctrl+C
          </button>
        </div>
      </div>

      <div className="lab-terminal-stage">{bootstrapStage}</div>

      {terminalError ? (
        <div className="lab-terminal-error">
          <AlertCircle size={14} strokeWidth={2.2} />
          <span>{terminalError}</span>
        </div>
      ) : null}

      <div ref={containerRef} className="lab-terminal-surface" />
    </div>
  );
}
