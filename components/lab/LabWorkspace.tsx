"use client";

import dynamic from "next/dynamic";
import { useAction } from "convex/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { Globe, SquareTerminal } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { LabEditorHeader } from "./LabEditorHeader";
import { LabPtyTerminal } from "./LabPtyTerminal";
import { LabSidebar } from "./LabSidebar";
import { useLabSandboxClient } from "./useLabSandboxClient";

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
      <div className="flex h-full items-center justify-center text-xs text-fg-faint">
        Loading editor...
      </div>
    ),
  },
) as ComponentType<MonacoEditorProps>;

type LabWorkspaceProps = {
  threadId: string;
};

type FileEntry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: string;
};

type LabTab = "terminal" | "preview";

type PersistedState = {
  currentPath?: string;
  selectedFilePath?: string;
  activeTab?: LabTab;
  activePreviewPort?: number;
};

function getStorageKey(threadId: string): string {
  return `studi.lab.workspace.${threadId}`;
}

function normalizeLabPath(value?: string | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw || raw === "." || raw === "/") {
    return ".";
  }

  const normalized = raw
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "");

  if (!normalized || normalized === ".") {
    return ".";
  }

  if (normalized.startsWith("/") || normalized.split("/").includes("..")) {
    return null;
  }

  return normalized;
}

function pickLanguage(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx")) return "javascript";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".md")) return "markdown";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".sh")) return "shell";
  if (lower.endsWith(".rs")) return "rust";
  return "plaintext";
}

