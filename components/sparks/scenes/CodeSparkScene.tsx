"use client";

import Editor from "@monaco-editor/react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { api } from "@/convex/_generated/api";
import {
  isLearnerVisibleCodeSparkFile,
  type CodeSparkFile,
  type CodeSparkMode,
  type CodeSparkPayload,
  type CodeSparkProvider,
  type CodeSparkTest,
  type CodeSparkRunSummary,
} from "@/lib/sparks/contracts";

// Only the session query/mutations still need the loose reference cast (their
// generated signatures are untyped here). The run action uses the generated
// typed reference so its result union is sound at the call boundary.
const codeSparksApi = api as unknown as {
  codeSparks: {
    getSessionForSpark: FunctionReference<"query", "public">;
    upsertSessionFromArtifact: FunctionReference<"mutation", "public">;
    writeFile: FunctionReference<"mutation", "public">;
  };
};

/**
 * The public Code Spark run action returns one of two shapes. A Challenge run
 * is intentionally minimal — status, execution-provider provenance, and a
 * learner-facing reason (plus optional cooldown fields). A Workspace run
 * returns the full provider-backed result.
 */
type CodeSparkChallengeActionResult = {
  status: CodeSparkRunSummary["status"];
  provider?: CodeSparkProvider;
  reason: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  timedOut?: boolean;
  code?: "CODE_SPARK_COOLDOWN" | "CODE_SPARK_MONTHLY_LIMIT";
  retryAfterMs?: number;
  cooldownUntil?: number;
};

type CodeSparkWorkspaceActionResult = {
  status: CodeSparkRunSummary["status"];
  provider: CodeSparkProvider;
  stdout: string;
  stderr: string;
  exitCode?: number;
  durationMs: number;
  timedOut?: boolean;
  reason?: string;
  code?: "CODE_SPARK_COOLDOWN" | "CODE_SPARK_MONTHLY_LIMIT";
  retryAfterMs?: number;
  cooldownUntil?: number;
};

type CodeSparkActionResult =
  | CodeSparkChallengeActionResult
  | CodeSparkWorkspaceActionResult;

/**
 * The display run may omit `provider` for a rejected action that never reached
 * a runtime, so we widen `CodeSparkRunSummary` rather than invent one.
 */
type CodeSparkDisplayRun = Omit<CodeSparkRunSummary, "provider"> & {
  provider?: CodeSparkProvider;
};

/**
 * Map a public action result into the display run without inventing fields. A
 * Challenge result carries only learner-safe output plus execution-provider
 * provenance; a Workspace result carries the full provider result.
 */
export function normalizeCodeSparkActionResult(args: {
  kind: "run" | "test";
  command: string;
  createdAt: number;
  result: CodeSparkActionResult;
}): CodeSparkDisplayRun {
  const { kind, command, createdAt, result } = args;
  if ("provider" in result && result.provider !== undefined) {
    return {
      kind,
      status: result.status,
      provider: result.provider,
      command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      reason: result.reason,
      createdAt,
    };
  }
  if (
    args.kind === "run" &&
    (result.stdout !== undefined || result.stderr !== undefined)
  ) {
    return {
      kind,
      status: result.status,
      command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      reason: result.reason,
      createdAt,
    };
  }
  return {
    kind,
    status: result.status,
    reason: result.reason,
    createdAt,
  };
}

/**
 * Reconcile a reactive hydration echo against the local run snapshot. During an
 * active run the local snapshot is authoritative. After completion, a hydrated
 * result is accepted only when its ordering data (`createdAt`) proves it is
 * strictly newer; Challenge hydration can lack `createdAt`, so we never guess.
 */
function reconcileHydratedRun(
  local: CodeSparkDisplayRun | null,
  hydratedRun: CodeSparkDisplayRun | null,
  isRunning: boolean,
  hasLocalRun: boolean,
): CodeSparkDisplayRun | null {
  // Before this mounted instance starts a run, persisted hydration remains the
  // source of truth even when a Challenge projection intentionally omits
  // `createdAt`. The stricter ordering rule begins only after a local run has
  // created state that a lagging reactive echo could overwrite.
  if (!hasLocalRun) return hydratedRun ?? local;
  if (isRunning) return local;
  if (!hydratedRun) return local;
  if (!local) return hydratedRun;
  if (
    typeof hydratedRun.createdAt === "number" &&
    typeof local.createdAt === "number" &&
    hydratedRun.createdAt > local.createdAt
  ) {
    return hydratedRun;
  }
  return local;
}

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

function languageLabel(language: string) {
  if (language === "python") return "Python";
  if (language === "typescript") return "JS / TypeScript";
  if (language === "c") return "C";
  if (language === "rust") return "Rust";
  if (language === "mixed") return "Mixed";
  return language;
}

function isArchivedCodeSparkLanguage(language: string) {
  return language !== "typescript" && language !== "python";
}

function archivedCodeSparkMessage(language: string) {
  return `Archived ${languageLabel(language)} Code Spark — display only. Editing, Run, Test, and saving are disabled because this historical language is no longer executable here.`;
}

function modeHelperText(mode: CodeSparkMode) {
  if (mode === "workspace") {
    return "Run code and inspect the terminal. Use Test when you want check feedback.";
  }
  return "Solve the challenge, then use Test for feedback.";
}

function providerStatusDescription(provider: string, providerStatus: string) {
  if (provider === "local_fake" || providerStatus === "test_only") {
    return "Local test runner: visible checks are deterministic test support, not production sandbox execution.";
  }
  if (provider === "vercel_sandbox" && providerStatus === "configured") {
    return "Provider-backed execution is configured for visible Code Spark checks.";
  }
  return "Runtime provider is unavailable. Try again in a moment, or contact support if it continues.";
}

function statusLabel(run?: CodeSparkDisplayRun | null) {
  if (!run) return "Not run";
  if (run.status === "passed") return "Passed";
  if (run.status === "failed") return "Failed";
  if (run.status === "timed_out") return "Timed out";
  if (run.status === "unavailable") return "Runtime unavailable";
  if (run.status === "running") return "Running";
  return "Queued";
}

function statusTone(run?: CodeSparkDisplayRun | null, isRunning?: boolean) {
  if (isRunning) return "running";
  if (!run) return "idle";
  if (run.status === "passed") return "passed";
  if (run.status === "failed") return "failed";
  if (run.status === "timed_out") return "failed";
  if (run.status === "unavailable") return "unavailable";
  if (run.status === "running") return "running";
  return "idle";
}

/**
 * Failure kinds we can honestly tell apart from the data this component already
 * has. A cooldown is the backend's structured run-limit result (an `unavailable`
 * status whose reason names the run limit); a bare `unavailable` is a provider
 * outage; `failed`/`timed_out` are the learner's own code. Distinguishing them
 * lets the alert copy be actionable instead of a single "it broke" message.
 */
type CodeSparkFailureKind =
  | "cooldown"
  | "budget"
  | "provider"
  | "timeout"
  | "code";

const MONTHLY_LIMIT_HINT_PATTERN = /monthly run limit|billing period/i;
const COOLDOWN_HINT_PATTERN =
  /run limit|cooling down|too many|try again in a few/i;
const TIMEOUT_HINT_PATTERN = /timed?\s*out|took too long|deadline exceeded/i;
const CODE_FAILURE_HINT_PATTERN =
  /syntaxerror|referenceerror|typeerror|assertionerror|traceback|compile error|compilation failed/i;

