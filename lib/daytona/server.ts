import { Daytona } from "@daytonaio/sdk";

const DEFAULT_PTY_COLS = 120;
const DEFAULT_PTY_ROWS = 32;
const SANDBOX_READY_TIMEOUT_SECONDS = 60;
const SANDBOX_READY_POLL_MS = 250;
const WORKSPACE_ROOT = "/workspace";
const MIGRATION_SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".turbo",
]);

type PtyShellDiagnostics = {
  sandboxUser: string;
  reportedLoginShell: string | null;
  availableShells: string[];
  userHomeDir: string | null;
  workDir: string | null;
  inspectOutput?: string;
  repairStatus?: string;
  repairTarget?: string | null;
  repairOutput?: string;
};

function createDaytonaClient() {
  return new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL,
    organizationId: process.env.DAYTONA_ORGANIZATION_ID,
  });
}

function logDaytona(
  event: string,
  context: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
) {
  const payload = {
    source: "lab-daytona",
    event,
    ...context,
  };

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.info(payload);
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function isMissingZshError(error: unknown): boolean {
  return formatErrorMessage(error)
    .toLowerCase()
    .includes("fork/exec /usr/bin/zsh: no such file or directory");
}

function isStateChangeInProgressError(error: unknown): boolean {
  return formatErrorMessage(error)
    .toLowerCase()
    .includes("state change in progress");
}

function isInactivePtyError(error: unknown): boolean {
  return formatErrorMessage(error)
    .toLowerCase()
    .includes("inactive pty session");
}

function isPtyAlreadyExistsError(error: unknown): boolean {
  return formatErrorMessage(error)
    .toLowerCase()
    .includes("pty session with id")
    && formatErrorMessage(error).toLowerCase().includes("already exists");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function joinSandboxPath(parent: string, child: string) {
  return `${parent.replace(/\/+$/, "")}/${child.replace(/^\/+/, "")}`;
}

async function waitForSandboxStarted(sandbox: Awaited<ReturnType<typeof getSandboxById>>) {
  const deadline = Date.now() + SANDBOX_READY_TIMEOUT_SECONDS * 1000;

  while (Date.now() < deadline) {
    await sandbox.refreshData();

    if (sandbox.state === "started") {
      return;
    }

    if (sandbox.state === "error") {
      throw new Error(
        `Sandbox ${sandbox.id} entered error state while waiting to start: ${sandbox.errorReason ?? "unknown error"}`,
      );
    }

    await sleep(SANDBOX_READY_POLL_MS);
  }

  throw new Error(
    `Sandbox ${sandbox.id} did not reach started state within ${SANDBOX_READY_TIMEOUT_SECONDS} seconds.`,
  );
}

async function ensureSandboxStartedWithRetry(
  sandbox: Awaited<ReturnType<typeof getSandboxById>>,
) {
  if (sandbox.state === "error" && sandbox.recoverable) {
    logDaytona("sandbox.recover.begin", {
      sandboxId: sandbox.id,
      state: sandbox.state,
      recoverable: sandbox.recoverable,
    });

    try {
      await sandbox.recover(SANDBOX_READY_TIMEOUT_SECONDS);
    } catch (error) {
      if (!isStateChangeInProgressError(error)) {
        throw error;
      }

      logDaytona(
        "sandbox.recover.wait",
        {
          sandboxId: sandbox.id,
          state: sandbox.state,
          error: formatErrorMessage(error),
        },
        "warn",
      );
      await waitForSandboxStarted(sandbox);
    }
  }

  if (sandbox.state !== "started") {
    logDaytona("sandbox.start.begin", {
      sandboxId: sandbox.id,
      state: sandbox.state,
      user: sandbox.user,
    });

    try {
      await sandbox.start(SANDBOX_READY_TIMEOUT_SECONDS);
    } catch (error) {
      if (!isStateChangeInProgressError(error)) {
        throw error;
      }

      logDaytona(
        "sandbox.start.wait",
        {
          sandboxId: sandbox.id,
          state: sandbox.state,
          error: formatErrorMessage(error),
        },
        "warn",
      );
      await waitForSandboxStarted(sandbox);
    }
  }
}

async function safeExecuteCommand(
  sandbox: Awaited<ReturnType<typeof getSandboxById>>,
  command: string,
) {
  try {
    return await sandbox.process.executeCommand(command, "/workspace", undefined, 20);
  } catch (error) {
    logDaytona(
      "sandbox.exec.failed",
      {
        sandboxId: sandbox.id,
        command,
        error: formatErrorMessage(error),
      },
      "warn",
    );
    return null;
  }
}

function parseKeyValueOutput(output: string) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((result, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        return result;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      result[key] = value;
      return result;
    }, {});
}

async function inspectPtyShellDiagnostics(
  sandbox: Awaited<ReturnType<typeof getSandboxById>>,
): Promise<PtyShellDiagnostics> {
  const [userHomeDir, workDir, inspectResult] = await Promise.all([
    sandbox.getUserHomeDir().catch(() => undefined),
    sandbox.getWorkDir().catch(() => undefined),
    safeExecuteCommand(
      sandbox,
      [
        'USER_NAME="$(id -un 2>/dev/null || whoami 2>/dev/null || echo unknown)"',
        'LOGIN_SHELL=""',
        'if command -v getent >/dev/null 2>&1; then',
        '  LOGIN_SHELL="$(getent passwd "$USER_NAME" | cut -d: -f7 || true)"',
        "fi",
        'if [ -z "$LOGIN_SHELL" ] && [ -r /etc/passwd ]; then',
        '  LOGIN_SHELL="$(grep "^$USER_NAME:" /etc/passwd | head -n1 | cut -d: -f7 || true)"',
        "fi",
        'AVAILABLE_SHELLS=""',
        'for candidate in /usr/bin/zsh /bin/zsh /bin/bash /usr/bin/bash /bin/sh /usr/bin/sh; do',
        '  if [ -x "$candidate" ]; then',
        '    AVAILABLE_SHELLS="${AVAILABLE_SHELLS}${candidate},"',
        "  fi",
        "done",
        'printf "user=%s\\n" "$USER_NAME"',
        'printf "login_shell=%s\\n" "$LOGIN_SHELL"',
        'printf "available_shells=%s\\n" "$AVAILABLE_SHELLS"',
      ].join("; "),
    ),
  ]);

  const parsed = parseKeyValueOutput(inspectResult?.result ?? "");

  return {
    sandboxUser: sandbox.user,
    reportedLoginShell: parsed.login_shell || null,
    availableShells: (parsed.available_shells ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    userHomeDir: userHomeDir ?? null,
    workDir: workDir ?? null,
    inspectOutput: inspectResult?.result,
  };
}

async function attemptMissingZshRepair(
  sandbox: Awaited<ReturnType<typeof getSandboxById>>,
) {
  const repairResult = await safeExecuteCommand(
    sandbox,
    [
      'ALT=""',
      'for candidate in /bin/bash /usr/bin/bash /bin/sh /usr/bin/sh; do',
      '  if [ -x "$candidate" ]; then',
      '    ALT="$candidate"',
      "    break",
      "  fi",
      "done",
      'if [ -z "$ALT" ]; then',
      '  echo "repair_status=no_alt_shell"',
      "  exit 20",
      "fi",
      'if [ -x /usr/bin/zsh ]; then',
      '  echo "repair_status=already_present"',
      '  echo "repair_target=/usr/bin/zsh"',
      "  exit 0",
      "fi",
      'if ln -sf "$ALT" /usr/bin/zsh 2>/dev/null; then',
      '  echo "repair_status=linked"',
      '  echo "repair_target=$ALT"',
      "  exit 0",
      "fi",
      'USER_NAME="$(id -un 2>/dev/null || whoami 2>/dev/null || echo unknown)"',
      'if command -v chsh >/dev/null 2>&1 && chsh -s "$ALT" "$USER_NAME" >/dev/null 2>&1; then',
      '  echo "repair_status=changed_login_shell"',
      '  echo "repair_target=$ALT"',
      "  exit 0",
      "fi",
      'echo "repair_status=repair_failed"',
      'echo "repair_target=$ALT"',
      "exit 21",
    ].join("; "),
  );

  const parsed = parseKeyValueOutput(repairResult?.result ?? "");
  return {
    repairStatus: parsed.repair_status ?? "command_failed",
    repairTarget: parsed.repair_target ?? null,
    repairOutput: repairResult?.result,
    exitCode: repairResult?.exitCode,
  };
}

function buildPtyShellErrorMessage(
  baseError: unknown,
  diagnostics: PtyShellDiagnostics,
) {
  const availableShells = diagnostics.availableShells.length
    ? diagnostics.availableShells.join(", ")
    : "none";
  const repairDetail = diagnostics.repairStatus
    ? ` Repair attempt: ${diagnostics.repairStatus}${diagnostics.repairTarget ? ` (${diagnostics.repairTarget})` : ""}.`
    : "";

  return [
    formatErrorMessage(baseError),
    `Sandbox user: ${diagnostics.sandboxUser}.`,
    `Login shell: ${diagnostics.reportedLoginShell ?? "unknown"}.`,
    `Available shells: ${availableShells}.`,
    repairDetail.trim(),
  ]
    .filter(Boolean)
    .join(" ");
}

async function createOrReconnectPty(params: {
  sandboxId: string;
  sessionId: string;
  cols: number;
  rows: number;
}) {
  const sandbox = await ensureWorkspaceDirectory(params.sandboxId);

  const killPtySessionIfPresent = async (reason: string) => {
    try {
      await sandbox.process.killPtySession(params.sessionId);
      logDaytona("pty.ensure.killed", {
        sandboxId: sandbox.id,
        sessionId: params.sessionId,
        reason,
      });
    } catch (error) {
      logDaytona(
        "pty.ensure.kill_failed",
        {
          sandboxId: sandbox.id,
          sessionId: params.sessionId,
          reason,
          error: formatErrorMessage(error),
        },
        "warn",
      );
    }
  };

  logDaytona("pty.ensure.begin", {
    sandboxId: sandbox.id,
    sessionId: params.sessionId,
    cols: params.cols,
    rows: params.rows,
    sandboxState: sandbox.state,
    sandboxUser: sandbox.user,
  });

  try {
    const existing = await sandbox.process.getPtySessionInfo(params.sessionId);
    if (existing.active === false) {
      logDaytona(
        "pty.ensure.inactive_existing",
        {
          sandboxId: sandbox.id,
          sessionId: params.sessionId,
          cols: existing.cols,
          rows: existing.rows,
        },
        "warn",
      );
      await killPtySessionIfPresent("existing session inactive");
      throw new Error("inactive PTY session removed; recreating");
    }

    if (
      typeof params.cols === "number" &&
      typeof params.rows === "number" &&
      (existing.cols !== params.cols || existing.rows !== params.rows)
    ) {
      try {
        const resized = await sandbox.process.resizePtySession(
          params.sessionId,
          params.cols,
          params.rows,
        );

        logDaytona("pty.ensure.reused", {
          sandboxId: sandbox.id,
          sessionId: params.sessionId,
          resized: true,
          cols: resized.cols,
          rows: resized.rows,
        });

        return {
          sessionId: params.sessionId,
          created: false,
          cols: resized.cols,
          rows: resized.rows,
        };
      } catch (error) {
        if (!isInactivePtyError(error)) {
          throw error;
        }

        logDaytona(
          "pty.ensure.resize_inactive",
          {
            sandboxId: sandbox.id,
            sessionId: params.sessionId,
            error: formatErrorMessage(error),
          },
          "warn",
        );
        await killPtySessionIfPresent("resize failed on inactive session");
        throw error;
      }
    }

    logDaytona("pty.ensure.reused", {
      sandboxId: sandbox.id,
      sessionId: params.sessionId,
      resized: false,
      cols: existing.cols,
      rows: existing.rows,
    });

    return {
      sessionId: params.sessionId,
      created: false,
      cols: existing.cols,
      rows: existing.rows,
    };
  } catch (error) {
    logDaytona(
      "pty.ensure.session_lookup_failed",
      {
        sandboxId: sandbox.id,
        sessionId: params.sessionId,
        error: formatErrorMessage(error),
      },
      "warn",
    );
  }

  const createHandle = async () => {
    const handle = await sandbox.process.createPty({
      id: params.sessionId,
      cwd: "/workspace",
      envs: {
        TERM: "xterm-256color",
        LANG: "en_US.UTF-8",
      },
      cols: params.cols,
      rows: params.rows,
      onData: () => {},
    });

    try {
      await handle.waitForConnection();
    } finally {
      await handle.disconnect().catch(() => undefined);
    }
  };

  try {
    await createHandle();
  } catch (error) {
    if (isPtyAlreadyExistsError(error)) {
      logDaytona(
        "pty.ensure.create_conflict",
        {
          sandboxId: sandbox.id,
          sessionId: params.sessionId,
          error: formatErrorMessage(error),
        },
        "warn",
      );

      try {
        const existing = await sandbox.process.getPtySessionInfo(params.sessionId);
        if (existing.active) {
          logDaytona("pty.ensure.create_conflict_reused", {
            sandboxId: sandbox.id,
            sessionId: params.sessionId,
            cols: existing.cols,
            rows: existing.rows,
          });
          return {
            sessionId: params.sessionId,
            created: false,
            cols: existing.cols,
            rows: existing.rows,
          };
        }

        await killPtySessionIfPresent("create conflict with inactive session");
        await createHandle();
      } catch (followupError) {
        if (!isMissingZshError(followupError)) {
          logDaytona(
            "pty.ensure.create_failed",
            {
              sandboxId: sandbox.id,
              sessionId: params.sessionId,
              error: formatErrorMessage(followupError),
            },
            "error",
          );
          throw followupError;
        }

        error = followupError;
      }
    }

    if (!isMissingZshError(error)) {
      logDaytona(
        "pty.ensure.create_failed",
        {
          sandboxId: sandbox.id,
          sessionId: params.sessionId,
          error: formatErrorMessage(error),
        },
        "error",
      );
      throw error;
    }

    const diagnostics = await inspectPtyShellDiagnostics(sandbox);
    const repair = await attemptMissingZshRepair(sandbox);
    diagnostics.repairStatus = repair.repairStatus;
    diagnostics.repairTarget = repair.repairTarget;
    diagnostics.repairOutput = repair.repairOutput;

    logDaytona(
      "pty.ensure.missing_zsh",
      {
        sandboxId: sandbox.id,
        sessionId: params.sessionId,
        sandboxUser: diagnostics.sandboxUser,
        loginShell: diagnostics.reportedLoginShell,
        availableShells: diagnostics.availableShells,
        repairStatus: diagnostics.repairStatus,
        repairTarget: diagnostics.repairTarget,
        inspectOutput: diagnostics.inspectOutput,
        repairOutput: diagnostics.repairOutput,
        error: formatErrorMessage(error),
      },
      "error",
    );

    if (
      diagnostics.repairStatus === "linked" ||
      diagnostics.repairStatus === "changed_login_shell" ||
      diagnostics.repairStatus === "already_present"
    ) {
      await createHandle();
    } else {
      throw new Error(buildPtyShellErrorMessage(error, diagnostics));
    }
  }

  logDaytona("pty.ensure.created", {
    sandboxId: sandbox.id,
    sessionId: params.sessionId,
    cols: params.cols,
    rows: params.rows,
  });

  return {
    sessionId: params.sessionId,
    created: true,
    cols: params.cols,
    rows: params.rows,
  };
}

export async function getSandboxById(sandboxId: string) {
  const daytona = createDaytonaClient();
  return await daytona.get(sandboxId);
}

export async function ensureSandboxReady(sandboxId: string) {
  const sandbox = await getSandboxById(sandboxId);

  logDaytona("sandbox.ready.begin", {
    sandboxId,
    state: sandbox.state,
    user: sandbox.user,
    recoverable: sandbox.recoverable,
  });

  await ensureSandboxStartedWithRetry(sandbox);

  await sandbox.refreshActivity().catch((error) => {
    logDaytona(
      "sandbox.refresh_activity_failed",
      {
        sandboxId,
        error: formatErrorMessage(error),
      },
      "warn",
    );
  });

  logDaytona("sandbox.ready.complete", {
    sandboxId,
    state: sandbox.state,
    user: sandbox.user,
  });

  return sandbox;
}

export async function ensureWorkspaceDirectory(sandboxId: string) {
  const sandbox = await ensureSandboxReady(sandboxId);
  try {
    await sandbox.fs.createFolder("/workspace", "755");
    logDaytona("workspace.ensure.created", {
      sandboxId,
      path: "/workspace",
    });
  } catch (error) {
    const message = formatErrorMessage(error).toLowerCase();
    const isExistsError =
      message.includes("already exists") || message.includes("file exists");
    logDaytona(
      "workspace.ensure.exists_or_failed",
      {
        sandboxId,
        path: "/workspace",
        error: formatErrorMessage(error),
      },
      isExistsError ? "info" : "warn",
    );
  }
  return sandbox;
}

export async function ensurePtySession(params: {
  sandboxId: string;
  sessionId: string;
  cols?: number;
  rows?: number;
}) {
  return await createOrReconnectPty({
    sandboxId: params.sandboxId,
    sessionId: params.sessionId,
    cols: params.cols ?? DEFAULT_PTY_COLS,
    rows: params.rows ?? DEFAULT_PTY_ROWS,
  });
}

export async function connectPtySession(params: {
  sandboxId: string;
  sessionId: string;
  onData: (data: Uint8Array) => void | Promise<void>;
}) {
  const sandbox = await ensureSandboxReady(params.sandboxId);
  logDaytona("pty.connect.begin", {
    sandboxId: sandbox.id,
    sessionId: params.sessionId,
  });
  const handle = await sandbox.process.connectPty(params.sessionId, {
    onData: params.onData,
  });
  await handle.waitForConnection();
  logDaytona("pty.connect.ready", {
    sandboxId: sandbox.id,
    sessionId: params.sessionId,
  });
  return handle;
}

export async function sendPtyInput(params: {
  sandboxId: string;
  sessionId: string;
  data: string | Uint8Array;
}) {
  const handle = await connectPtySession({
    sandboxId: params.sandboxId,
    sessionId: params.sessionId,
    onData: () => {},
  });

  try {
    await handle.sendInput(params.data);
  } finally {
    await handle.disconnect().catch(() => undefined);
  }
}

export async function resizePty(params: {
  sandboxId: string;
  sessionId: string;
  cols: number;
  rows: number;
}) {
  const sandbox = await ensureSandboxReady(params.sandboxId);
  return await sandbox.process.resizePtySession(
    params.sessionId,
    params.cols,
    params.rows,
  );
}

export async function getSignedPreviewUrl(params: {
  sandboxId: string;
  port: number;
  expiresInSeconds?: number;
}) {
  const sandbox = await ensureSandboxReady(params.sandboxId);
  return await sandbox.getSignedPreviewUrl(
    params.port,
    params.expiresInSeconds,
  );
}

async function copyWorkspaceDirectory(params: {
  fromSandbox: Awaited<ReturnType<typeof getSandboxById>>;
  toSandbox: Awaited<ReturnType<typeof getSandboxById>>;
  path: string;
  copied: { files: number; directories: number };
}) {
  const entries = await params.fromSandbox.fs.listFiles(params.path);

  for (const entry of entries) {
    const sourcePath = joinSandboxPath(params.path, entry.name);
    const destinationPath = joinSandboxPath(params.path, entry.name);

    if (entry.isDir) {
      if (MIGRATION_SKIP_DIRS.has(entry.name)) {
        logDaytona("workspace.migrate.skip_dir", {
          fromSandboxId: params.fromSandbox.id,
          toSandboxId: params.toSandbox.id,
          path: sourcePath,
        });
        continue;
      }

      await params.toSandbox.fs.createFolder(destinationPath, "755").catch(() => undefined);
      params.copied.directories += 1;
      await copyWorkspaceDirectory({
        fromSandbox: params.fromSandbox,
        toSandbox: params.toSandbox,
        path: sourcePath,
        copied: params.copied,
      });
      continue;
    }

    const bytes = await params.fromSandbox.fs.downloadFile(sourcePath);
    await params.toSandbox.fs.uploadFile(bytes, destinationPath);
    params.copied.files += 1;
  }
}

export async function migrateWorkspaceToReplacementSandbox(params: {
  fromSandboxId: string;
  toSandboxId: string;
}) {
  const [fromSandbox, toSandbox] = await Promise.all([
    ensureWorkspaceDirectory(params.fromSandboxId),
    ensureWorkspaceDirectory(params.toSandboxId),
  ]);

  const copied = { files: 0, directories: 0 };

  logDaytona("workspace.migrate.begin", {
    fromSandboxId: fromSandbox.id,
    toSandboxId: toSandbox.id,
    root: WORKSPACE_ROOT,
  });

  try {
    await copyWorkspaceDirectory({
      fromSandbox,
      toSandbox,
      path: WORKSPACE_ROOT,
      copied,
    });
  } catch (error) {
    logDaytona(
      "workspace.migrate.failed",
      {
        fromSandboxId: fromSandbox.id,
        toSandboxId: toSandbox.id,
        error: formatErrorMessage(error),
      },
      "error",
    );
    throw error;
  }

  logDaytona("workspace.migrate.complete", {
    fromSandboxId: fromSandbox.id,
    toSandboxId: toSandbox.id,
    files: copied.files,
    directories: copied.directories,
    skippedDirectories: Array.from(MIGRATION_SKIP_DIRS),
  });

  return copied;
}
