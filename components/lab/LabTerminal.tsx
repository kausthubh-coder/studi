import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, Terminal } from "lucide-react";

type LabTerminalProps = {
  commandInput: string;
  onCommandInputChange: (value: string) => void;
  onRunCommand: () => void;
  isRunning: boolean;
  terminalOutput: string;
  lastExitCode: number | null;
};

const BUILTIN_SUGGESTIONS = [
  "ls",
  "ls -la",
  "pwd",
  "cat",
  "cd",
  "mkdir",
  "rm",
  "cp",
  "mv",
  "bun",
  "bun run",
  "bun install",
  "bun test",
  "bun run lint",
  "bun run build",
  "git status",
  "git diff",
  "git log --oneline",
  "python",
  "node",
];

const HISTORY_KEY = "studi.lab.terminal.history";

function loadCommandHistory(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .slice(-50);
  } catch {
    return [];
  }
}

export const LabTerminal = memo(function LabTerminal({
  commandInput,
  onCommandInputChange,
  onRunCommand,
  isRunning,
  terminalOutput,
  lastExitCode,
}: LabTerminalProps) {
  const [terminalHeight, setTerminalHeight] = useState(180);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [history, setHistory] = useState<string[]>(loadCommandHistory);
  const outputRef = useRef<HTMLDivElement>(null);
  const resizingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [terminalOutput]);

  // Save to history on run
  const handleRun = useCallback(() => {
    const trimmed = commandInput.trim();
    if (trimmed) {
      setHistory((previous) => {
        const next = [...previous];
        if (next[next.length - 1] !== trimmed) {
          next.push(trimmed);
          if (next.length > 50) next.shift();
          try {
            window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
        }
        return next;
      });
      setHistoryIdx(-1);
    }
    setShowSuggestions(false);
    onRunCommand();
  }, [commandInput, onRunCommand]);

  // Suggestions
  const suggestions = useMemo(() => {
    const input = commandInput.trim().toLowerCase();
    if (!input) return [];
    const all = [
      ...new Set([...history.slice().reverse(), ...BUILTIN_SUGGESTIONS]),
    ];
    return all.filter((s) => s.toLowerCase().includes(input)).slice(0, 8);
  }, [commandInput, history]);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (showSuggestions && suggestions.length > 0) {
          onCommandInputChange(suggestions[activeIdx]!);
          setShowSuggestions(false);
        } else {
          handleRun();
        }
        return;
      }

      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }

      // Arrow up/down for suggestions or history
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (showSuggestions && suggestions.length > 0) {
          setActiveIdx((prev) =>
            prev > 0 ? prev - 1 : suggestions.length - 1,
          );
        } else {
          // Navigate history
          if (history.length === 0) return;
          const next =
            historyIdx === -1
              ? history.length - 1
              : Math.max(0, historyIdx - 1);
          setHistoryIdx(next);
          onCommandInputChange(history[next]!);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (showSuggestions && suggestions.length > 0) {
          setActiveIdx((prev) =>
            prev < suggestions.length - 1 ? prev + 1 : 0,
          );
        } else {
          if (historyIdx === -1) return;
          const next = historyIdx + 1;
          if (next >= history.length) {
            setHistoryIdx(-1);
            onCommandInputChange("");
          } else {
            setHistoryIdx(next);
            onCommandInputChange(history[next]!);
          }
        }
        return;
      }

      // Tab for autocomplete
      if (e.key === "Tab" && suggestions.length > 0) {
        e.preventDefault();
        if (showSuggestions) {
          onCommandInputChange(suggestions[activeIdx]!);
          setShowSuggestions(false);
        } else {
          setShowSuggestions(true);
          setActiveIdx(0);
        }
      }
    },
    [
      activeIdx,
      handleRun,
      history,
      historyIdx,
      onCommandInputChange,
      showSuggestions,
      suggestions,
    ],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onCommandInputChange(e.target.value);
      setHistoryIdx(-1);
      if (e.target.value.trim()) {
        setShowSuggestions(true);
        setActiveIdx(0);
      } else {
        setShowSuggestions(false);
      }
    },
    [onCommandInputChange],
  );

  // Resize handle
  const handleResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizingRef.current = true;
      startYRef.current = e.clientY;
      startHeightRef.current = terminalHeight;

      const onMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return;
        const delta = startYRef.current - ev.clientY;
        setTerminalHeight(
          Math.min(400, Math.max(100, startHeightRef.current + delta)),
        );
      };
      const onUp = () => {
        resizingRef.current = false;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [terminalHeight],
  );

  const exitBadgeCode =
    lastExitCode === null ? null : lastExitCode === 0 ? "0" : "error";

  return (
    <div className="lab-terminal">
      {/* Resize handle */}
      <div
        className="lab-terminal-resize-handle"
        onMouseDown={handleResizeDown}
      />

      {/* Input row */}
      <div className="lab-terminal-input-row">
        <span className="lab-terminal-prompt">
          <Terminal size={13} strokeWidth={2.2} />
        </span>
        <input
          className="lab-terminal-input"
          value={commandInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (commandInput.trim() && suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onBlur={() => {
            // Delay to allow clicks on suggestions
            setTimeout(() => setShowSuggestions(false), 150);
          }}
          placeholder="Run a command..."
        />
        <button
          type="button"
          className="lab-terminal-run-btn"
          disabled={isRunning || !commandInput.trim()}
          onClick={handleRun}
        >
          {isRunning ? (
            <Loader2 size={12} className="animate-spin" strokeWidth={2.5} />
          ) : (
            <Play size={11} fill="currentColor" strokeWidth={0} />
          )}
          {isRunning ? "Running" : "Run"}
        </button>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="lab-terminal-suggestions">
            {suggestions.map((s, i) => (
              <button
                key={s}
                type="button"
                className="lab-terminal-suggestion"
                data-active={i === activeIdx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onCommandInputChange(s);
                  setShowSuggestions(false);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Output */}
      <div
        ref={outputRef}
        className="lab-terminal-output"
        style={{ height: terminalHeight }}
      >
        {exitBadgeCode !== null && (
          <div className="lab-terminal-exit-badge" data-code={exitBadgeCode}>
            exit {lastExitCode}
          </div>
        )}
        {terminalOutput ? (
          <pre>{terminalOutput}</pre>
        ) : (
          <p className="lab-terminal-output-placeholder">
            No command output yet.
          </p>
        )}
      </div>
    </div>
  );
});
