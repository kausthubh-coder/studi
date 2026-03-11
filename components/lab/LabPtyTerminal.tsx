"use client";

import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import type {
  SandboxClient,
  Terminal as SandboxTerminal,
} from "@codesandbox/sdk/browser";
import { AlertCircle, Loader2, RotateCcw, SquareTerminal } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ConnectionState = "connecting" | "connected" | "disconnected";

type LabPtyTerminalProps = {
  sandbox: SandboxClient | null;
  connectionState: ConnectionState;
  connectionError: string | null;
  onReconnect: () => Promise<void>;
  onOutputChunk: (chunk: string) => void;
};

function getTerminalSize(term: XTerm | null) {
  return {
    cols: term?.cols ?? 120,
    rows: term?.rows ?? 32,
  };
}

async function disposeRemoteTerminal(terminal: SandboxTerminal | null) {
  if (!terminal) {
    return;
  }

  await terminal.kill().catch(() => undefined);
}

export function LabPtyTerminal({
  sandbox,
  connectionState,
  connectionError,
  onReconnect,
  onOutputChunk,
}: LabPtyTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const remoteTerminalRef = useRef<SandboxTerminal | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapStage, setBootstrapStage] = useState(
    "Connecting to CodeSandbox.",
  );

  const sendInput = useCallback(
    (data: string) => {
      const remoteTerminal = remoteTerminalRef.current;
      if (!remoteTerminal) {
        return;
      }

      void remoteTerminal
        .write(data, getTerminalSize(termRef.current))
        .catch((error) => {
          setTerminalError(
            error instanceof Error
              ? error.message
              : "Unable to send terminal input.",
          );
        });
    },
    [],
  );

  const syncTerminalSize = useCallback(() => {
    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    const remoteTerminal = remoteTerminalRef.current;
    if (!term || !fitAddon) {
      return;
    }

    fitAddon.fit();
    if (!remoteTerminal) {
      return;
    }

    void remoteTerminal
      .write("", getTerminalSize(term))
      .catch(() => undefined);
  }, []);

  const bootstrap = useCallback(async () => {
    const sandboxClient = sandbox;
    const term = termRef.current;
    if (!sandboxClient || !term) {
      return;
    }

    setIsBootstrapping(true);
    setTerminalError(null);
    setBootstrapStage("Creating shell.");

    const previousRemote = remoteTerminalRef.current;
    remoteTerminalRef.current = null;
    await disposeRemoteTerminal(previousRemote);
    term.clear();

    try {
      const remoteTerminal = await sandboxClient.terminals.create("bash", {
        cwd: sandboxClient.workspacePath,
        name: "Studi",
        dimensions: getTerminalSize(term),
      });
      remoteTerminalRef.current = remoteTerminal;
      const initialOutput = await remoteTerminal.open(getTerminalSize(term));
      if (initialOutput) {
        term.write(initialOutput);
        onOutputChunk(initialOutput);
      }

      remoteTerminal.onOutput((chunk) => {
        term.write(chunk);
        onOutputChunk(chunk);
      });

      setBootstrapStage("Terminal connected.");
    } catch (error) {
      setBootstrapStage("Terminal bootstrap failed.");
      setTerminalError(
        error instanceof Error ? error.message : "Unable to open terminal.",
      );
    } finally {
      setIsBootstrapping(false);
    }
  }, [onOutputChunk, sandbox]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || termRef.current) {
      return;
    }

    const term = new XTerm({
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
        syncTerminalSize();
      }, 100);
    });
    resizeObserver.observe(container);
    syncTerminalSize();

    return () => {
      disposeInput.dispose();
      resizeObserver.disconnect();
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }
      const currentRemoteTerminal = remoteTerminalRef.current;
      remoteTerminalRef.current = null;
      void disposeRemoteTerminal(currentRemoteTerminal);
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sendInput, syncTerminalSize]);

  useEffect(() => {
    if (!sandbox) {
      setIsBootstrapping(false);
      return;
    }

    void bootstrap();
  }, [bootstrap, sandbox]);

  const statusLabel = useMemo(() => {
    if (isBootstrapping || connectionState === "connecting") {
      return "Connecting";
    }
    if (connectionState === "connected" && !terminalError) {
      return "Connected";
    }
    return "Disconnected";
  }, [connectionState, isBootstrapping, terminalError]);

  const effectiveError = terminalError ?? connectionError;

  return (
    <div className="lab-terminal">
      <div className="lab-terminal-toolbar">
        <div
          className="lab-terminal-status"
          data-state={
            statusLabel === "Connected" ? "connected" : connectionState
          }
        >
          {statusLabel === "Connecting" ? (
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
            onClick={() => void onReconnect()}
          >
            <RotateCcw size={12} strokeWidth={2.2} />
            Reconnect
          </button>
          <button
            type="button"
            className="lab-terminal-toolbar-btn"
            disabled={!remoteTerminalRef.current}
            onClick={() => sendInput("\u0003")}
          >
            Ctrl+C
          </button>
        </div>
      </div>

      <div className="lab-terminal-stage">{bootstrapStage}</div>

      {effectiveError ? (
        <div className="lab-terminal-error">
          <AlertCircle size={14} strokeWidth={2.2} />
          <span>{effectiveError}</span>
        </div>
      ) : null}

      <div ref={containerRef} className="lab-terminal-surface" />
    </div>
  );
}