function runFailureKind(
  run?: CodeSparkDisplayRun | null,
): CodeSparkFailureKind | null {
  if (!run) return null;
  if (run.status === "timed_out") return "timeout";
  if (run.status === "failed") return "code";
  if (run.status === "unavailable") {
    const signal = `${run.reason ?? ""} ${run.stderr ?? ""}`;
    if (MONTHLY_LIMIT_HINT_PATTERN.test(signal)) return "budget";
    return COOLDOWN_HINT_PATTERN.test(signal) ? "cooldown" : "provider";
  }
  return null;
}

/**
 * Learner-facing status word. Cooldown gets its own calm label so it doesn't
 * read like the runtime crashed — it's an expected, self-clearing state.
 */
function runStatusLabel(run?: CodeSparkDisplayRun | null) {
  if (runFailureKind(run) === "budget") return "Monthly limit reached";
  if (runFailureKind(run) === "cooldown") return "Run limit reached";
  return statusLabel(run);
}

function failureAlertText(
  kind: CodeSparkFailureKind,
  isChallenge: boolean,
): string {
  switch (kind) {
    case "budget":
      return "Monthly run limit reached — your edits are saved. Try again next billing period or change plans.";
    case "cooldown":
      return "Run limit reached — wait a few seconds, then run again. Your edits are saved.";
    case "provider":
      return "The code runner is unavailable right now. Your saved edits are safe — try again shortly.";
    case "timeout":
      return "The run took too long and was stopped. Simplify slow logic, then run again.";
    case "code":
      return isChallenge
        ? "Not passing yet — review the output below and adjust your code."
        : "The run failed — read the output below to see what went wrong.";
  }
}

function checkResultLabel(status: CodeSparkRunSummary["status"]) {
  if (status === "passed") return "Passed";
  if (status === "failed") return "Failed";
  if (status === "timed_out") return "Timed out";
  if (status === "unavailable") return "Couldn't run";
  return "Ran";
}

function checkResultTone(status: CodeSparkRunSummary["status"]) {
  if (status === "passed") return "passed";
  if (status === "failed" || status === "timed_out") return "failed";
  if (status === "unavailable") return "unavailable";
  return "idle";
}

function caughtFailureKind(value: string): CodeSparkFailureKind {
  if (MONTHLY_LIMIT_HINT_PATTERN.test(value)) return "budget";
  if (COOLDOWN_HINT_PATTERN.test(value)) return "cooldown";
  if (TIMEOUT_HINT_PATTERN.test(value)) return "timeout";
  if (CODE_FAILURE_HINT_PATTERN.test(value)) return "code";
  return "provider";
}

function failureStatusLabel(kind: CodeSparkFailureKind) {
  if (kind === "budget") return "Monthly limit reached";
  if (kind === "cooldown") return "Run limit reached";
  if (kind === "provider") return "Runtime unavailable";
  if (kind === "timeout") return "Timed out";
  return "Failed";
}

function failureStatusTone(kind: CodeSparkFailureKind) {
  return kind === "code" || kind === "timeout" ? "failed" : "unavailable";
}

const CHECK_DETAILS_HIDDEN = "[check details hidden]";
const INTERNAL_DETAILS_HIDDEN = "[internal details hidden]";
const CHECK_COMMAND_PATTERN =
  /\b(?:bunx?|node|npx|python3?|tsx)(?:\.exe)?\s+(?:[^\n\r]*?)(?:tests?|test)[\\/][^\s'"`<>)]*\.check\.[A-Za-z0-9]+(?:[^\n\r]*)?/gi;
const CHECK_PATH_PATTERN =
  /(?:(?:file:\/\/\/?)?[A-Za-z]:)?[^\s'"`<>)]*(?:tests?|test)[\\/][^\s'"`<>)]*\.check\.[A-Za-z0-9]+(?::\d+(?::\d+)?)?/gi;
const CONVEX_ERROR_ENVELOPE_PATTERN =
  /\[CONVEX[^\]]*\](?:\s*\[Request ID:[^\]]*\])?\s*(?:Server Error\s*)?(?:Uncaught Error:\s*)?/gi;
const INTERNAL_SOURCE_PATH_PATTERN =
  /(?:\.\.[\\/])?(?:convex|node_modules)[\\/][A-Za-z0-9_.\\/-]+\.[A-Za-z0-9]+(?::\d+(?::\d+)?)?/gi;
