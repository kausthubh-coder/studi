import { Daytona } from "@daytonaio/sdk";

const DEFAULT_PTY_COLS = 120;
const DEFAULT_PTY_ROWS = 32;

function createDaytonaClient() {
  return new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL,
    organizationId: process.env.DAYTONA_ORGANIZATION_ID,
  });
}

export async function getSandboxById(sandboxId: string) {
  const daytona = createDaytonaClient();
  return await daytona.get(sandboxId);
}

export async function ensureSandboxReady(sandboxId: string) {
  const sandbox = await getSandboxById(sandboxId);

  if (sandbox.state === "error" && sandbox.recoverable) {
    await sandbox.recover();
  }

  if (sandbox.state !== "started") {
    await sandbox.start();
  }

  await sandbox.refreshActivity();
  return sandbox;
}

export async function ensureWorkspaceDirectory(sandboxId: string) {
  const sandbox = await ensureSandboxReady(sandboxId);
  try {
    await sandbox.fs.createFolder("/workspace", "755");
  } catch {
    // Ignore if the folder already exists.
  }
  return sandbox;
}

export async function ensurePtySession(params: {
  sandboxId: string;
  sessionId: string;
  cols?: number;
  rows?: number;
}) {
  const sandbox = await ensureWorkspaceDirectory(params.sandboxId);

  try {
    const existing = await sandbox.process.getPtySessionInfo(params.sessionId);
    if (
      typeof params.cols === "number" &&
      typeof params.rows === "number" &&
      (existing.cols !== params.cols || existing.rows !== params.rows)
    ) {
      const resized = await sandbox.process.resizePtySession(
        params.sessionId,
        params.cols,
        params.rows,
      );
      return {
        sessionId: params.sessionId,
        created: false,
        cols: resized.cols,
        rows: resized.rows,
      };
    }

    return {
      sessionId: params.sessionId,
      created: false,
      cols: existing.cols,
      rows: existing.rows,
    };
  } catch {
    const handle = await sandbox.process.createPty({
      id: params.sessionId,
      cwd: "/workspace",
      envs: {
        TERM: "xterm-256color",
        LANG: "en_US.UTF-8",
      },
      cols: params.cols ?? DEFAULT_PTY_COLS,
      rows: params.rows ?? DEFAULT_PTY_ROWS,
      onData: () => {},
    });

    try {
      await handle.waitForConnection();
    } finally {
      await handle.disconnect().catch(() => undefined);
    }

    return {
      sessionId: params.sessionId,
      created: true,
      cols: params.cols ?? DEFAULT_PTY_COLS,
      rows: params.rows ?? DEFAULT_PTY_ROWS,
    };
  }
}

export async function connectPtySession(params: {
  sandboxId: string;
  sessionId: string;
  onData: (data: Uint8Array) => void | Promise<void>;
}) {
  const sandbox = await ensureSandboxReady(params.sandboxId);
  const handle = await sandbox.process.connectPty(params.sessionId, {
    onData: params.onData,
  });
  await handle.waitForConnection();
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
