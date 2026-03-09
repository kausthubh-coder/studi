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
import { api } from "@/convex/_generated/api";
import { extractPreviewPortCandidates } from "@/lib/lab/preview";
import { LabEditorHeader } from "./LabEditorHeader";
import { LabPtyTerminal } from "./LabPtyTerminal";
import { LabSidebar } from "./LabSidebar";

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
  terminalSessionId?: string;
};

function getStorageKey(threadId: string): string {
  return `studi.lab.workspace.${threadId}`;
}

const SYSTEM_ROOT_PREFIXES = [
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/home",
  "/lib",
  "/lib64",
  "/media",
  "/mnt",
  "/opt",
  "/proc",
  "/root",
  "/run",
  "/sbin",
  "/srv",
  "/sys",
  "/tmp",
  "/usr",
  "/var",
];

function toWorkspacePath(value?: string | null): string | null {
  const raw = (value ?? "").trim();
  if (!raw || raw === "." || raw === "/") {
    return "workspace";
  }

  const normalized = raw.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) {
    return "workspace";
  }

  if (normalized === "/workspace") {
    return "workspace";
  }
  if (normalized.startsWith("/workspace/")) {
    return normalized.slice(1);
  }

  if (normalized.startsWith("/")) {
    return null;
  }

  const relative = normalized.replace(/^\.\/+/, "");
  if (!relative || relative === ".") {
    return "workspace";
  }
  if (relative === "workspace" || relative.startsWith("workspace/")) {
    return relative;
  }
  if (relative.includes("..")) {
    return null;
  }
  return `workspace/${relative}`;
}