const INTERNAL_ABSOLUTE_PATH_PATTERN =
  /(?:file:\/\/)?\/(?:app|root|opt|srv|workspace|vercel(?:\/sandbox)?|sandbox|tmp|private|var\/(?:folders|tmp)|Users|home|test)(?:\/[^\s'"`<>)]*)?/gi;
const WINDOWS_ABSOLUTE_PATH_PATTERN =
  /(?:file:\/\/\/?)?[A-Za-z]:[\\/]+[^\s'"`<>)]*/g;

function sanitizeChallengeOutputText(value: string) {
  return value
    .replace(CONVEX_ERROR_ENVELOPE_PATTERN, "")
    .replace(CHECK_COMMAND_PATTERN, CHECK_DETAILS_HIDDEN)
    .replace(CHECK_PATH_PATTERN, CHECK_DETAILS_HIDDEN)
    .replace(INTERNAL_SOURCE_PATH_PATTERN, INTERNAL_DETAILS_HIDDEN)
    .replace(INTERNAL_ABSOLUTE_PATH_PATTERN, INTERNAL_DETAILS_HIDDEN)
    .replace(WINDOWS_ABSOLUTE_PATH_PATTERN, INTERNAL_DETAILS_HIDDEN);
}

function caughtFailure(
  error: unknown,
  mode: CodeSparkMode,
): { kind: CodeSparkFailureKind; message: string; detail: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const kind = caughtFailureKind(raw);
  const detail = mode === "challenge" ? sanitizeChallengeOutputText(raw) : raw;
  const guidance = failureAlertText(kind, mode === "challenge");
  return {
    kind,
    detail: detail.trim(),
    message: detail.trim() ? `${guidance}\n${detail.trim()}` : guidance,
  };
}

function runStatusForFailure(
  kind: CodeSparkFailureKind,
): CodeSparkRunSummary["status"] {
  if (kind === "timeout") return "timed_out";
  if (kind === "code") return "failed";
  return "unavailable";
}

function outputTextForMode(mode: CodeSparkMode, value: string) {
  return mode === "challenge" ? sanitizeChallengeOutputText(value) : value;
}

/**
 * Build the visible run output. In challenge mode the raw command line is
 * withheld (it can leak the hidden test implementation path); stdout/stderr
 * and reason stay useful, but raw check commands and check file paths are
 * replaced before display. In workspace mode the raw details are inspectable.
 */
function visibleOutput(mode: CodeSparkMode, run?: CodeSparkDisplayRun | null) {
  if (!run) return "Run the spark to see output here.";
  const header =
    mode === "workspace"
      ? `$ ${run.command ?? "command"}`
      : run.kind === "test"
        ? "Ran visible checks"
        : "Ran the spark";
  const lines = [
    header,
    run.stdout ? `stdout\n${outputTextForMode(mode, run.stdout)}` : "",
    run.stderr ? `stderr\n${outputTextForMode(mode, run.stderr)}` : "",
    typeof run.exitCode === "number" ? `exit ${run.exitCode}` : "",
    run.reason ? `reason ${outputTextForMode(mode, run.reason)}` : "",
  ].filter(Boolean);
  return lines.join("\n\n");
}

function mergeFilesPreservingDirty(
  currentFiles: CodeSparkFile[],
  incomingFiles: CodeSparkFile[],
  dirtyPaths: Set<string>,
) {
  if (dirtyPaths.size === 0) {
    return incomingFiles;
  }

  const currentByPath = new Map(
    currentFiles.map((file) => [file.path, file] as const),
  );
  return incomingFiles.map((incomingFile) => {
    const currentFile = currentByPath.get(incomingFile.path);
    if (!currentFile || !dirtyPaths.has(incomingFile.path)) {
      return incomingFile;
    }
    return {
      ...incomingFile,
      contents: currentFile.contents,
    };
  });
}

type CodeSparkDraftSnapshot = {
  files: CodeSparkFile[];
  activePath: string;
  dirtyPaths: Set<string>;
  fileRevisions: Map<string, number>;
};

type CodeSparkDraftEntry = CodeSparkDraftSnapshot & {
  touchedAt: number;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

const CODE_SPARK_DRAFT_LIMIT = 24;
const CODE_SPARK_DRAFT_RETENTION_MS = 5 * 60 * 1_000;
const codeSparkDraftBuffers = new Map<string, CodeSparkDraftEntry>();
const codeSparkDraftOwners = new Map<string, number>();

function cloneDraftSnapshot(
  snapshot: CodeSparkDraftSnapshot,
): CodeSparkDraftSnapshot {
  return {
    files: snapshot.files.map((file) => ({ ...file })),
    activePath: snapshot.activePath,
    dirtyPaths: new Set(snapshot.dirtyPaths),
    fileRevisions: new Map(snapshot.fileRevisions),
  };
}

function pruneCodeSparkDraftBuffers() {
  if (codeSparkDraftBuffers.size <= CODE_SPARK_DRAFT_LIMIT) return;
  const inactiveEntries = [...codeSparkDraftBuffers.entries()]
    .filter(([key]) => (codeSparkDraftOwners.get(key) ?? 0) === 0)
    .sort(([, left], [, right]) => left.touchedAt - right.touchedAt);

  for (const [key, entry] of inactiveEntries) {
    if (codeSparkDraftBuffers.size <= CODE_SPARK_DRAFT_LIMIT) break;
    if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
    codeSparkDraftBuffers.delete(key);
  }
}

function readCodeSparkDraftBuffer(key: string): CodeSparkDraftSnapshot | null {
  const entry = codeSparkDraftBuffers.get(key);
  if (!entry) return null;
  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = undefined;
  }
  entry.touchedAt = Date.now();
  return cloneDraftSnapshot(entry);
}

function writeCodeSparkDraftBuffer(
  key: string,
  snapshot: CodeSparkDraftSnapshot,
) {
  const current = codeSparkDraftBuffers.get(key);
  if (!current && snapshot.dirtyPaths.size === 0) return;
  if (current?.cleanupTimer) clearTimeout(current.cleanupTimer);
  codeSparkDraftBuffers.set(key, {
    ...cloneDraftSnapshot(snapshot),
    touchedAt: Date.now(),
  });
  pruneCodeSparkDraftBuffers();
}

function retainCodeSparkDraftBuffer(key: string) {
  codeSparkDraftOwners.set(key, (codeSparkDraftOwners.get(key) ?? 0) + 1);
  const entry = codeSparkDraftBuffers.get(key);
  if (entry?.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = undefined;
  }
}

function releaseCodeSparkDraftBuffer(key: string) {
  const nextOwners = Math.max(0, (codeSparkDraftOwners.get(key) ?? 1) - 1);
  if (nextOwners > 0) {
    codeSparkDraftOwners.set(key, nextOwners);
    return;
  }
  codeSparkDraftOwners.delete(key);
  const entry = codeSparkDraftBuffers.get(key);
  if (!entry) return;
  entry.cleanupTimer = setTimeout(() => {
    if ((codeSparkDraftOwners.get(key) ?? 0) > 0) return;
    if (codeSparkDraftBuffers.get(key) === entry) {
      codeSparkDraftBuffers.delete(key);
    }
  }, CODE_SPARK_DRAFT_RETENTION_MS);
  pruneCodeSparkDraftBuffers();
}

export function __resetCodeSparkDraftBuffersForTests() {
  for (const entry of codeSparkDraftBuffers.values()) {
    if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
  }
  codeSparkDraftBuffers.clear();
  codeSparkDraftOwners.clear();
  resetCodeSparkRunStatesForTests();
}

type CodeSparkSavedFileRevision = {
  path: string;
  revision: number;
};

type CodeSparkSharedRunState = {
  isRunning: boolean;
  runPhase: "saving" | "executing" | null;
  runningCheckId: string | null;
  checkResults: Record<string, CodeSparkRunSummary["status"]>;
  localRun: CodeSparkDisplayRun | null;
  terminalRun: CodeSparkDisplayRun | null;
  terminalStale: boolean;
  testRun: CodeSparkDisplayRun | null;
  testStale: boolean;
  executionProvider: CodeSparkProvider | null;
  executionKind: "run" | "test" | null;
  localError: string | null;
  localFailureKind: CodeSparkFailureKind | null;
  hasLocalRun: boolean;
  savedFilesVersion: number;
  savedFileRevisions: CodeSparkSavedFileRevision[];
};

type CodeSparkRunEntry = {
  state: CodeSparkSharedRunState;
  listeners: Set<() => void>;
  touchedAt: number;
  pending?: Promise<void>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

const CODE_SPARK_RUN_LIMIT = 24;
const CODE_SPARK_RUN_RETENTION_MS = 5 * 60 * 1_000;
const codeSparkRunStates = new Map<string, CodeSparkRunEntry>();

function createCodeSparkRunState(
  initialRun: CodeSparkDisplayRun | null,
): CodeSparkSharedRunState {
  return {
    isRunning: false,
    runPhase: null,
    runningCheckId: null,
    checkResults: {},
    localRun: initialRun,
    terminalRun: initialRun?.kind === "run" ? initialRun : null,
    terminalStale: false,
    testRun: initialRun?.kind === "test" ? initialRun : null,
    testStale: false,
    executionProvider: null,
    executionKind: null,
    localError: null,
    localFailureKind: null,
    hasLocalRun: false,
    savedFilesVersion: 0,
    savedFileRevisions: [],
  };
}

function getCodeSparkRunEntry(
  key: string,
  initialRun: CodeSparkDisplayRun | null,
) {
  let entry = codeSparkRunStates.get(key);
  if (!entry) {
    entry = {
      state: createCodeSparkRunState(initialRun),
      listeners: new Set(),
      touchedAt: Date.now(),
    };
    codeSparkRunStates.set(key, entry);
    pruneCodeSparkRunStates();
  }
  entry.touchedAt = Date.now();
  return entry;
}

function scheduleCodeSparkRunCleanup(key: string, entry: CodeSparkRunEntry) {
  if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
  entry.cleanupTimer = setTimeout(() => {
    if (entry.listeners.size > 0) return;
    if (entry.pending || entry.state.isRunning) {
      scheduleCodeSparkRunCleanup(key, entry);
      return;
    }
    if (codeSparkRunStates.get(key) === entry) {
      codeSparkRunStates.delete(key);
    }
  }, CODE_SPARK_RUN_RETENTION_MS);
}

function pruneCodeSparkRunStates() {
  if (codeSparkRunStates.size <= CODE_SPARK_RUN_LIMIT) return;
  const inactiveEntries = [...codeSparkRunStates.entries()]
    .filter(
      ([, entry]) =>
        entry.listeners.size === 0 && !entry.pending && !entry.state.isRunning,
    )
    .sort(([, left], [, right]) => left.touchedAt - right.touchedAt);

  for (const [key, entry] of inactiveEntries) {
    if (codeSparkRunStates.size <= CODE_SPARK_RUN_LIMIT) break;
    if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
    codeSparkRunStates.delete(key);
  }
}

function subscribeCodeSparkRunState(
  key: string,
  initialRun: CodeSparkDisplayRun | null,
  listener: () => void,
) {
  const entry = getCodeSparkRunEntry(key, initialRun);
  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer);
    entry.cleanupTimer = undefined;
  }
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    entry.touchedAt = Date.now();
    if (entry.listeners.size === 0) {
      scheduleCodeSparkRunCleanup(key, entry);
    }
    pruneCodeSparkRunStates();
  };
}

function updateCodeSparkRunState(
  key: string,
  initialRun: CodeSparkDisplayRun | null,
  update: (previous: CodeSparkSharedRunState) => CodeSparkSharedRunState,
) {
  const entry = getCodeSparkRunEntry(key, initialRun);
  const next = update(entry.state);
  if (next === entry.state) return;
  entry.state = next;
  entry.touchedAt = Date.now();
  for (const listener of entry.listeners) listener();
}

function beginCodeSparkRun(
  key: string,
  initialRun: CodeSparkDisplayRun | null,
  state: CodeSparkSharedRunState,
) {
  const entry = getCodeSparkRunEntry(key, initialRun);
  if (entry.pending || entry.state.isRunning) return false;
  entry.state = state;
  entry.touchedAt = Date.now();
  for (const listener of entry.listeners) listener();
  return true;
}

function attachCodeSparkRunPromise(
  key: string,
  initialRun: CodeSparkDisplayRun | null,
  pending: Promise<void>,
) {
  const entry = getCodeSparkRunEntry(key, initialRun);
  entry.pending = pending;
  const release = () => {
    if (entry.pending === pending) entry.pending = undefined;
    entry.touchedAt = Date.now();
    if (entry.listeners.size === 0) {
      scheduleCodeSparkRunCleanup(key, entry);
    }
    pruneCodeSparkRunStates();
  };
  void pending.then(release, release);
}

function resetCodeSparkRunStatesForTests() {
  for (const entry of codeSparkRunStates.values()) {
    if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
  }
  codeSparkRunStates.clear();
}

function commandForRun(
  payload: CodeSparkPayload,
  kind: "run" | "test",
  check?: CodeSparkTest,
  hydratedCommands?: { runCommand?: string; testCommand?: string } | null,
) {
  if (check) return check.command;
  const hydratedCommand =
    kind === "test"
      ? hydratedCommands?.testCommand
      : hydratedCommands?.runCommand;
  if (hydratedCommand) return hydratedCommand;
  return kind === "test" ? payload.testCommand : payload.runCommand;
}

/* ── Shared building blocks (used by both inline and expanded layouts) ── */

type RunControlsProps = {
  onRun: () => void;
  onTest: () => void;
  disabled: boolean;
  describedById: string;
  disabledReason?: string;
  runLabel: string;
  testLabel: string;
};

function RunControls({
  onRun,
  onTest,
  disabled,
  describedById,
  disabledReason,
  runLabel,
  testLabel,
}: RunControlsProps) {
  return (
    <div className="code-spark-actions">
      <button
        type="button"
        className="code-spark-btn code-spark-btn-primary"
        onClick={onRun}
        disabled={disabled}
        aria-disabled={disabled}
        aria-describedby={describedById}
        title={disabledReason}
      >
        {runLabel}
      </button>
      <button
        type="button"
        className="code-spark-btn"
        onClick={onTest}
        disabled={disabled}
        aria-disabled={disabled}
        aria-describedby={describedById}
        title={disabledReason}
      >
        {testLabel}
      </button>
    </div>
  );
}

type FileTabsProps = {
  files: CodeSparkFile[];
  activePath: string;
  dirtyPaths: Set<string>;
  onSelect: (path: string) => void;
};

function FileTabs({ files, activePath, dirtyPaths, onSelect }: FileTabsProps) {
  // With a single file the editor head already names it — a tab strip would
  // just duplicate that, so keep the compact layout uncluttered.
  if (files.length <= 1) {
    return null;
  }
  return (
    <div className="code-spark-filetabs" aria-label="Files">
      {files.map((file) => {
        const isActive = file.path === activePath;
        return (
          <button
            key={file.path}
            type="button"
            className={`code-spark-filetab${isActive ? " active" : ""}`}
            onClick={() => onSelect(file.path)}
            aria-pressed={isActive}
          >
            <span className="code-spark-filetab-name">{file.path}</span>
            {dirtyPaths.has(file.path) ? (
              <small className="code-spark-file-state" data-state="edited">
                edited
              </small>
            ) : null}
            {!file.editable ? (
              <small className="code-spark-file-state" data-state="read">
                read
              </small>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

type ChecksPanelProps = {
  isChallenge: boolean;
  checks: CodeSparkTest[];
  visibleCheckLabel: string;
  onRunCheck: (checkId: string) => void;
  disabled: boolean;
  describedById: string;
  disabledReason?: string;
  results: Record<string, CodeSparkRunSummary["status"]>;
  runningCheckId: string | null;
  showIndividualActions?: boolean;
};

function ChecksPanel({
  isChallenge,
  checks,
  visibleCheckLabel,
  onRunCheck,
  disabled,
  describedById,
  disabledReason,
  results,
  runningCheckId,
  showIndividualActions = true,
}: ChecksPanelProps) {
  return (
    <div className="code-spark-checks" aria-label="Visible Code Spark checks">
      <div className="code-spark-checks-head">
        <p className="code-spark-section-label">
          {isChallenge ? "Success criteria" : "Visible checks"}
        </p>
        <span className="code-spark-check-count">{visibleCheckLabel}</span>
      </div>
      {checks.length > 0 ? (
        <ul>
          {checks.map((check) => {
            const result = results[check.id];
            const isCheckRunning = runningCheckId === check.id;
            return (
              <li key={check.id}>
                <div className="code-spark-check-text">
                  <strong>{check.label}</strong>
                  {isChallenge ? null : <code>{check.command}</code>}
                  {isCheckRunning ? (
                    <span
                      className="code-spark-check-result"
                      data-tone="running"
                      role="status"
                      aria-label={`${check.label}: checking`}
                    >
                      <span
                        className="code-spark-status-dot"
                        aria-hidden="true"
                      />
                      Checking…
                    </span>
                  ) : result ? (
                    <span
                      className="code-spark-check-result"
                      data-tone={checkResultTone(result)}
                      role="status"
                      aria-label={`${check.label}: ${checkResultLabel(result)}`}
                    >
                      <span
                        className="code-spark-status-dot"
                        aria-hidden="true"
                      />
                      {checkResultLabel(result)}
                    </span>
                  ) : null}
                </div>
                {showIndividualActions ? (
                  <button
                    type="button"
                    className="code-spark-btn code-spark-btn-check"
                    onClick={() => onRunCheck(check.id)}
                    disabled={disabled}
                    aria-disabled={disabled}
                    aria-describedby={describedById}
                    title={disabledReason}
                    aria-label={`Run ${check.label}`}
                  >
                    Run check
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="code-spark-empty-checks">
          {isChallenge
            ? "No public success criteria were provided for this challenge."
            : "No visible checks were provided for this Spark."}
        </p>
      )}
    </div>
  );
}

type TerminalPanelProps = {
  mode: CodeSparkMode;
  run: CodeSparkDisplayRun | null;
  isStale: boolean;
  isRunning: boolean;
  statusId: string;
};

function terminalOutput(mode: CodeSparkMode, run: CodeSparkDisplayRun | null) {
  if (!run || run.status === "running") return "Run your code to see output.";
  const lines = [
    mode === "workspace" && run.command ? `$ ${run.command}` : "",
    run.stdout ?? "",
    run.stderr ?? "",
    typeof run.exitCode === "number" ? `Process exited ${run.exitCode}` : "",
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : (run.reason ?? "Run finished.");
}

function TerminalPanel({
  mode,
  run,
  isStale,
  isRunning,
  statusId,
}: TerminalPanelProps) {
  const runStatus = isRunning
    ? "Running"
    : isStale
      ? "Changes not run"
      : runStatusLabel(run);
  const tone = isStale && !isRunning ? "idle" : statusTone(run, isRunning);
  const output =
    isStale && !isRunning
      ? "Run the current code to refresh terminal output."
      : terminalOutput(mode, run);
  return (
    <section
      className="code-spark-terminal"
      data-tone={tone}
      aria-label="Terminal"
      id={statusId}
    >
      <div className="code-spark-terminal-head">
        <span className="code-spark-terminal-label">Terminal</span>
        <span
          className="code-spark-terminal-status"
        >
          <span className="code-spark-status-dot" aria-hidden="true" />
          {runStatus}
        </span>
      </div>
      <pre>{output}</pre>
    </section>
  );
}

type TestResultsPanelProps = ChecksPanelProps & {
  run: CodeSparkDisplayRun | null;
  hasUnsavedEdits: boolean;
  isRunning: boolean;
};

function TestResultsPanel({
  run,
  hasUnsavedEdits,
  isRunning,
  ...checksProps
}: TestResultsPanelProps) {
  const visibleRun = hasUnsavedEdits ? null : run;
  const status = hasUnsavedEdits
    ? "Changes not tested"
    : isRunning
      ? "Testing"
      : visibleRun
        ? runStatusLabel(visibleRun)
        : "Not tested yet";
  const tone = hasUnsavedEdits ? "idle" : statusTone(visibleRun, isRunning);

  return (
    <section
      className="code-spark-test-results"
      data-tone={tone}
      aria-label="Test results"
    >
      <div className="code-spark-test-results-head">
        <span className="code-spark-test-results-label">Test results</span>
        <span className="code-spark-test-results-status">
          <span className="code-spark-status-dot" aria-hidden="true" />
          {status}
        </span>
      </div>
      <ChecksPanel
        {...checksProps}
        showIndividualActions={checksProps.checks.length > 1}
      />
      {visibleRun?.reason ? (
        <p className="code-spark-test-summary">{visibleRun.reason}</p>
      ) : null}
    </section>
  );
}

type RunAlertProps = {
  failureKind: CodeSparkFailureKind | null;
  isChallenge: boolean;
};

/**
 * Actionable failure banner. Uses `role="alert"` (assertive) rather than the
 * polite run-status region so a learner who just clicked Run is told what to do
 * next — distinct copy per failure kind, never color alone.
 */
function RunAlert({ failureKind, isChallenge }: RunAlertProps) {
  if (!failureKind) return null;
  return (
    <div className="code-spark-run-alert" role="alert" data-kind={failureKind}>
      <span className="code-spark-status-dot" aria-hidden="true" />
      <span>{failureAlertText(failureKind, isChallenge)}</span>
    </div>
  );
}

function CodeSparkSceneInstance({
  payload,
  title,
  threadId,
  sparkId,
  isExpanded,
}: CodeSparkSceneProps) {
  const draftKey = `${threadId ?? "detached"}::${sparkId}`;
  const isDisplayOnly = isArchivedCodeSparkLanguage(payload.language);
  const initialRunRef = useRef<CodeSparkDisplayRun | null>(
    payload.lastRun ?? null,
  );
  const subscribeToRunState = useCallback(
    (listener: () => void) =>
      subscribeCodeSparkRunState(draftKey, initialRunRef.current, listener),
    [draftKey],
  );
  const getRunStateSnapshot = useCallback(
    () => getCodeSparkRunEntry(draftKey, initialRunRef.current).state,
    [draftKey],
  );
  const sharedRun = useSyncExternalStore(
    subscribeToRunState,
    getRunStateSnapshot,
    getRunStateSnapshot,
  );
  const [initialDraft] = useState(() =>
    isDisplayOnly ? null : readCodeSparkDraftBuffer(draftKey),
  );
  const [files, setFiles] = useState<CodeSparkFile[]>(
    () => initialDraft?.files ?? payload.files,
  );
  const [activePath, setActivePath] = useState(
    () => initialDraft?.activePath ?? payload.activePath,
  );
  const {
    isRunning,
    runPhase,
    runningCheckId,
    checkResults,
    localRun,
    terminalRun,
    terminalStale,
    testRun,
    testStale,
    executionProvider,
    executionKind,
    localError,
    localFailureKind,
  } = sharedRun;
  const dirtyPathsRef = useRef<Set<string>>(
    new Set(initialDraft?.dirtyPaths ?? []),
  );
  // Per-path edit revision. Bumped on every keystroke so an in-flight save can
  // tell whether a newer edit superseded the exact contents it wrote.
  const fileRevisionsRef = useRef<Map<string, number>>(
    new Map(initialDraft?.fileRevisions ?? []),
  );
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(
    () => new Set(initialDraft?.dirtyPaths ?? []),
  );
  const inlineFeedbackRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrolledRunRef = useRef<string | null>(null);

  const hydrateArgs = threadId ? { threadId, sparkId } : "skip";
  const hydrated = useQuery(
    codeSparksApi.codeSparks.getSessionForSpark,
    hydrateArgs,
  );
  const upsertSession = useMutation(
    codeSparksApi.codeSparks.upsertSessionFromArtifact,
  );
  const writeFile = useMutation(codeSparksApi.codeSparks.writeFile);
  const runCodeSpark = useAction(api.codeSparkActions.run);

  useEffect(() => {
    retainCodeSparkDraftBuffer(draftKey);
    return () => releaseCodeSparkDraftBuffer(draftKey);
  }, [draftKey]);

  useEffect(() => {
    writeCodeSparkDraftBuffer(draftKey, {
      files,
      activePath,
      dirtyPaths,
      fileRevisions: fileRevisionsRef.current,
    });
  }, [activePath, dirtyPaths, draftKey, files]);

  useEffect(() => {
    const dirty = dirtyPathsRef.current;
    setFiles((previous) =>
      mergeFilesPreservingDirty(previous, payload.files, dirty),
    );
    if (dirty.size === 0) {
      setActivePath(payload.activePath);
    }
  }, [payload.files, payload.activePath]);

  useEffect(() => {
    if (!threadId || isDisplayOnly) return;
    const publicFiles =
      payload.mode === "challenge"
        ? payload.files.filter(isLearnerVisibleCodeSparkFile)
        : payload.files;
    const publicTests = payload.tests.filter((test) => !test.hidden);
    const publicActivePath = publicFiles.some(
      (file) => file.path === payload.activePath,
    )
      ? payload.activePath
      : (publicFiles[0]?.path ?? payload.activePath);
    let active = true;
    void upsertSession({
      threadId,
      sparkId,
      title,
      mode: payload.mode,
      language: payload.language,
      provider: payload.provider,
      providerStatus: payload.providerStatus,
      activePath: publicActivePath,
      files: publicFiles,
      tests: publicTests,
      runCommand: payload.runCommand,
      testCommand: payload.testCommand,
    }).catch((error) => {
      if (!active) return;
      const failure = caughtFailure(error, payload.mode);
      updateCodeSparkRunState(draftKey, initialRunRef.current, (previous) => ({
        ...previous,
        localFailureKind: failure.kind,
        localError: failure.message,
      }));
    });
    return () => {
      active = false;
    };
  }, [
    draftKey,
    isDisplayOnly,
    threadId,
    sparkId,
    title,
    payload,
    upsertSession,
  ]);

  useEffect(() => {
    if (!hydrated) return;
    const dirty = dirtyPathsRef.current;
    setFiles((previous) =>
      mergeFilesPreservingDirty(previous, hydrated.files, dirty),
    );
    if (dirty.size === 0) {
      setActivePath(hydrated.activePath);
    }
    // A reactive echo must not clobber the local `running` snapshot or a just-
    // completed local result that the server has not yet superseded.
    const hydratedRun = (hydrated.lastRun ?? null) as CodeSparkDisplayRun | null;
    updateCodeSparkRunState(draftKey, initialRunRef.current, (previous) => ({
      ...previous,
      localRun: reconcileHydratedRun(
        previous.localRun,
        hydratedRun,
        previous.isRunning,
        previous.hasLocalRun,
      ),
      executionProvider:
        !previous.hasLocalRun && hydratedRun?.provider
          ? hydratedRun.provider
          : previous.executionProvider,
      executionKind:
        !previous.hasLocalRun &&
        hydratedRun?.provider &&
        (hydratedRun.kind === "run" || hydratedRun.kind === "test")
          ? hydratedRun.kind
          : previous.executionKind,
    }));
  }, [draftKey, hydrated]);

  const updateDirtyPaths = useCallback(
    (update: (previous: Set<string>) => Set<string>) => {
      setDirtyPaths((previous) => {
        const next = update(previous);
        dirtyPathsRef.current = next;
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (sharedRun.savedFilesVersion === 0) return;
    updateDirtyPaths((previous) => {
      const next = new Set(previous);
      for (const saved of sharedRun.savedFileRevisions) {
        if (
          (fileRevisionsRef.current.get(saved.path) ?? 0) === saved.revision
        ) {
          next.delete(saved.path);
        }
      }
      return next;
    });
  }, [
    sharedRun.savedFileRevisions,
    sharedRun.savedFilesVersion,
    updateDirtyPaths,
  ]);

  const mode = payload.mode;
  const isChallenge = mode === "challenge";

  /**
   * Learner-facing files. Challenge mode uses the same centralized policy as
   * the public artifact projection, including role, editability, canonical
   * private paths, traversal, case, and backslash handling. Archived languages
   * retain the visible file contents but force every file to read-only.
   */
  const visibleFiles = useMemo<CodeSparkFile[]>(() => {
    const learnerFiles = isChallenge
      ? files.filter(isLearnerVisibleCodeSparkFile)
      : files;
    if (!isDisplayOnly) return learnerFiles;
    return learnerFiles.map((file) =>
      file.editable ? { ...file, editable: false } : file,
    );
  }, [files, isChallenge, isDisplayOnly]);

  const activeFile = useMemo(() => {
    return (
      visibleFiles.find((file) => file.path === activePath) ??
      visibleFiles.find((file) => file.editable) ??
      visibleFiles[0]
    );
  }, [activePath, visibleFiles]);

  const provider = hydrated?.provider ?? payload.provider;
  const providerStatus = hydrated?.providerStatus ?? payload.providerStatus;
  const lastRun = localRun ?? hydrated?.lastRun ?? payload.lastRun;
  const displayedTerminalRun = terminalStale
    ? null
    : (terminalRun ?? (lastRun?.kind === "run" ? lastRun : null));
  const displayedTestRun = testStale
    ? null
    : (testRun ?? (lastRun?.kind === "test" ? lastRun : null));
  const visibleChecks = useMemo<CodeSparkTest[]>(() => {
    const sourceChecks: CodeSparkTest[] = hydrated
      ? ((hydrated.tests ?? []) as CodeSparkTest[])
      : payload.tests;
    return sourceChecks.filter((test: CodeSparkTest) => !test.hidden);
  }, [hydrated, payload.tests]);
  const canRunSession = Boolean(threadId && hydrated);
  const visibleCheckLabel = `${visibleChecks.length} visible ${
    visibleChecks.length === 1 ? "check" : "checks"
  }`;
  const sparkDomId = sparkId.replace(/[^A-Za-z0-9_-]/g, "-");
  const controlStatusId = `code-spark-control-status-${sparkDomId}`;
  const runStatusRegionId = `code-spark-run-status-${sparkDomId}`;
  const controlsDisabled = isDisplayOnly || isRunning || !canRunSession;
  const hasUnsavedEdits = dirtyPaths.size > 0;
  const archiveMessage = archivedCodeSparkMessage(payload.language);
  const runStatus = isDisplayOnly
    ? "Archived"
    : isRunning
      ? "Running"
      : localFailureKind
        ? failureStatusLabel(localFailureKind)
        : runStatusLabel(lastRun);
  const tone = isDisplayOnly
    ? "idle"
    : isRunning
      ? "running"
      : localFailureKind
        ? failureStatusTone(localFailureKind)
        : statusTone(lastRun, false);
  const failureKind =
    isDisplayOnly || isRunning || localError ? null : runFailureKind(lastRun);
  const latestActionOutput = isDisplayOnly
    ? "Historical source is available for inspection. This archived language cannot be edited, saved, or executed."
    : visibleOutput(mode, lastRun);
  const modeNote = isDisplayOnly ? archiveMessage : modeHelperText(mode);
  const providerNote = isDisplayOnly
    ? "This historical session is preserved for inspection only. Its archived state is unrelated to provider availability."
    : providerStatusDescription(provider, providerStatus);
  const controlStatusText = isDisplayOnly
    ? "Controls are disabled for this archived session."
    : !threadId
      ? "Open this thread to run this Code Spark."
      : !hydrated
        ? "Studi is preparing this Code Spark workspace. Run and check controls will unlock in a moment."
        : runPhase === "saving"
          ? "Saving your changes before this run…"
          : isRunning
            ? "Running Code Spark checks. Output will update when the run finishes."
            : hasUnsavedEdits
              ? "You have unsaved edits. Studi saves them automatically before running."
              : "Ready";
  const disabledReason = isDisplayOnly
    ? archiveMessage
    : !threadId
      ? "Open this thread to run this Code Spark."
      : !hydrated
        ? "Controls unlock once Studi finishes preparing this Code Spark workspace."
        : undefined;

  useEffect(() => {
    if (
      isExpanded ||
      isRunning ||
      !localRun ||
      localRun.status === "running"
    ) {
      return;
    }
    const runKey = `${localRun.kind}:${localRun.status}:${localRun.createdAt}`;
    if (lastAutoScrolledRunRef.current === runKey) return;
    lastAutoScrolledRunRef.current = runKey;
    const selector =
      localRun.kind === "run"
        ? ".code-spark-terminal"
        : ".code-spark-test-results";
    inlineFeedbackRef.current
      ?.querySelector<HTMLElement>(selector)
      ?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
      });
  }, [isExpanded, isRunning, localRun]);

  const updateActiveFile = useCallback(
    (contents: string | undefined) => {
      if (
        isDisplayOnly ||
        isRunning ||
        !activeFile ||
        !activeFile.editable ||
        contents === undefined
      ) {
        return;
      }
      setFiles((previous) =>
        previous.map((file) =>
          file.path === activeFile.path ? { ...file, contents } : file,
        ),
      );
      // Bump the path's revision so a save already in flight can detect that this
      // newer edit superseded the exact contents it snapshotted.
      fileRevisionsRef.current.set(
        activeFile.path,
        (fileRevisionsRef.current.get(activeFile.path) ?? 0) + 1,
      );
      updateDirtyPaths((previous) => {
        const next = new Set(previous);
        next.add(activeFile.path);
        return next;
      });
      // A prior per-check pass/fail no longer reflects the edited code, so clear
      // stale check results rather than leaving a misleading green badge.
      updateCodeSparkRunState(draftKey, initialRunRef.current, (previous) => ({
        ...previous,
        terminalStale: true,
        testStale: true,
        checkResults:
          Object.keys(previous.checkResults).length === 0
            ? previous.checkResults
            : {},
      }));
    },
    [activeFile, draftKey, isDisplayOnly, isRunning, updateDirtyPaths],
  );

  const persistDirtyFiles = useCallback(async () => {
    if (isDisplayOnly || !threadId || dirtyPathsRef.current.size === 0) {
      return [];
    }

    const dirty = dirtyPathsRef.current;
    const dirtyFiles = files.filter(
      (file) => file.editable && dirty.has(file.path),
    );
    const orderedFiles = activePath
      ? [
          ...dirtyFiles.filter((file) => file.path !== activePath),
          ...dirtyFiles.filter((file) => file.path === activePath),
        ]
      : dirtyFiles;

    // Snapshot each dirty file's contents and its current revision before we
    // start writing. Completion may only clear a path if its revision is still
    // current — a newer edit during the save must stay dirty and protected.
    const snapshots = orderedFiles.map((file) => ({
      path: file.path,
      contents: file.contents,
      revision: fileRevisionsRef.current.get(file.path) ?? 0,
    }));

    for (const snapshot of snapshots) {
      await writeFile({
        threadId,
        sparkId,
        path: snapshot.path,
        contents: snapshot.contents,
      });
    }

    return snapshots.map(({ path, revision }) => ({ path, revision }));
  }, [activePath, files, isDisplayOnly, sparkId, threadId, writeFile]);

  const run = useCallback(
    (kind: "run" | "test", checkId?: string) => {
      if (isDisplayOnly) return;
      const check = checkId
        ? visibleChecks.find((item) => item.id === checkId)
        : undefined;
      const command = commandForRun(payload, kind, check, hydrated);
      const current = getCodeSparkRunEntry(
        draftKey,
        initialRunRef.current,
      ).state;
      const nextCheckResults = checkId ? { ...current.checkResults } : {};
      if (checkId) delete nextCheckResults[checkId];
      const started = beginCodeSparkRun(
        draftKey,
        initialRunRef.current,
        (() => {
          const pendingRun: CodeSparkDisplayRun = {
            kind,
            status: "running",
            provider,
            command,
            stdout: "",
            stderr: "",
            createdAt: Date.now(),
          };
          return {
            ...current,
            isRunning: true,
            runPhase: dirtyPathsRef.current.size > 0 ? "saving" : "executing",
            runningCheckId: checkId ?? null,
            checkResults: nextCheckResults,
            localError: null,
            localFailureKind: null,
            hasLocalRun: true,
            executionProvider: null,
            executionKind: null,
            localRun: pendingRun,
            terminalRun: kind === "run" ? pendingRun : current.terminalRun,
            terminalStale: kind === "run" ? false : current.terminalStale,
            testRun: kind === "test" ? pendingRun : current.testRun,
            testStale: kind === "test" ? false : current.testStale,
          };
        })(),
      );
      if (!started) return;

      const pending = (async () => {
        try {
          if (!threadId) {
            throw new Error("Open this thread to run the Code Spark.");
          }
          if (!hydrated) {
            throw new Error(
              "Studi is saving this Code Spark session. Try again in a moment.",
            );
          }
          // Persist edits first so the provider runs the learner's latest code.
          // The shared saving phase survives inline/expanded replacement, and
          // saved revisions are reconciled by whichever instance is mounted.
          if (dirtyPathsRef.current.size > 0) {
            const savedFileRevisions = await persistDirtyFiles();
            updateCodeSparkRunState(
              draftKey,
              initialRunRef.current,
              (previous) => ({
                ...previous,
                runPhase: "executing",
                savedFilesVersion: previous.savedFilesVersion + 1,
                savedFileRevisions,
              }),
            );
          } else {
            updateCodeSparkRunState(
              draftKey,
              initialRunRef.current,
              (previous) => ({ ...previous, runPhase: "executing" }),
            );
          }
          if (checkId && !check) {
            throw new Error("Visible Code Spark check is not ready yet.");
          }
          const actionArgs = {
            threadId,
            sparkId,
            mode: kind,
            timeoutMs: 15_000,
            ...(check ? { checkId: check.id } : {}),
          };
          const result = await runCodeSpark({
            ...actionArgs,
          });
          const normalizedRun = normalizeCodeSparkActionResult({
            kind,
            command,
            createdAt: Date.now(),
            result,
          });
          updateCodeSparkRunState(
            draftKey,
            initialRunRef.current,
            (previous) => ({
              ...previous,
              localRun: normalizedRun,
              terminalRun:
                kind === "run" ? normalizedRun : previous.terminalRun,
              terminalStale:
                kind === "run" ? false : previous.terminalStale,
              testRun: kind === "test" ? normalizedRun : previous.testRun,
              testStale: kind === "test" ? false : previous.testStale,
              executionProvider:
                normalizedRun.provider ?? null,
              executionKind: normalizedRun.provider
                ? kind
                : null,
              checkResults: check
                ? { ...previous.checkResults, [check.id]: result.status }
                : kind === "test" && visibleChecks.length === 1
                  ? { [visibleChecks[0]!.id]: result.status }
                  : previous.checkResults,
            }),
          );
        } catch (error) {
          const failure = caughtFailure(error, mode);
          const failureStatus = runStatusForFailure(failure.kind);
          const failedRun: CodeSparkDisplayRun = {
            kind,
            status: failureStatus,
            provider,
            command,
            stdout: "",
            stderr: failure.detail,
            durationMs: 0,
            createdAt: Date.now(),
          };
          updateCodeSparkRunState(
            draftKey,
            initialRunRef.current,
            (previous) => ({
              ...previous,
              localFailureKind: failure.kind,
              localError: failure.message,
              localRun: failedRun,
              terminalRun: kind === "run" ? failedRun : previous.terminalRun,
              terminalStale:
                kind === "run" ? false : previous.terminalStale,
              testRun: kind === "test" ? failedRun : previous.testRun,
              testStale: kind === "test" ? false : previous.testStale,
              checkResults: check
                ? { ...previous.checkResults, [check.id]: failureStatus }
                : previous.checkResults,
            }),
          );
        } finally {
          updateCodeSparkRunState(
            draftKey,
            initialRunRef.current,
            (previous) => ({
              ...previous,
              isRunning: false,
              runPhase: null,
              runningCheckId: null,
            }),
          );
        }
      })();

      attachCodeSparkRunPromise(draftKey, initialRunRef.current, pending);
    },
    [
      draftKey,
      payload,
      hydrated,
      persistDirtyFiles,
      runCodeSpark,
      sparkId,
      threadId,
      visibleChecks,
      isDisplayOnly,
      mode,
      provider,
    ],
  );

  if (!activeFile) {
    return (
      <div
        className="code-spark-shell"
        data-expanded={isExpanded}
        data-layout={isExpanded ? "expanded" : "inline"}
        data-runtime-provider={provider}
        data-runtime-hydrated={hydrated ? "true" : "false"}
        data-runtime-execution-provider={executionProvider ?? undefined}
        data-runtime-execution-kind={executionKind ?? undefined}
      >
        <div className="code-spark-error" role="alert">
          Code Spark has no files.
        </div>
      </div>
    );
  }

  const editorNode = (
    <div className="code-spark-editor-pane">
      <FileTabs
        files={visibleFiles}
        activePath={activeFile.path}
        dirtyPaths={dirtyPaths}
        onSelect={setActivePath}
      />
      <div className="code-spark-editor">
        <Editor
          height="100%"
          theme="vs-dark"
          language={languageForMonaco(activeFile.language)}
          value={activeFile.contents}
          onChange={updateActiveFile}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: isExpanded ? 13 : 12.5,
            lineNumbers: isExpanded ? "on" : "off",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            readOnly: isDisplayOnly || isRunning || !activeFile.editable,
            padding: { top: 10, bottom: 10 },
          }}
        />
      </div>
    </div>
  );

  const controlState = isDisplayOnly
    ? "archived"
    : !threadId
      ? "blocked"
      : !hydrated
        ? "hydrating"
        : runPhase === "saving"
          ? "saving"
          : isRunning
            ? "running"
            : hasUnsavedEdits
              ? "dirty"
              : "ready";
  const controlStatusNode = (
    <p
      id={controlStatusId}
      className="code-spark-control-status"
      data-state={controlState}
    >
      {controlStatusText}
    </p>
  );
  const feedbackNode = (
    <div className="code-spark-feedback-grid">
      <TerminalPanel
        mode={mode}
        run={displayedTerminalRun}
        isStale={terminalStale}
        isRunning={isRunning && localRun?.kind === "run"}
        statusId={runStatusRegionId}
      />
      <TestResultsPanel
        isChallenge={isChallenge}
        checks={visibleChecks}
        visibleCheckLabel={visibleCheckLabel}
        onRunCheck={(checkId) => void run("test", checkId)}
        disabled={controlsDisabled}
        describedById={controlStatusId}
        disabledReason={disabledReason}
        results={checkResults}
        runningCheckId={runningCheckId}
        run={displayedTestRun}
        hasUnsavedEdits={hasUnsavedEdits || testStale}
        isRunning={isRunning && localRun?.kind === "test"}
      />
    </div>
  );
  const liveStatusNode = (
    <div
      className="code-spark-live-status"
      role="status"
      aria-live="polite"
      aria-label="Code Spark run status"
    >
      <span>{runStatus}</span>
      <span>{latestActionOutput}</span>
    </div>
  );

  /* ── Inline (chat) layout: compact, but fully runnable without expanding ── */
  if (!isExpanded) {
    return (
      <div
        className="code-spark-inline"
        data-mode={mode}
        data-layout="inline"
        data-tone={tone}
        data-runtime-provider={provider}
        data-runtime-hydrated={hydrated ? "true" : "false"}
        data-runtime-execution-provider={executionProvider ?? undefined}
        data-runtime-execution-kind={executionKind ?? undefined}
      >
        <div
          className="code-spark-guidance-callout"
          role="note"
          aria-label={isChallenge ? "Challenge guidance" : "Sandbox guidance"}
          data-mode={mode}
        >
          <strong>{isChallenge ? "Your challenge" : "Open sandbox"}</strong>
          <span>{payload.instructions}</span>
          <small>{modeNote}</small>
        </div>

        {editorNode}

        <div className="code-spark-controls-row">
          <RunControls
            onRun={() => void run("run")}
            onTest={() => void run("test")}
            disabled={controlsDisabled}
            describedById={controlStatusId}
            disabledReason={disabledReason}
            runLabel="Run"
            testLabel="Test"
          />
          {controlStatusNode}
        </div>

        <div ref={inlineFeedbackRef} className="code-spark-inline-feedback">
          {feedbackNode}
        </div>
        {liveStatusNode}

        <RunAlert failureKind={failureKind} isChallenge={isChallenge} />

        {localError && !isDisplayOnly ? (
          <div className="code-spark-error" role="alert">
            {localError}
          </div>
        ) : null}
      </div>
    );
  }

  /* ── Expanded workbench: warm context rail, dark editor, bottom results ── */
  return (
    <div
      className="code-spark-shell"
      data-expanded={isExpanded}
      data-layout="expanded"
      data-mode={mode}
      data-runtime-provider={provider}
      data-runtime-hydrated={hydrated ? "true" : "false"}
      data-runtime-execution-provider={executionProvider ?? undefined}
      data-runtime-execution-kind={executionKind ?? undefined}
    >
      <div className="code-spark-toolbar">
        <div className="code-spark-control-group">
          <RunControls
            onRun={() => void run("run")}
            onTest={() => void run("test")}
            disabled={controlsDisabled}
            describedById={controlStatusId}
            disabledReason={disabledReason}
            runLabel="Run"
            testLabel="Test"
          />
          {controlStatusNode}
        </div>
      </div>

      <div className="code-spark-workspace">
        <aside
          className="code-spark-context"
          aria-label="Code Spark task and criteria"
        >
          <div className="code-spark-guidance">
            <p className="code-spark-section-label">Objective</p>
            <p className="code-spark-instructions">{payload.instructions}</p>
            <div
              className="code-spark-guidance-callout"
              role="note"
              aria-label={
                isChallenge ? "Challenge guidance" : "Sandbox guidance"
              }
              data-mode={mode}
            >
              <strong>{isChallenge ? "Your challenge" : "Open sandbox"}</strong>
              <span>{modeNote}</span>
            </div>
            {providerStatus === "unavailable" ||
            providerStatus === "unconfigured" ? (
              <p className="code-spark-provider-note">{providerNote}</p>
            ) : null}
          </div>
        </aside>

        <div className="code-spark-editor-region">{editorNode}</div>
      </div>

      {feedbackNode}
      {liveStatusNode}

      <RunAlert failureKind={failureKind} isChallenge={isChallenge} />

      {localError && !isDisplayOnly ? (
        <div className="code-spark-error" role="alert">
          {localError}
        </div>
      ) : null}
    </div>
  );
}

export default function CodeSparkScene(props: CodeSparkSceneProps) {
  const draftKey = `${props.threadId ?? "detached"}::${props.sparkId}`;
  return <CodeSparkSceneInstance key={draftKey} {...props} />;
}
