"use node";

import { Daytona, Image } from "@daytonaio/sdk";

const DEFAULT_PTY_COLS = 120;
const DEFAULT_PTY_ROWS = 32;
const SANDBOX_READY_TIMEOUT_SECONDS = 60;
const SANDBOX_READY_POLL_MS = 250;

type PtyShellDiagnostics = {
  sandboxUser: string;
  reportedLoginShell: string | null;
  availableShells: string[];
  userHomeDir: string | null;
  workDir: string | null;
  inspectOutput?: string;
};

function createDaytonaClient() {
  return new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL,
    organizationId: process.env.DAYTONA_ORGANIZATION_ID,
    target:
      process.env.DAYTONA_TARGET && process.env.DAYTONA_TARGET.trim().length > 0
        ? process.env.DAYTONA_TARGET.trim()
        : undefined,
  });
}

function resolveSandboxBaseImage(language?: string): string {
  const normalized = language?.trim().toLowerCase();

  switch (normalized) {
    case "javascript":
    case "typescript":
      return "node:22-bookworm";
    case "python":
      return "python:3.12-slim-bookworm";
    case "go":
      return "golang:1.24-bookworm";
    case "rust":
      return "rust:1.86-bookworm";
    case "ruby":
      return "ruby:3.3-bookworm";
    case "php":
      return "php:8.3-cli-bookworm";
    case "java":
      return "eclipse-temurin:21-jdk";
    case "csharp":
      return "mcr.microsoft.com/dotnet/sdk:8.0";
    case "elixir":
      return "elixir:1.17-otp-27";
    default:
      return "node:22-bookworm";
  }
}

function buildLabSandboxImage(language?: string): Image {
  const normalized = language?.trim().toLowerCase() ?? "typescript";
  const image = Image.base(resolveSandboxBaseImage(normalized));
  const bootstrapCommands = [
    "set -eux",
    "if command -v apt-get >/dev/null 2>&1; then apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y zsh git curl ca-certificates passwd && rm -rf /var/lib/apt/lists/*; fi",
    "if command -v apk >/dev/null 2>&1; then apk add --no-cache zsh git curl ca-certificates shadow; fi",
    'if [ ! -x /usr/bin/zsh ] && command -v zsh >/dev/null 2>&1; then mkdir -p /usr/bin && ln -sf "$(command -v zsh)" /usr/bin/zsh; fi',
    'if ! id -u daytona >/dev/null 2>&1; then useradd -m -s /usr/bin/zsh daytona; fi',
    "if command -v usermod >/dev/null 2>&1; then usermod -s /usr/bin/zsh daytona || true; fi",
    "mkdir -p /workspace",
    "chown -R daytona:daytona /workspace || true",
  ];

  if (normalized === "javascript" || normalized === "typescript") {
    bootstrapCommands.splice(
      6,
      0,
      'if ! command -v bun >/dev/null 2>&1; then curl -fsSL https://bun.sh/install | bash && ln -sf /root/.bun/bin/bun /usr/local/bin/bun; fi',
    );
  }

  return image
    .runCommands(...bootstrapCommands)
    .env({
      SHELL: "/usr/bin/zsh",
      TERM: "xterm-256color",
      LANG: "en_US.UTF-8",
    })
    .workdir("/workspace");
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

function buildPtyShellErrorMessage(
  baseError: unknown,
  diagnostics: PtyShellDiagnostics,
) {
  const availableShells = diagnostics.availableShells.length
    ? diagnostics.availableShells.join(", ")
    : "none";

  return [
    formatErrorMessage(baseError),
    `Sandbox user: ${diagnostics.sandboxUser}.`,
    `Login shell: ${diagnostics.reportedLoginShell ?? "unknown"}.`,
    `Available shells: ${availableShells}.`,
    "The sandbox user's login shell is invalid for PTY startup. Delete this thread and recreate the lab.",
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

    logDaytona(
      "pty.ensure.missing_zsh",
      {
        sandboxId: sandbox.id,
        sessionId: params.sessionId,
        sandboxUser: diagnostics.sandboxUser,
        loginShell: diagnostics.reportedLoginShell,
        availableShells: diagnostics.availableShells,
        inspectOutput: diagnostics.inspectOutput,
        userHomeDir: diagnostics.userHomeDir,
        workDir: diagnostics.workDir,
        error: formatErrorMessage(error),
      },
      "error",
    );

    throw new Error(buildPtyShellErrorMessage(error, diagnostics));
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

export async function createManagedLabSandbox(params: {
  language: string;
  user: string;
  autoDeleteInterval: number;
  labels: Record<string, string>;
}) {
  const daytona = createDaytonaClient();
  return await daytona.create(
    {
      language: params.language,
      image: buildLabSandboxImage(params.language),
      autoDeleteInterval: params.autoDeleteInterval,
      user: params.user,
      labels: params.labels,
    },
    {
      timeout: 120,
    },
  );
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
