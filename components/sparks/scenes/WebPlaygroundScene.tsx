"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WebPlaygroundPayload } from "@/lib/sparks/contracts";

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
      <div className="web-spark-editor-loading">Loading editor...</div>
    ),
  },
) as ComponentType<MonacoEditorProps>;

type WebPlaygroundSceneProps = {
  payload: WebPlaygroundPayload;
  isExpanded: boolean;
};

type WebLogLevel = "log" | "warn" | "error";

type WebLogEntry = {
  id: string;
  level: WebLogLevel;
  text: string;
};

type EditorTab = "html" | "css" | "js";

type RunStatus = "idle" | "running" | "success" | "error";

function makeId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function escapeInlineScript(text: string): string {
  return text.replace(/<\/(script)/gi, "<\\/$1");
}

function ensureHtmlDocument(rawHtml: string): string {
  const trimmed = rawHtml.trim();
  let html = trimmed.length > 0 ? trimmed : "<div>Hello, Studi!</div>";

  if (!/<html[\s>]/i.test(html)) {
    html = `<!doctype html>\n<html><head></head><body>${html}</body></html>`;
  }

  if (!/<head[\s>]/i.test(html)) {
    html = html.replace(/<html([^>]*)>/i, "<html$1><head></head>");
  }

  if (!/<body[\s>]/i.test(html)) {
    if (/<\/head>/i.test(html)) {
      html = html.replace(/<\/head>/i, "</head><body></body>");
    } else if (/<\/html>/i.test(html)) {
      html = html.replace(/<\/html>/i, "<body></body></html>");
    } else {
      html = `${html}<body></body>`;
    }
  }

  if (!/<!doctype html>/i.test(html)) {
    html = `<!doctype html>\n${html}`;
  }

  return html;
}

function buildSrcDoc(
  htmlInput: string,
  cssInput: string,
  jsInput: string,
): string {
  const base = ensureHtmlDocument(htmlInput);
  const cssTag = cssInput.trim()
    ? `<style data-studi-web-css>\n${cssInput}\n</style>`
    : "";

  const bridgeScript = `<script data-studi-web-bridge>\n(function(){\n  const PREFIX = "__studi_web_playground";\n  function send(level, text){\n    try {\n      parent.postMessage({ type: PREFIX, level: level, text: String(text) }, "*");\n    } catch (_error) {\n      // ignore bridge errors inside sandbox\n    }\n  }\n  const original = {\n    log: console.log.bind(console),\n    warn: console.warn.bind(console),\n    error: console.error.bind(console),\n  };\n  console.log = function(){\n    original.log.apply(console, arguments);\n    send("log", Array.from(arguments).map(String).join(" "));\n  };\n  console.warn = function(){\n    original.warn.apply(console, arguments);\n    send("warn", Array.from(arguments).map(String).join(" "));\n  };\n  console.error = function(){\n    original.error.apply(console, arguments);\n    send("error", Array.from(arguments).map(String).join(" "));\n  };\n  window.addEventListener("error", function(event){\n    send("error", event.message || "Unknown runtime error");\n  });\n  window.addEventListener("unhandledrejection", function(event){\n    const reason = event.reason;\n    send("error", reason instanceof Error ? reason.message : String(reason));\n  });\n  send("log", "Preview loaded.");\n})();\n</script>`;

  const userScript = jsInput.trim()
    ? `<script data-studi-web-js>\n${escapeInlineScript(jsInput)}\n</script>`
    : "";

  const withCss = cssTag
    ? base.replace(/<\/head>/i, `${cssTag}\n</head>`)
    : base;

  return withCss.replace(
    /<\/body>/i,
    `${bridgeScript}\n${userScript}\n</body>`,
  );
}

