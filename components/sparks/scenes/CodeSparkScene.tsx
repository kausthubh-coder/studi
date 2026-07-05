"use client";

import Editor from "@monaco-editor/react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type {
  CodeSparkFile,
  CodeSparkPayload,
  CodeSparkRunSummary,
} from "@/lib/sparks/contracts";

const codeSparksApi = api as unknown as {
  codeSparks: {
    getSessionForSpark: FunctionReference<"query", "public">;
    upsertSessionFromArtifact: FunctionReference<"mutation", "public">;
    writeFile: FunctionReference<"mutation", "public">;
  };
  codeSparkActions: {
    run: FunctionReference<"action", "public">;
  };
};

type CodeSparkSceneProps = {
  payload: CodeSparkPayload;
  title: string;
  threadId?: string | null;
  sparkId: string;
  isExpanded: boolean;
};

function languageForMonaco(language: string) {
  if (language === "python") return "python";
  if (language === "typescript") return "typescript";
  return "plaintext";
}

function statusLabel(run?: CodeSparkRunSummary | null) {
  if (!run) return "Not run";
  if (run.status === "passed") return "Passed";
  if (run.status === "failed") return "Failed";
  if (run.status === "timed_out") return "Timed out";
  if (run.status === "unavailable") return "Runtime unavailable";
  if (run.status === "running") return "Running";
  return "Queued";
}

function visibleOutput(run?: CodeSparkRunSummary | null) {
  if (!run) return "Run the spark to see output here.";
  const lines = [
    `$ ${run.command ?? "command"}`,
    run.stdout ? `stdout\n${run.stdout}` : "",
    run.stderr ? `stderr\n${run.stderr}` : "",
    typeof run.exitCode === "number" ? `exit ${run.exitCode}` : "",
    run.reason ? `reason ${run.reason}` : "",
  ].filter(Boolean);
  return lines.join("\n\n");
}

export default function CodeSparkScene({
  payload,
  title,
  threadId,
  sparkId,
  isExpanded,
}: CodeSparkSceneProps) {
  const [files, setFiles] = useState<CodeSparkFile[]>(payload.files);
  const [activePath, setActivePath] = useState(payload.activePath);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [localRun, setLocalRun] = useState<CodeSparkRunSummary | null>(
    payload.lastRun ?? null,
  );

  const hydrateArgs = threadId ? { threadId, sparkId } : "skip";
  const hydrated = useQuery(codeSparksApi.codeSparks.getSessionForSpark, hydrateArgs);
  const upsertSession = useMutation(
    codeSparksApi.codeSparks.upsertSessionFromArtifact,
  );
  const writeFile = useMutation(codeSparksApi.codeSparks.writeFile);
  const runCodeSpark = useAction(codeSparksApi.codeSparkActions.run);

  useEffect(() => {
    setFiles(payload.files);
    setActivePath(payload.activePath);
  }, [payload.files, payload.activePath]);

  useEffect(() => {
    if (!threadId) return;
    void upsertSession({
      threadId,
      sparkId,
      title,
      mode: payload.mode,
      language: payload.language,
      provider: payload.provider,
      providerStatus: payload.providerStatus,
      activePath: payload.activePath,
      files: payload.files,
      tests: payload.tests,
      runCommand: payload.runCommand,
      testCommand: payload.testCommand,
    }).catch((error) => {
      setLocalError(error instanceof Error ? error.message : String(error));
    });
  }, [threadId, sparkId, title, payload, upsertSession]);

  useEffect(() => {
    if (!hydrated) return;
    setFiles(hydrated.files);
    setActivePath(hydrated.activePath);
    setLocalRun(hydrated.lastRun ?? null);
  }, [hydrated]);

  const activeFile = useMemo(() => {
    return (
      files.find((file) => file.path === activePath) ??
      files.find((file) => file.editable) ??
      files[0]
    );
  }, [activePath, files]);

  const provider = hydrated?.provider ?? payload.provider;
  const providerStatus = hydrated?.providerStatus ?? payload.providerStatus;
  const lastRun = localRun ?? hydrated?.lastRun ?? payload.lastRun;

  const updateActiveFile = useCallback((contents: string | undefined) => {
    if (!activeFile || contents === undefined) return;
    setFiles((previous) =>
      previous.map((file) =>
        file.path === activeFile.path ? { ...file, contents } : file,
      ),
    );
  }, [activeFile]);

  const persistActiveFile = useCallback(async () => {
    if (!threadId || !activeFile || !activeFile.editable) return;
    await writeFile({
      threadId,
      sparkId,
      path: activeFile.path,
      contents: activeFile.contents,
    });
  }, [activeFile, sparkId, threadId, writeFile]);

  const run = useCallback(
    async (kind: "run" | "test") => {
      setLocalError(null);
      setIsRunning(true);
      try {
        await persistActiveFile();
        if (!threadId) {
          throw new Error("Open this thread to run the Code Spark.");
        }
        const result = await runCodeSpark({
          threadId,
          sparkId,
          mode: kind,
          timeoutMs: 15_000,
        });
        setLocalRun({
          kind,
          status: result.status,
          provider: result.provider,
          command: kind === "test" ? payload.testCommand : payload.runCommand,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          reason: result.reason,
          createdAt: Date.now(),
        });
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsRunning(false);
      }
    },
    [
      payload.runCommand,
      payload.testCommand,
      persistActiveFile,
      runCodeSpark,
      sparkId,
      threadId,
    ],
  );

  if (!activeFile) {
    return (
      <div className="code-spark-shell" data-expanded={isExpanded}>
        <div className="code-spark-error" role="alert">
          Code Spark has no files.
        </div>
      </div>
    );
  }

  return (
    <div className="code-spark-shell" data-expanded={isExpanded}>
      <div className="code-spark-toolbar">
        <div className="code-spark-meta">
          <span>{payload.language === "python" ? "Python" : "TypeScript"}</span>
          <span>{provider === "vercel_sandbox" ? "Vercel Sandbox" : provider}</span>
          <span>{providerStatus.replace("_", " ")}</span>
          <span>{statusLabel(lastRun)}</span>
        </div>
        <div className="code-spark-actions">
          <button
            type="button"
            onClick={() => void run("run")}
            disabled={isRunning}
          >
            Run
          </button>
          <button
            type="button"
            onClick={() => void run("test")}
            disabled={isRunning}
          >
            Test
          </button>
          <button type="button" disabled title={payload.lab.reason}>
            Lab
          </button>
        </div>
      </div>

      <div className="code-spark-body">
        <aside className="code-spark-files" aria-label="Code Spark files">
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              className={file.path === activeFile.path ? "active" : ""}
              onClick={() => setActivePath(file.path)}
            >
              <span>{file.path}</span>
              {!file.editable ? <small>read</small> : null}
            </button>
          ))}
        </aside>

        <div className="code-spark-editor">
          {isExpanded ? (
            <Editor
              height="100%"
              language={languageForMonaco(activeFile.language)}
              value={activeFile.contents}
              onChange={updateActiveFile}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                scrollBeyondLastLine: false,
                wordWrap: "on",
                readOnly: !activeFile.editable,
                padding: { top: 12, bottom: 12 },
              }}
            />
          ) : (
            <pre>{activeFile.contents}</pre>
          )}
        </div>

        <section className="code-spark-output" aria-label="Code Spark output">
          <div className="code-spark-output-head">
            <strong>{statusLabel(lastRun)}</strong>
            <span>Visible checks only</span>
          </div>
          <pre>{visibleOutput(lastRun)}</pre>
          {localError ? (
            <div className="code-spark-error" role="alert">
              {localError}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