function withCacheBust(path: string, nonce: number) {
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}ts=${nonce}`;
}

export function LabWorkspace({ threadId }: LabWorkspaceProps) {
  const listFilesAction = useAction(api.labIde.listLabFiles);
  const readFileAction = useAction(api.labIde.readLabFile);
  const writeFileAction = useAction(api.labIde.writeLabFile);
  const {
    sandbox,
    connectionState,
    error: connectionError,
    availablePorts,
    reconnect,
  } = useLabSandboxClient(threadId);

  const [currentPath, setCurrentPath] = useState(".");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [baselineValue, setBaselineValue] = useState("");
  const [isBinary, setIsBinary] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [dismissedPreviewPorts, setDismissedPreviewPorts] = useState<number[]>(
    [],
  );
  const [pendingPreviewPort, setPendingPreviewPort] = useState<number | null>(
    null,
  );
  const [activePreviewPort, setActivePreviewPort] = useState<number | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const initialHydratedRef = useRef(false);
  const initialSelectedFileRef = useRef<string | null>(null);

  const isDirty = selectedFilePath !== null && editorValue !== baselineValue;

  useEffect(() => {
    if (initialHydratedRef.current) {
      return;
    }
    initialHydratedRef.current = true;

    const raw = window.localStorage.getItem(getStorageKey(threadId));
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as PersistedState;
      setCurrentPath(normalizeLabPath(parsed.currentPath) ?? ".");

      if (parsed.selectedFilePath) {
        const selectedPath = normalizeLabPath(parsed.selectedFilePath);
        if (selectedPath) {
          setSelectedFilePath(selectedPath);
          initialSelectedFileRef.current = selectedPath;
        }
      }

      if (parsed.activeTab === "preview") {
        setIsPreviewOpen(true);
      }
      if (typeof parsed.activePreviewPort === "number") {
        setActivePreviewPort(parsed.activePreviewPort);
      }
    } catch {
      /* ignore persisted state */
    }
  }, [threadId]);

  useEffect(() => {
    const payload: PersistedState = {
      currentPath,
      selectedFilePath: selectedFilePath ?? undefined,
      activeTab: isPreviewOpen ? "preview" : "terminal",
      activePreviewPort: activePreviewPort ?? undefined,
    };
    window.localStorage.setItem(getStorageKey(threadId), JSON.stringify(payload));
  }, [activePreviewPort, isPreviewOpen, currentPath, selectedFilePath, threadId]);

  const refreshEntries = useCallback(
    async (pathOverride?: string) => {
      const resolvedPath = normalizeLabPath(pathOverride ?? currentPath);
      if (!resolvedPath) {
        setWorkspaceError("Only lab workspace paths are supported.");
        setCurrentPath(".");
        setEntries([]);
        return;
      }

      setIsLoadingFiles(true);
      setWorkspaceError(null);

      try {
        const response = await listFilesAction({
          threadId,
          path: resolvedPath,
        });

        if (response.status === "failed") {
          const hint = response.error.hint ? ` ${response.error.hint}` : "";
          const endpoint = response.error.endpoint
            ? ` [${response.error.endpoint}]`
            : "";
          setWorkspaceError(`${response.summary}${hint}${endpoint}`);
          return;
        }

        const sorted = [...response.entries].sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        setCurrentPath(normalizeLabPath(response.path) ?? ".");
        setEntries(sorted);
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [currentPath, listFilesAction, threadId],
  );

  const openFile = useCallback(
    async (path: string) => {
      const safePath = normalizeLabPath(path);
      if (!safePath) {
        setWorkspaceError("Only lab workspace files can be opened.");
        return;
      }

      setIsLoadingFile(true);
      setWorkspaceError(null);
      try {
        const response = await readFileAction({
          threadId,
          path: safePath,
          offset: 1,
          limit: 50_000,
        });
        if (response.status === "failed") {
          const hint = response.error.hint ? ` ${response.error.hint}` : "";
          setWorkspaceError(`${response.summary}${hint}`);
          return;
        }
        setSelectedFilePath(response.path);
        setEditorValue(response.content);
        setBaselineValue(response.content);
        setIsBinary(response.isBinary);
        setIsTruncated(response.truncated);
      } finally {
        setIsLoadingFile(false);
      }
    },
    [readFileAction, threadId],
  );

  useEffect(() => {
    void refreshEntries();
  }, [refreshEntries]);

  useEffect(() => {
    const initialPath = initialSelectedFileRef.current;
    if (!initialPath) {
      return;
    }
    initialSelectedFileRef.current = null;
    void openFile(initialPath);
  }, [openFile]);

  const discardEditorState = useCallback(() => {
    setSelectedFilePath(null);
    setEditorValue("");
    setBaselineValue("");
    setIsBinary(false);
    setIsTruncated(false);
  }, []);

  const confirmDiscardUnsavedChanges = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm("You have unsaved changes. Discard them?");
  }, [isDirty]);

  const handleNavigate = useCallback(
    (path: string) => {
      const safePath = normalizeLabPath(path);
      if (!safePath) {
        setWorkspaceError("Navigation is limited to the lab workspace.");
        return;
      }
      if (!confirmDiscardUnsavedChanges()) return;
      if (isDirty) {
        discardEditorState();
      }
      void refreshEntries(safePath);
    },
    [confirmDiscardUnsavedChanges, discardEditorState, isDirty, refreshEntries],
  );

  const handleOpenFile = useCallback(
    (path: string) => {
      const safePath = normalizeLabPath(path);
      if (!safePath) {
        setWorkspaceError("Only lab workspace files can be opened.");
        return;
      }
      if (safePath === selectedFilePath) return;
      if (!confirmDiscardUnsavedChanges()) return;
      void openFile(safePath);
    },
    [confirmDiscardUnsavedChanges, openFile, selectedFilePath],
  );

  const saveFile = useCallback(async () => {
    if (!selectedFilePath || isBinary || isTruncated) return;

    setIsSavingFile(true);
    setWorkspaceError(null);
    try {
      const response = await writeFileAction({
        threadId,
        path: selectedFilePath,
        content: editorValue,
      });
      if (response.status === "failed") {
        const hint = response.error.hint ? ` ${response.error.hint}` : "";
        setWorkspaceError(`${response.summary}${hint}`);
        return;
      }
      setBaselineValue(editorValue);
      await refreshEntries(currentPath);
    } finally {
      setIsSavingFile(false);
    }
  }, [
    currentPath,
    editorValue,
    isBinary,
    isTruncated,
    refreshEntries,
    selectedFilePath,
    threadId,
    writeFileAction,
  ]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveFile]);

  useEffect(() => {
    setDismissedPreviewPorts([]);
    setPendingPreviewPort(null);
    setActivePreviewPort(null);
    setPreviewError(null);
    setPreviewNonce(0);
  }, [threadId]);

  useEffect(() => {
    if (
      activePreviewPort !== null &&
      !availablePorts.includes(activePreviewPort)
    ) {
      setActivePreviewPort(null);
      setIsPreviewOpen(false);
    }
  }, [activePreviewPort, availablePorts]);

  useEffect(() => {
    const nextPending = availablePorts.find(
      (port) =>
        port !== activePreviewPort && !dismissedPreviewPorts.includes(port),
    );
    setPendingPreviewPort(nextPending ?? null);
  }, [activePreviewPort, availablePorts, dismissedPreviewPorts]);

  const openPreviewForPort = useCallback(
    (port: number) => {
      if (!sandbox) {
        setPreviewError("Preview is unavailable until the sandbox reconnects.");
        return;
      }

      setPreviewError(null);
      setActivePreviewPort(port);
      setPendingPreviewPort((current) => (current === port ? null : current));
      setPreviewNonce(Date.now());
      setIsPreviewOpen(true);
    },
    [sandbox],
  );

  const dismissPreviewPrompt = useCallback(() => {
    if (pendingPreviewPort === null) {
      return;
    }
    setDismissedPreviewPorts((previous) =>
      Array.from(new Set([...previous, pendingPreviewPort])),
    );
    setPendingPreviewPort(null);
  }, [pendingPreviewPort]);

  const previewSrc = useMemo(() => {
    if (!sandbox || activePreviewPort === null) {
      return null;
    }
    return withCacheBust(sandbox.hosts.getUrl(activePreviewPort), previewNonce);
  }, [activePreviewPort, previewNonce, sandbox]);

  const editorLanguage = useMemo(
    () => (selectedFilePath ? pickLanguage(selectedFilePath) : "plaintext"),
    [selectedFilePath],
  );

  const noopOutputChunk = useCallback((_chunk: string) => {}, []);

  return (
    <section className="lab-workspace">
      <LabSidebar
        currentPath={currentPath}
        entries={entries}
        selectedFilePath={selectedFilePath}
        isLoadingFiles={isLoadingFiles}
        onNavigate={handleNavigate}
        onOpenFile={handleOpenFile}
        onRefresh={() => void refreshEntries()}
      />

      <div className="lab-main-col">
        {pendingPreviewPort !== null ? (
          <div className="lab-info-bar">
            Detected an app on port {pendingPreviewPort}. Open preview?
            <button
              type="button"
              className="lab-preview-inline-btn"
              onClick={() => openPreviewForPort(pendingPreviewPort)}
            >
              Open Preview
            </button>
            <button
              type="button"
              className="lab-preview-inline-btn"
              onClick={dismissPreviewPrompt}
            >
              Dismiss
            </button>
          </div>
        ) : null}
        {isTruncated && selectedFilePath && !isBinary ? (
          <div className="lab-warning-bar">
            Large file preview is truncated. Saving is disabled to protect file
            integrity.
          </div>
        ) : null}
        {previewError ? <div className="lab-error-bar">{previewError}</div> : null}
        {workspaceError ? <div className="lab-error-bar">{workspaceError}</div> : null}

        <div className="lab-top-row">
          <div className="lab-editor-col">
            <LabEditorHeader
              selectedFilePath={selectedFilePath}
              isDirty={isDirty}
              isSaving={isSavingFile}
              isBinary={isBinary}
              isTruncated={isTruncated}
              onSave={() => void saveFile()}
            />

            <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
              {!selectedFilePath ? (
                <div className="lab-editor-empty">
                  <span>Select a file to open it</span>
                </div>
              ) : isBinary ? (
                <div className="lab-editor-empty">
                  <span>Binary file — preview not supported</span>
                </div>
              ) : isLoadingFile ? (
                <div className="lab-editor-empty">
                  <span>Loading…</span>
                </div>
              ) : (
                <MonacoEditor
                  height="100%"
                  language={editorLanguage}
                  value={editorValue}
                  onChange={(value: string | undefined) => setEditorValue(value ?? "")}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 12.5,
                    lineNumbersMinChars: 3,
                    automaticLayout: true,
                    tabSize: 2,
                    padding: { top: 12, bottom: 12 },
                    readOnly: isTruncated,
                    fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", monospace',
                    fontLigatures: true,
                    renderLineHighlight: "gutter",
                    scrollBeyondLastLine: false,
                    overviewRulerBorder: false,
                  }}
                />
              )}
            </div>
          </div>

          {isPreviewOpen && (
            <div className="lab-preview-col">
              <div className="lab-preview-panel">
                <div className="lab-preview-controls">
                  <span className="lab-preview-label">
                    {activePreviewPort
                      ? `Previewing port ${activePreviewPort}`
                      : availablePorts.length > 0
                        ? `Detected ports: ${availablePorts.join(", ")}`
                        : "No preview port selected"}
                  </span>
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    <button
                      type="button"
                      className="lab-preview-btn"
                      disabled={!activePreviewPort}
                      onClick={() => setPreviewNonce(Date.now())}
                      title="Refresh preview"
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      className="lab-preview-btn"
                      onClick={() => setIsPreviewOpen(false)}
                      title="Close preview"
                    >
                      Close
                    </button>
                  </div>
                </div>

                {previewSrc ? (
                  <>
                    <div className="lab-preview-frame-wrap">
                      <iframe
                        key={previewSrc}
                        title="lab-preview"
                        className="lab-preview-frame"
                        src={previewSrc}
                      />
                    </div>
                    <div className="lab-preview-fallback-row">
                      <a
                        className="lab-preview-fallback-link"
                        href={previewSrc}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in new tab
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="lab-preview-empty">
                    Start a web server in the terminal. When CodeSandbox exposes a
                    previewable port, you can open it here directly.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="lab-terminal-col">
          <div className="lab-terminal-tabs">
            <button
              type="button"
              className="lab-terminal-tab"
              data-active={true}
            >
              <SquareTerminal size={12} strokeWidth={2} />
              Terminal
            </button>
            {!isPreviewOpen && (
              <button
                type="button"
                className="lab-terminal-tab"
                data-active={false}
                onClick={() => setIsPreviewOpen(true)}
              >
                <Globe size={12} strokeWidth={2} />
                Preview
              </button>
            )}
          </div>
          <div className="lab-terminal-panel">
            <LabPtyTerminal
              sandbox={sandbox}
              connectionState={connectionState}
              connectionError={connectionError}
              onReconnect={reconnect}
              onOutputChunk={noopOutputChunk}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

