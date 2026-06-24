"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  Archive,
  FilePlus,
  FolderOpen,
  Play,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type LabSession = {
  _id: Id<"labSessions">;
  title?: string;
  status: "starting" | "ready" | "error" | "archived";
  workspacePath: string;
  previewUrls?: Array<{ port: number; url: string }>;
  lastError?: { message: string };
};

type FileEntry = {
  path: string;
  name: string;
  type: "file" | "directory";
  size?: number;
};

type CommandResult = {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  output?: string;
};

function getErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "data" in error &&
    error.data &&
    typeof error.data === "object" &&
    "message" in error.data &&
    typeof error.data.message === "string"
  ) {
    return error.data.message;
  }
  return error instanceof Error && error.message
    ? error.message
    : "Something went wrong.";
}

export function LabWorkspace({ threadId }: { threadId: string }) {
  const sessions = useQuery(api.labs.listLabSessions, { threadId });
  const createLab = useAction(api.labActions.createLab);
  const resumeLab = useAction(api.labActions.resumeLab);
  const archiveLab = useAction(api.labActions.archiveLab);
  const listFiles = useAction(api.labActions.listFiles);
  const readFile = useAction(api.labActions.readFile);
  const writeFile = useAction(api.labActions.writeFile);
  const createFile = useAction(api.labActions.createFile);
  const renamePath = useAction(api.labActions.renamePath);
  const deletePath = useAction(api.labActions.deletePath);
  const searchLab = useAction(api.labActions.search);
  const runCommand = useAction(api.labActions.runCommand);
  const getPreview = useAction(api.labActions.getPreview);

  const labs = useMemo(() => (sessions ?? []) as LabSession[], [sessions]);
  const [activeLabId, setActiveLabId] = useState<Id<"labSessions"> | null>(null);
  const activeLab = labs.find((lab) => lab._id === activeLabId) ?? labs[0] ?? null;
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [editorValue, setEditorValue] = useState("");
  const [newPath, setNewPath] = useState("main.py");
  const [command, setCommand] = useState("python main.py");
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ path: string; line?: number; content?: string }>>([]);
  const [previewPort, setPreviewPort] = useState("3000");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeLabId && labs[0]) {
      setActiveLabId(labs[0]._id);
    }
  }, [activeLabId, labs]);

  const refreshFiles = useCallback(async () => {
    if (!activeLab) return;
    setBusy("files");
    setError(null);
    try {
      const nextFiles = (await listFiles({
        labSessionId: activeLab._id,
        path: ".",
      })) as FileEntry[];
      setFiles(nextFiles);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }, [activeLab, listFiles]);

  useEffect(() => {
    void refreshFiles();
  }, [refreshFiles]);

  const openFile = useCallback(
    async (path: string) => {
      if (!activeLab) return;
      setBusy("read");
      setError(null);
      try {
        const content = await readFile({
          labSessionId: activeLab._id,
          path,
        });
        setSelectedPath(path);
        setEditorValue(content);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setBusy(null);
      }
    },
    [activeLab, readFile],
  );

  const onCreateLab = useCallback(async () => {
    setBusy("create");
    setError(null);
    try {
      const lab = (await createLab({
        threadId,
        title: "Studi lab",
        language: "python",
      })) as LabSession;
      setActiveLabId(lab._id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }, [createLab, threadId]);

  const onCreateFile = useCallback(async () => {
    if (!activeLab || !newPath.trim()) return;
    setBusy("create-file");
    setError(null);
    try {
      await createFile({
        labSessionId: activeLab._id,
        path: newPath.trim(),
        content: "",
      });
      setSelectedPath(newPath.trim());
      setEditorValue("");
      await refreshFiles();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }, [activeLab, createFile, newPath, refreshFiles]);

  const onSave = useCallback(async () => {
    if (!activeLab || !selectedPath) return;
    setBusy("save");
    setError(null);
    try {
      await writeFile({
        labSessionId: activeLab._id,
        path: selectedPath,
        content: editorValue,
      });
      await refreshFiles();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }, [activeLab, editorValue, refreshFiles, selectedPath, writeFile]);

  const onRename = useCallback(async () => {
    if (!activeLab || !selectedPath || !newPath.trim()) return;
    setBusy("rename");
    setError(null);
    try {
      await renamePath({
        labSessionId: activeLab._id,
        oldPath: selectedPath,
        newPath: newPath.trim(),
      });
      setSelectedPath(newPath.trim());
      await refreshFiles();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }, [activeLab, newPath, refreshFiles, renamePath, selectedPath]);

  const onDelete = useCallback(async () => {
    if (!activeLab || !selectedPath) return;
    setBusy("delete");
    setError(null);
    try {
      await deletePath({
        labSessionId: activeLab._id,
        path: selectedPath,
      });
      setSelectedPath(null);
      setEditorValue("");
      await refreshFiles();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }, [activeLab, deletePath, refreshFiles, selectedPath]);

  const onRun = useCallback(async () => {
    if (!activeLab || !command.trim()) return;
    setBusy("run");
    setError(null);
    try {
      const result = (await runCommand({
        labSessionId: activeLab._id,
        command: command.trim(),
        timeoutSec: 60,
      })) as CommandResult;
      setCommandResult(result);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }, [activeLab, command, runCommand]);

  const onSearch = useCallback(async () => {
    if (!activeLab || !searchQuery.trim()) return;
    setBusy("search");
    setError(null);
    try {
      const results = await searchLab({
        labSessionId: activeLab._id,
        query: searchQuery.trim(),
        path: ".",
      });
      setSearchResults(results);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }, [activeLab, searchLab, searchQuery]);

  const onPreview = useCallback(async () => {
    if (!activeLab) return;
    const port = Number.parseInt(previewPort, 10);
    if (!Number.isFinite(port)) return;
    setBusy("preview");
    setError(null);
    try {
      const preview = await getPreview({
        labSessionId: activeLab._id,
        port,
      });
      window.open(preview.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }, [activeLab, getPreview, previewPort]);

  const onResume = useCallback(async () => {
    if (!activeLab) return;
    setBusy("resume");
    setError(null);
    try {
      await resumeLab({ labSessionId: activeLab._id });
      await refreshFiles();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }, [activeLab, refreshFiles, resumeLab]);

  const onArchive = useCallback(async () => {
    if (!activeLab) return;
    setBusy("archive");
    setError(null);
    try {
      await archiveLab({ labSessionId: activeLab._id });
      setActiveLabId(null);
      setFiles([]);
      setSelectedPath(null);
      setEditorValue("");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  }, [activeLab, archiveLab]);

  if (!activeLab) {
    return (
      <aside className="lab-workspace">
        <div className="lab-empty">
          <FolderOpen className="h-5 w-5" />
          <button
            type="button"
            className="lab-primary-btn"
            onClick={() => void onCreateLab()}
            disabled={busy === "create"}
          >
            Create lab
          </button>
          {error ? <p className="lab-error">{error}</p> : null}
        </div>
      </aside>
    );
  }

  const output = commandResult
    ? [commandResult.stdout, commandResult.stderr, commandResult.output]
        .filter(Boolean)
        .join("\n")
    : "";

  return (
    <aside className="lab-workspace">
      <header className="lab-header">
        <div>
          <p className="lab-kicker">Lab</p>
          <h2>{activeLab.title ?? "Studi lab"}</h2>
          <span>{activeLab.status} / {activeLab.workspacePath}</span>
        </div>
        <div className="lab-header-actions">
          <button type="button" className="lab-icon-btn" onClick={() => void onResume()} title="Resume">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button type="button" className="lab-icon-btn" onClick={() => void onArchive()} title="Archive">
            <Archive className="h-4 w-4" />
          </button>
        </div>
      </header>

      {error || activeLab.lastError ? (
        <div className="lab-error">{error ?? activeLab.lastError?.message}</div>
      ) : null}

      <div className="lab-body">
        <section className="lab-files">
          <div className="lab-row">
            <input
              value={newPath}
              onChange={(event) => setNewPath(event.target.value)}
              className="lab-input"
              aria-label="File path"
            />
            <button type="button" className="lab-icon-btn" onClick={() => void onCreateFile()} title="Create file">
              <FilePlus className="h-4 w-4" />
            </button>
          </div>
          <div className="lab-file-list" aria-busy={busy === "files"}>
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                className="lab-file-btn"
                data-active={file.path === selectedPath}
                onClick={() => {
                  if (file.type === "file") void openFile(file.path);
                }}
              >
                <span>{file.type === "directory" ? ">" : ""} {file.path}</span>
                {file.size ? <small>{file.size}b</small> : null}
              </button>
            ))}
          </div>
          <div className="lab-row">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="lab-input"
              placeholder="Search"
              aria-label="Search lab files"
            />
            <button type="button" className="lab-icon-btn" onClick={() => void onSearch()} title="Search">
              <Search className="h-4 w-4" />
            </button>
          </div>
          {searchResults.length > 0 ? (
            <div className="lab-search-results">
              {searchResults.slice(0, 8).map((match, index) => (
                <button
                  type="button"
                  key={`${match.path}-${match.line}-${index}`}
                  onClick={() => void openFile(match.path)}
                >
                  {match.path}{match.line ? `:${match.line}` : ""}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="lab-editor">
          <div className="lab-editor-toolbar">
            <span>{selectedPath ?? "No file selected"}</span>
            <div>
              <button type="button" className="lab-icon-btn" onClick={() => void onSave()} disabled={!selectedPath} title="Save">
                <Save className="h-4 w-4" />
              </button>
              <button type="button" className="lab-icon-btn" onClick={() => void onRename()} disabled={!selectedPath} title="Rename">
                <RefreshCw className="h-4 w-4" />
              </button>
              <button type="button" className="lab-icon-btn" onClick={() => void onDelete()} disabled={!selectedPath} title="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <textarea
            value={editorValue}
            onChange={(event) => setEditorValue(event.target.value)}
            className="lab-textarea"
            spellCheck={false}
            aria-label="Lab file editor"
          />
        </section>

        <section className="lab-terminal">
          <div className="lab-row">
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              className="lab-input"
              aria-label="Command"
            />
            <button type="button" className="lab-icon-btn" onClick={() => void onRun()} title="Run command">
              <Play className="h-4 w-4" />
            </button>
          </div>
          <pre>{output || "Ready."}</pre>
          <div className="lab-row">
            <input
              value={previewPort}
              onChange={(event) => setPreviewPort(event.target.value)}
              className="lab-input"
              aria-label="Preview port"
            />
            <button type="button" className="lab-primary-btn" onClick={() => void onPreview()}>
              Preview
            </button>
          </div>
        </section>
      </div>
    </aside>
  );
}
