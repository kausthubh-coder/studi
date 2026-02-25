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

type PersistedState = {
  currentPath?: string;
  selectedFilePath?: string;
  commandInput?: string;
};

function getStorageKey(threadId: string): string {
  return `studi.lab.workspace.${threadId}`;
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
  return "plaintext";
}

function buildParentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  if (trimmed === "workspace") {
    return "workspace";
  }
  const parts = trimmed.split("/");
  parts.pop();
  if (parts.length === 0) {
    return "workspace";
  }
  return parts.join("/");
}

export function LabWorkspace({ threadId }: LabWorkspaceProps) {
  const listFilesAction = useAction(api.labIde.listLabFiles);
  const readFileAction = useAction(api.labIde.readLabFile);
  const writeFileAction = useAction(api.labIde.writeLabFile);
  const runCommandAction = useAction(api.labIde.runLabCommand);

  const [currentPath, setCurrentPath] = useState("workspace");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [isBinary, setIsBinary] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState("pwd && ls");
  const [isRunningCommand, setIsRunningCommand] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<string>("");
  const [lastExitCode, setLastExitCode] = useState<number | null>(null);

  const initialHydratedRef = useRef(false);
  const [baselineValue, setBaselineValue] = useState("");
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
      if (parsed.currentPath) {
        setCurrentPath(parsed.currentPath);
      }
      if (parsed.selectedFilePath) {
        setSelectedFilePath(parsed.selectedFilePath);
      }
      if (parsed.commandInput) {
        setCommandInput(parsed.commandInput);
      }
    } catch {}
  }, [threadId]);

  useEffect(() => {
    const payload: PersistedState = {
      currentPath,
      selectedFilePath: selectedFilePath ?? undefined,
      commandInput,
    };
    window.localStorage.setItem(
      getStorageKey(threadId),
      JSON.stringify(payload),
    );
  }, [threadId, currentPath, selectedFilePath, commandInput]);

  const refreshEntries = useCallback(
    async (pathOverride?: string) => {
      const targetPath = pathOverride ?? currentPath;
      setIsLoadingFiles(true);
      setWorkspaceError(null);
      try {
        const response = await listFilesAction({
          threadId,
          path: targetPath,
        });

        if (response.status === "failed") {
          setWorkspaceError(response.summary);
          return;
        }

        const sorted = [...response.entries].sort((a, b) => {
          if (a.isDir !== b.isDir) {
            return a.isDir ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        setCurrentPath(response.path);
        setEntries(sorted);
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [currentPath, listFilesAction, threadId],
  );

  const openFile = useCallback(
    async (path: string) => {
      setIsLoadingFile(true);
      setWorkspaceError(null);
      try {
        const response = await readFileAction({
          threadId,
          path,
          offset: 1,
          limit: 2000,
        });

        if (response.status === "failed") {
          setWorkspaceError(response.summary);
          return;
        }

        setSelectedFilePath(response.path);
        setEditorValue(response.content);
        setBaselineValue(response.content);
        setIsBinary(response.isBinary);
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
    if (!selectedFilePath) {
      return;
    }

    const exists = entries.some((entry) => entry.path === selectedFilePath);
    if (!exists) {
      return;
    }

    void openFile(selectedFilePath);
  }, [entries, openFile, selectedFilePath]);

  const breadcrumbs = useMemo(() => currentPath.split("/"), [currentPath]);

  const runCommand = useCallback(async () => {
    const command = commandInput.trim();
    if (!command) {
      return;
    }

    setIsRunningCommand(true);
    setWorkspaceError(null);
    try {
      const response = await runCommandAction({
        threadId,
        command,
        cwd: currentPath,
        timeoutSeconds: 120,
      });

      if (response.status === "failed") {
        setTerminalOutput(`${response.summary}\n${response.error.message}`);
        setLastExitCode(null);
        return;
      }

      setLastExitCode(response.exitCode ?? 0);
      setTerminalOutput(response.output || "(no output)");
      await refreshEntries(currentPath);
    } finally {
      setIsRunningCommand(false);
    }
  }, [commandInput, currentPath, refreshEntries, runCommandAction, threadId]);

  const saveFile = useCallback(async () => {
    if (!selectedFilePath || isBinary) {
      return;
    }

    setIsSavingFile(true);
    setWorkspaceError(null);
    try {
      const response = await writeFileAction({
        threadId,
        path: selectedFilePath,
        content: editorValue,
      });

      if (response.status === "failed") {
        setWorkspaceError(response.summary);
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
    refreshEntries,
    selectedFilePath,
    threadId,
    writeFileAction,
  ]);

  return (
    <section className="flex min-w-0 flex-1 border-l border-border bg-bg-card">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border-faint bg-bg-alt">
        <div className="flex items-center justify-between border-b border-border-faint px-3 py-2">
          <p className="font-heading text-xs uppercase tracking-[0.08em] text-fg-faint">
            Files
          </p>
          <button
            type="button"
            onClick={() => {
              void refreshEntries();
            }}
            className="text-xs text-fg-muted hover:text-fg"
          >
            Refresh
          </button>
        </div>

        <div className="border-b border-border-faint px-3 py-2 text-[11px] text-fg-faint">
          <button
            type="button"
            onClick={() => {
              const parent = buildParentPath(currentPath);
              void refreshEntries(parent);
            }}
            className="rounded border border-border-faint px-1.5 py-0.5 text-[10px] text-fg-muted hover:text-fg"
          >
            Up
          </button>
          <div className="mt-1 truncate">{currentPath}</div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {isLoadingFiles ? (
            <p className="px-1 py-2 text-xs text-fg-faint">Loading...</p>
          ) : entries.length === 0 ? (
            <p className="px-1 py-2 text-xs text-fg-faint">No files.</p>
          ) : (
            <ul className="space-y-0.5">
              {entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    onClick={() => {
                      if (entry.isDir) {
                        void refreshEntries(entry.path);
                        return;
                      }
                      void openFile(entry.path);
                    }}
                    className={`w-full truncate rounded px-2 py-1 text-left text-xs transition ${selectedFilePath === entry.path ? "bg-accent-dim text-accent" : "text-fg-muted hover:bg-bg-card hover:text-fg"}`}
                    title={entry.path}
                  >
                    {entry.isDir ? "[dir]" : "[file]"} {entry.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border-faint px-3 py-2">
          <div className="min-w-0">
            <p className="truncate font-heading text-sm text-fg">
              {selectedFilePath ?? "Select a file"}
            </p>
            <p className="truncate text-[11px] text-fg-faint">
              {breadcrumbs.join(" / ")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              void saveFile();
            }}
            disabled={!isDirty || isSavingFile || isBinary || !selectedFilePath}
            className="rounded border border-border px-2 py-1 text-xs text-fg-muted disabled:opacity-40"
          >
            {isSavingFile ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="min-h-0 flex-1">
          {!selectedFilePath ? (
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
              language={pickLanguage(selectedFilePath)}
              value={editorValue}
              onChange={(value: string | undefined) =>
                setEditorValue(value ?? "")
              }
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbersMinChars: 3,
                automaticLayout: true,
                tabSize: 2,
                padding: { top: 10 },
              }}
            />
          )}
        </div>

        <div className="border-t border-border-faint">
          <div className="flex items-center gap-2 px-3 py-2">
            <input
              value={commandInput}
              onChange={(event) => setCommandInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void runCommand();
                }
              }}
              placeholder="Run command in sandbox"
              className="h-8 min-w-0 flex-1 rounded border border-border bg-bg px-2 text-xs text-fg outline-none"
            />
            <button
              type="button"
              onClick={() => {
                void runCommand();
              }}
              disabled={isRunningCommand}
              className="h-8 rounded border border-border px-3 text-xs text-fg-muted disabled:opacity-50"
            >
              {isRunningCommand ? "Running..." : "Run"}
            </button>
          </div>

          <div className="max-h-40 overflow-y-auto border-t border-border-faint bg-[#111318] px-3 py-2 font-mono text-[11px] text-[#d8d8d8]">
            {lastExitCode !== null ? (
              <p className="mb-1 text-[10px] text-[#9ea3b2]">
                Exit code: {lastExitCode}
              </p>
            ) : null}
            <pre className="whitespace-pre-wrap break-words">
              {terminalOutput || "No command output yet."}
            </pre>
          </div>
        </div>

        {workspaceError ? (
          <div className="border-t border-border-faint bg-accent-dim px-3 py-2 text-xs text-accent">
            {workspaceError}
          </div>
        ) : null}
      </div>
    </section>
  );
}