export default function WebPlaygroundScene({
  payload,
  isExpanded,
}: WebPlaygroundSceneProps) {
  const [html, setHtml] = useState(payload.html);
  const [css, setCss] = useState(payload.css ?? "");
  const [js, setJs] = useState(payload.js ?? "");
  const [activeTab, setActiveTab] = useState<EditorTab>("html");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [logs, setLogs] = useState<WebLogEntry[]>([]);
  const [srcDoc, setSrcDoc] = useState(() =>
    buildSrcDoc(payload.html, payload.css ?? "", payload.js ?? ""),
  );

  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const tabValue = activeTab === "html" ? html : activeTab === "css" ? css : js;
  const tabLanguage = activeTab === "html" ? "html" : activeTab;

  const tabLabel = useMemo(
    () => ({
      html: "index.html",
      css: "styles.css",
      js: "script.js",
    }),
    [],
  );

  const reset = useCallback(() => {
    setHtml(payload.html);
    setCss(payload.css ?? "");
    setJs(payload.js ?? "");
    setLogs([]);
    setRunStatus("idle");
    setSrcDoc(buildSrcDoc(payload.html, payload.css ?? "", payload.js ?? ""));
  }, [payload.css, payload.html, payload.js]);

  const run = useCallback(() => {
    setRunStatus("running");
    setLogs([]);
    setSrcDoc(buildSrcDoc(html, css, js));
  }, [css, html, js]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) {
        return;
      }

      const data = event.data as
        | { type?: string; level?: WebLogLevel; text?: string }
        | undefined;
      if (!data || data.type !== "__studi_web_playground") {
        return;
      }

      const level =
        data.level === "warn" || data.level === "error" ? data.level : "log";
      const text = typeof data.text === "string" ? data.text : "";
      setLogs((prev) => [
        ...prev,
        {
          id: makeId(),
          level,
          text,
        },
      ]);

      setRunStatus((current) => {
        if (level === "error") {
          return "error";
        }
        return current === "running" ? "success" : current;
      });
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return (
    <div
      className="web-spark-shell"
      style={isExpanded ? { flex: 1 } : undefined}
    >
      <div className="web-spark-toolbar">
        <div className="web-spark-tab-row">
          {(["html", "css", "js"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className="web-spark-tab-btn"
              data-active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tabLabel[tab]}
            </button>
          ))}
        </div>
        <div className="web-spark-toolbar-actions">
          <button type="button" className="web-spark-reset-btn" onClick={reset}>
            Reset
          </button>
          <button type="button" className="web-spark-run-btn" onClick={run}>
            Run
          </button>
        </div>
      </div>

      <div className="web-spark-instructions">
        <p>
          {payload.instructions ??
            "Edit HTML, CSS, and JavaScript, then run to preview changes."}
        </p>
        {payload.runHint ? (
          <p className="web-spark-hint">{payload.runHint}</p>
        ) : null}
      </div>

      <div
        className="web-spark-layout"
        style={isExpanded ? { flex: 1 } : undefined}
      >
        <div className="web-spark-editor-shell">
          <MonacoEditor
            height={isExpanded ? "100%" : "320px"}
            language={tabLanguage}
            value={tabValue}
            onChange={(value: string | undefined) => {
              const next = value ?? "";
              if (activeTab === "html") {
                setHtml(next);
              } else if (activeTab === "css") {
                setCss(next);
              } else {
                setJs(next);
              }
            }}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbersMinChars: 3,
              automaticLayout: true,
              padding: { top: 10 },
              tabSize: 2,
            }}
          />
        </div>

        <div className="web-spark-preview-shell" data-status={runStatus}>
          <div className="web-spark-preview-title">Preview</div>
          <iframe
            ref={frameRef}
            title="web-playground-preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            loading="lazy"
            className="web-spark-preview-frame"
          />
        </div>
      </div>

      <div className="web-spark-output-shell" data-status={runStatus}>
        <div className="web-spark-output-title">Console</div>
        {logs.length === 0 ? (
          <p className="web-spark-placeholder">
            Run the preview to see logs and errors.
          </p>
        ) : (
          logs.map((entry) => (
            <pre
              key={entry.id}
              className="web-spark-log"
              data-level={entry.level}
            >
              {entry.text}
            </pre>
          ))
        )}
      </div>

      <style jsx>{`
        .web-spark-shell {
          display: flex;
          flex-direction: column;
          background: #151410;
        }

        .web-spark-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.6rem;
          padding: 0.55rem 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .web-spark-tab-row {
          display: flex;
          gap: 0.35rem;
          flex-wrap: wrap;
        }

        .web-spark-tab-btn {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: transparent;
          color: #b8bcb5;
          border-radius: 999px;
          padding: 0.2rem 0.65rem;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 11px;
          cursor: pointer;
          transition: all 120ms ease;
        }

        .web-spark-tab-btn[data-active="true"] {
          border-color: color-mix(in srgb, var(--accent2) 60%, transparent);
          background: color-mix(in srgb, var(--accent2) 24%, transparent);
          color: #eef7ef;
        }

        .web-spark-toolbar-actions {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
        }

        .web-spark-reset-btn,
        .web-spark-run-btn {
          border-radius: 999px;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 120ms ease;
        }

        .web-spark-reset-btn {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: transparent;
          color: #b8bcb5;
          padding: 0.25rem 0.65rem;
        }

        .web-spark-reset-btn:hover {
          border-color: rgba(255, 255, 255, 0.28);
          color: #eef7ef;
        }

        .web-spark-run-btn {
          border: 1px solid
            color-mix(in srgb, var(--accent2) 55%, var(--border) 45%);
          background: var(--accent2);
          color: #11251f;
          padding: 0.3rem 0.85rem;
        }

        .web-spark-run-btn:hover {
          background: color-mix(in srgb, var(--accent2) 84%, #0e1714 16%);
          transform: translateY(-1px);
        }

        .web-spark-instructions {
          padding: 0.65rem 0.8rem;
          background: #1d1b16;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 0.81rem;
          color: #cccfca;
        }

        .web-spark-instructions p {
          margin: 0;
        }

        .web-spark-hint {
          margin-top: 0.35rem !important;
          color: #9ea39b;
          font-style: italic;
        }

        .web-spark-layout {
          display: grid;
          grid-template-columns: 1fr;
        }

        .web-spark-editor-shell {
          min-height: 230px;
        }

        .web-spark-editor-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 220px;
          background: #1f1f1f;
          color: #f6f5f2;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 0.82rem;
        }

        .web-spark-preview-shell {
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          background: #11100d;
          padding: 0.6rem;
        }

        .web-spark-preview-title {
          margin-bottom: 0.45rem;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 11px;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: #b5bbb3;
        }

        .web-spark-preview-frame {
          width: 100%;
          height: 280px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          background: #fff;
        }

        .web-spark-output-shell {
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          background: #14120f;
          padding: 0.65rem 0.75rem;
          min-height: 110px;
        }

        .web-spark-output-title {
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 11px;
          margin-bottom: 0.45rem;
          color: #aeb4aa;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .web-spark-placeholder {
          margin: 0;
          font-family: var(--font-jakarta), system-ui, sans-serif;
          font-size: 0.8rem;
          color: #7d847b;
        }

        .web-spark-log {
          margin: 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font-family: "SF Mono", "Fira Code", monospace;
          font-size: 0.75rem;
          line-height: 1.5;
        }

        .web-spark-log + .web-spark-log {
          margin-top: 0.45rem;
        }

        .web-spark-log[data-level="warn"] {
          color: #f1c680;
        }

        .web-spark-log[data-level="error"] {
          color: #ffada6;
        }

        @media (min-width: 700px) {
          .web-spark-layout {
            grid-template-columns: 1.05fr 0.95fr;
          }

          .web-spark-preview-shell {
            border-top: none;
            border-left: 1px solid rgba(255, 255, 255, 0.08);
          }

          .web-spark-preview-frame {
            height: 320px;
          }
        }
      `}</style>
    </div>
  );
}
