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
import { LabSidebar } from "./LabSidebar";
import { LabEditorHeader } from "./LabEditorHeader";
import { LabTerminal } from "./LabTerminal";

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

  // Hydrate persisted state
  useEffect(() => {
    if (initialHydratedRef.current) return;
    initialHydratedRef.current = true;

    const raw = window.localStorage.getItem(getStorageKey(threadId));
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.currentPath) setCurrentPath(parsed.currentPath);
      if (parsed.selectedFilePath) setSelectedFilePath(parsed.selectedFilePath);
      if (parsed.commandInput) setCommandInput(parsed.commandInput);
    } catch {
      /* ignore */
    }
  }, [threadId]);

  // Persist state
  useEffect(() => {
    const payload: PersistedState = {
      currentPath,
      selectedFilePath: selectedFilePath ?? undefined,
      commandInput,
    };
    window.localStorage.setItem(getStorageKey(threadId), JSON.stringify(payload));
  }, [threadId, currentPath, selectedFilePath, commandInput]);

  const refreshEntries = useCallback(
    async (pathOverride?: string) => {
      const targetPath = pathOverride ?? currentPath;
      setIsLoadingFiles(true);
      setWorkspaceError(null);
      try {
        const response = await listFilesAction({ threadId, path: targetPath });
        if (response.status === "failed") {
          setWorkspaceError(response.summary);
          return;
        }

        const sorted = [...response.entries].sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
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
        const response = await readFileAction({ threadId, path, offset: 1, limit: 2000 });
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
    if (!selectedFilePath) return;
    const exists = entries.some((entry) => entry.path === selectedFilePath);
    if (!exists) return;
    void openFile(selectedFilePath);
  }, [entries, openFile, selectedFilePath]);

  const runCommand = useCallback(async () => {
    const command = commandInput.trim();
    if (!command) return;

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
    if (!selectedFilePath || isBinary) return;

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
  }, [currentPath, editorValue, isBinary, refreshEntries, selectedFilePath, threadId, writeFileAction]);

  // Ctrl+S / Cmd+S keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void saveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveFile]);

  const handleNavigate = useCallback(
    (path: string) => {
      void refreshEntries(path);
    },
    [refreshEntries],
  );

  const handleOpenFile = useCallback(
    (path: string) => {
      void openFile(path);
    },
    [openFile],
  );

  const handleRefresh = useCallback(() => {
    void refreshEntries();
  }, [refreshEntries]);

  const handleSave = useCallback(() => {
    void saveFile();
  }, [saveFile]);

  const handleRunCommand = useCallback(() => {
    void runCommand();
  }, [runCommand]);

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
        onRefresh={handleRefresh}
      />

      <div className="lab-main">
        <LabEditorHeader
          selectedFilePath={selectedFilePath}
          isDirty={isDirty}
          isSaving={isSavingFile}
          isBinary={isBinary}
          onSave={handleSave}
        />

        <div style={{ flex: 1, minHeight: 0 }}>
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
              }}
            />
          )}
        </div>

        <LabTerminal
          commandInput={commandInput}
          onCommandInputChange={setCommandInput}
          onRunCommand={handleRunCommand}
          isRunning={isRunningCommand}
          terminalOutput={terminalOutput}
          lastExitCode={lastExitCode}
        />

        {workspaceError && (
          <div className="lab-error-bar">{workspaceError}</div>
        )}
      </div>
    </section>
  );
}
