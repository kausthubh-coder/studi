"use node";

import { Buffer } from "node:buffer";
import { Daytona } from "@daytona/sdk";
import type { FileInfo, Match } from "@daytona/toolbox-api-client";
import type {
  LabRuntimeCreateInput,
  LabRuntimeFileEntry,
  LabRuntimeProvider,
  LabRuntimeSearchMatch,
  LabRuntimeSession,
} from "../../lib/labs/runtime";
import { makeLabSessionName, normalizeLabPath } from "../../lib/labs/runtime";

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function dirname(path: string) {
  const normalized = normalizeLabPath(path);
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "." : normalized.slice(0, index);
}

function toUnixMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toFileEntry(root: string, file: FileInfo): LabRuntimeFileEntry {
  const normalizedRoot = normalizeLabPath(root);
  const path = normalizedRoot === "." ? file.name : `${normalizedRoot}/${file.name}`;
  return {
    path,
    name: file.name,
    type: file.isDir ? "directory" : "file",
    size: file.isDir ? undefined : file.size,
    modifiedAt: toUnixMs(file.modifiedAt),
  };
}

function toSearchMatch(match: Match): LabRuntimeSearchMatch {
  return {
    path: match.file,
    line: match.line,
    content: match.content,
  };
}

async function toRuntimeSession(
  sandbox: Awaited<ReturnType<Daytona["create"]>>,
): Promise<LabRuntimeSession> {
  const workspacePath =
    (await sandbox.getWorkDir()) ??
    (await sandbox.getUserHomeDir()) ??
    "/workspace";

  return {
    provider: "daytona",
    sandboxId: sandbox.id,
    workspacePath,
    status: sandbox.state === "error" ? "error" : "ready",
    previewUrls: [],
  };
}

function createDaytonaClient() {
  return new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL,
    target: process.env.DAYTONA_TARGET,
  });
}

export function createDaytonaLabRuntimeProvider(): LabRuntimeProvider {
  async function getSandbox(sandboxId: string) {
    const daytona = createDaytonaClient();
    const sandbox = await daytona.get(sandboxId);
    if (sandbox.state && sandbox.state !== "started") {
      await sandbox.start(60);
    }
    return sandbox;
  }

  return {
    async create(input: LabRuntimeCreateInput) {
      const daytona = createDaytonaClient();
      const sandbox = await daytona.create(
        {
          name: makeLabSessionName(input.title),
          language: input.language ?? "python",
          labels: {
            app: "studi",
            provider: "daytona",
            ...(input.labels ?? {}),
          },
          autoStopInterval: 30,
          autoArchiveInterval: 60 * 24 * 7,
          autoDeleteInterval: 60 * 24 * 14,
        },
        { timeout: 90 },
      );
      return await toRuntimeSession(sandbox);
    },
    async resume(input) {
      const sandbox = await getSandbox(input.sandboxId);
      return await toRuntimeSession(sandbox);
    },
    async list(input) {
      const sandbox = await getSandbox(input.sandboxId);
      const path = normalizeLabPath(input.path);
      const files = await sandbox.fs.listFiles(path);
      return files.map((file) => toFileEntry(path, file));
    },
    async read(input) {
      const sandbox = await getSandbox(input.sandboxId);
      const contents = await sandbox.fs.downloadFile(normalizeLabPath(input.path));
      return contents.toString("utf8");
    },
    async write(input) {
      const sandbox = await getSandbox(input.sandboxId);
      const path = normalizeLabPath(input.path);
      await sandbox.process.executeCommand(`mkdir -p ${shellQuote(dirname(path))}`);
      await sandbox.fs.uploadFile(Buffer.from(input.content, "utf8"), path);
    },
    async createFile(input) {
      const sandbox = await getSandbox(input.sandboxId);
      const path = normalizeLabPath(input.path);
      await sandbox.process.executeCommand(`mkdir -p ${shellQuote(dirname(path))}`);
      await sandbox.fs.uploadFile(Buffer.from(input.content ?? "", "utf8"), path);
    },
    async rename(input) {
      const sandbox = await getSandbox(input.sandboxId);
      await sandbox.fs.moveFiles(
        normalizeLabPath(input.oldPath),
        normalizeLabPath(input.newPath),
      );
    },
    async delete(input) {
      const sandbox = await getSandbox(input.sandboxId);
      await sandbox.fs.deleteFile(normalizeLabPath(input.path), input.recursive);
    },
    async search(input) {
      const sandbox = await getSandbox(input.sandboxId);
      const matches = await sandbox.fs.findFiles(
        normalizeLabPath(input.path),
        input.query,
      );
      return matches.map(toSearchMatch);
    },
    async runCommand(input) {
      const sandbox = await getSandbox(input.sandboxId);
      const response = await sandbox.process.executeCommand(
        input.command,
        input.cwd,
        undefined,
        input.timeoutSec,
      );
      return {
        command: input.command,
        cwd: input.cwd,
        exitCode: response.exitCode,
        stdout: response.artifacts?.stdout ?? response.result,
        stderr: "",
        output: response.result,
      };
    },
    async createSession(input) {
      const sandbox = await getSandbox(input.sandboxId);
      await sandbox.process.createSession(input.sessionId);
      return { sessionId: input.sessionId };
    },
    async runSessionCommand(input) {
      const sandbox = await getSandbox(input.sandboxId);
      const response = await sandbox.process.executeSessionCommand(
        input.sessionId,
        { command: input.command },
        input.timeoutSec,
      );
      return {
        command: input.command,
        commandId: response.cmdId,
        exitCode: response.exitCode,
        stdout: response.stdout,
        stderr: response.stderr,
        output: response.output,
      };
    },
    async createPty(input) {
      const sandbox = await getSandbox(input.sandboxId);
      const chunks: string[] = [];
      const handle = await sandbox.process.createPty({
        id: input.ptyId,
        cwd: input.cwd,
        cols: input.cols,
        rows: input.rows,
        onData: (data) => {
          chunks.push(new TextDecoder().decode(data));
        },
      });
      await handle.waitForConnection();
      await handle.disconnect();
      return {
        ptyId: input.ptyId,
        initialOutput: chunks.join("").slice(0, 4000),
      };
    },
    async getPreview(input) {
      const sandbox = await getSandbox(input.sandboxId);
      if (input.signed) {
        const preview = await sandbox.getSignedPreviewUrl(input.port, 60 * 15);
        return {
          port: input.port,
          url: preview.url,
          token: preview.token,
        };
      }
      const preview = await sandbox.getPreviewLink(input.port);
      return {
        port: input.port,
        url: preview.url,
        token: preview.token,
      };
    },
    async archive(input) {
      const sandbox = await getSandbox(input.sandboxId);
      if (sandbox.state === "started") {
        await sandbox.stop(60);
      }
      await sandbox.archive();
    },
  };
}