function shouldResetPersistedPath(value?: string | null): boolean {
  const raw = (value ?? "").trim();
  if (!raw) {
    return false;
  }
  if (raw === "/" || raw === "\\") {
    return true;
  }
  const normalized = raw.replace(/\\/g, "/");
  if (SYSTEM_ROOT_PREFIXES.some((prefix) => normalized === prefix)) {
    return true;
  }
  return SYSTEM_ROOT_PREFIXES.some((prefix) => normalized.startsWith(`${prefix}/`));
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
  const getPreviewDescriptorAction = useAction(
    api.labIde.getLabPreviewProxyDescriptor,
  );

  const [currentPath, setCurrentPath] = useState("workspace");
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
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [workspaceMissing, setWorkspaceMissing] = useState(false);
  const [activeTab, setActiveTab] = useState<LabTab>("terminal");
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(
    null,
  );
  const [detectedPreviewPorts, setDetectedPreviewPorts] = useState<number[]>([]);
  const [dismissedPreviewPorts, setDismissedPreviewPorts] = useState<number[]>(
    [],
  );
  const [pendingPreviewPort, setPendingPreviewPort] = useState<number | null>(
    null,
  );
  const [activePreviewPort, setActivePreviewPort] = useState<number | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isOpeningPreview, setIsOpeningPreview] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const initialHydratedRef = useRef(false);
  const initialSelectedFileRef = useRef<string | null>(null);

  const isDirty = selectedFilePath !== null && editorValue !== baselineValue;

  useEffect(() => {
    if (initialHydratedRef.current) return;
    initialHydratedRef.current = true;

    const raw = window.localStorage.getItem(getStorageKey(threadId));
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PersistedState;
      const persistedPath = shouldResetPersistedPath(parsed.currentPath)
        ? "workspace"
        : toWorkspacePath(parsed.currentPath);
      setCurrentPath(persistedPath ?? "workspace");

      if (parsed.selectedFilePath) {
        const selectedPath = toWorkspacePath(parsed.selectedFilePath);
        if (selectedPath) {
          setSelectedFilePath(selectedPath);
          initialSelectedFileRef.current = selectedPath;
        }
      }

      if (parsed.activeTab === "terminal" || parsed.activeTab === "preview") {
        setActiveTab(parsed.activeTab);
      }
      if (typeof parsed.activePreviewPort === "number") {
        setActivePreviewPort(parsed.activePreviewPort);
      }
      if (parsed.terminalSessionId) {
        setTerminalSessionId(parsed.terminalSessionId);
      }
    } catch {
      /* ignore */
    }
  }, [threadId]);

  useEffect(() => {
    const payload: PersistedState = {
      currentPath,
      selectedFilePath: selectedFilePath ?? undefined,
      activeTab,
      activePreviewPort: activePreviewPort ?? undefined,
      terminalSessionId: terminalSessionId ?? undefined,
    };
    window.localStorage.setItem(
      getStorageKey(threadId),
      JSON.stringify(payload),
    );
  }, [activePreviewPort, activeTab, currentPath, selectedFilePath, terminalSessionId, threadId]);

  const refreshEntries = useCallback(
    async (pathOverride?: string) => {
      const resolvedPath = toWorkspacePath(pathOverride ?? currentPath);
      if (!resolvedPath) {
        setWorkspaceError("Only workspace paths are supported.");
        setCurrentPath("workspace");
        setEntries([]);
        setWorkspaceMissing(false);
        return;
      }

      setIsLoadingFiles(true);
      setWorkspaceError(null);
      setWorkspaceMissing(false);

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

        if (response.workspaceMissing) {
          setCurrentPath("workspace");
          setEntries([]);
          setSelectedFilePath(null);
          setEditorValue("");
          setBaselineValue("");
          setIsBinary(false);
          setIsTruncated(false);
          setWorkspaceMissing(true);
          return;
        }

        const sorted = [...response.entries].sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        setCurrentPath(toWorkspacePath(response.path) ?? "workspace");
        setEntries(sorted);
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [currentPath, listFilesAction, threadId],
  );

  const openFile = useCallback(
    async (path: string) => {
      const safePath = toWorkspacePath(path);
      if (!safePath) {
        setWorkspaceError("Only workspace files can be opened.");
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
    if (!initialPath) return;
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
      const safePath = toWorkspacePath(path);
      if (!safePath) {
        setWorkspaceError("Navigation is limited to workspace.");
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
      const safePath = toWorkspacePath(path);
      if (!safePath) {
        setWorkspaceError("Only workspace files can be opened.");
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

  const openPreviewForPort = useCallback(
    async (port: number) => {
      setIsOpeningPreview(true);
      setPreviewError(null);
      setWorkspaceNotice(null);

      try {
        const response = await getPreviewDescriptorAction({
          threadId,
          port,
        });

        if (response.status === "failed") {
          const hint = response.error.hint ? ` ${response.error.hint}` : "";
          setPreviewError(`${response.summary}${hint}`);
          return;
        }

        setActivePreviewPort(port);
        setPendingPreviewPort((current) => (current === port ? null : current));
        setPreviewPath(response.proxyPath);
        setPreviewNonce(Date.now());
        setActiveTab("preview");
      } finally {
        setIsOpeningPreview(false);
      }
    },
    [getPreviewDescriptorAction, threadId],
  );

  const handleTerminalOutput = useCallback((chunk: string) => {
    const ports = extractPreviewPortCandidates(chunk);
    if (ports.length === 0) {
      return;
    }

    setDetectedPreviewPorts((previous) =>
      Array.from(new Set([...previous, ...ports])).sort((a, b) => a - b),
    );

    setPendingPreviewPort((previous) => {
      if (previous !== null) {
        return previous;
      }
      const next = ports.find((port) => !dismissedPreviewPorts.includes(port));
      return next ?? null;
    });
  }, [dismissedPreviewPorts]);

  useEffect(() => {
    setDetectedPreviewPorts([]);
    setDismissedPreviewPorts([]);
    setPendingPreviewPort(null);
    setActivePreviewPort(null);
    setPreviewPath(null);
    setPreviewError(null);
    setPreviewNonce(0);
    setTerminalSessionId(null);
  }, [threadId]);

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
    if (!previewPath) {
      return null;
    }
    return withCacheBust(previewPath, previewNonce);
  }, [previewNonce, previewPath]);

  const editorLanguage = useMemo(
    () => (selectedFilePath ? pickLanguage(selectedFilePath) : "plaintext"),
    [selectedFilePath],
  );

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

      <div className="lab-main">
        <LabEditorHeader
          selectedFilePath={selectedFilePath}
          isDirty={isDirty}
          isSaving={isSavingFile}
          isBinary={isBinary}
          isTruncated={isTruncated}
          onSave={() => void saveFile()}
        />

        <div style={{ flex: 1, minHeight: 0 }}>
          {workspaceMissing ? (
            <div className="lab-workspace-missing">
              <p className="lab-workspace-missing-title">
                Workspace directory not found
              </p>
              <p className="lab-workspace-missing-copy">
                This lab is restricted to `workspace`. Refresh after the lab
                creates the folder.
              </p>
              <div className="lab-workspace-missing-actions">
                <button
                  type="button"
                  className="lab-workspace-missing-btn"
                  onClick={() => void refreshEntries("workspace")}
                  disabled={isLoadingFiles}
                >
                  Retry
                </button>
              </div>
            </div>
          ) : !selectedFilePath ? (
            <div className="flex h-full items-center justify-center text-xs text-fg-faint">
              Select a file to open it.
            </div>
          ) : isBinary ? (
            <div className="flex h-full items-center justify-center text-xs text-fg-faint">
              Binary file preview is not supported.
            </div>
          ) : isLoadingFile ? (
            <div className="flex h-full items-center justify-center text-xs text-fg-faint">
              Loading file...
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
                fontSize: 12,
                lineNumbersMinChars: 3,
                automaticLayout: true,
                tabSize: 2,
                padding: { top: 10 },
                readOnly: isTruncated,
              }}
            />
          )}
        </div>

        {pendingPreviewPort !== null ? (
          <div className="lab-info-bar">
            Detected an app on port {pendingPreviewPort}. Open preview?
            <button
              type="button"
              className="lab-preview-inline-btn"
              onClick={() => void openPreviewForPort(pendingPreviewPort)}
              disabled={isOpeningPreview}
            >
              {isOpeningPreview ? "Opening..." : "Open Preview"}
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

        <div className="lab-bottom-tabs">
          <button
            type="button"
            className="lab-bottom-tab"
            data-active={activeTab === "terminal"}
            onClick={() => setActiveTab("terminal")}
          >
            Terminal
          </button>
          <button
            type="button"
            className="lab-bottom-tab"
            data-active={activeTab === "preview"}
            onClick={() => setActiveTab("preview")}
          >
            Preview
          </button>
        </div>

        <div className="lab-bottom-panel">
          {activeTab === "terminal" ? (
            <LabPtyTerminal
              threadId={threadId}
              sessionId={terminalSessionId}
              onSessionIdChange={setTerminalSessionId}
              onOutputChunk={handleTerminalOutput}
            />
          ) : null}

          {activeTab === "preview" ? (
            <div className="lab-preview-panel">
              <div className="lab-preview-controls">
                <span className="lab-preview-label">
                  {activePreviewPort
                    ? `Previewing port ${activePreviewPort}`
                    : detectedPreviewPorts.length > 0
                      ? `Detected ports: ${detectedPreviewPorts.join(", ")}`
                      : "No preview port selected"}
                </span>
                <button
                  type="button"
                  className="lab-preview-btn"
                  disabled={!activePreviewPort || isOpeningPreview}
                  onClick={() => {
                    if (activePreviewPort !== null) {
                      void openPreviewForPort(activePreviewPort);
                    }
                  }}
                >
                  Refresh
                </button>
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
                  Start a web server in the terminal. When Daytona detects a
                  previewable port, you will get a prompt to open it here.
                </div>
              )}
            </div>
          ) : null}
        </div>

        {isTruncated && selectedFilePath && !isBinary ? (
          <div className="lab-warning-bar">
            Large file preview is truncated. Saving is disabled to protect file
            integrity.
          </div>
        ) : null}

        {workspaceNotice ? <div className="lab-info-bar">{workspaceNotice}</div> : null}
        {previewError ? <div className="lab-error-bar">{previewError}</div> : null}
        {workspaceError ? <div className="lab-error-bar">{workspaceError}</div> : null}
      </div>
    </section>
  );
}
