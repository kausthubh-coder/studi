import type {
  LabRuntimeCommandResult,
  LabRuntimeCreateInput,
  LabRuntimeFileEntry,
  LabRuntimeProvider,
  LabRuntimeSearchMatch,
  LabRuntimeSession,
} from "./runtime";
import { makeLabSessionName, normalizeLabPath } from "./runtime";

type MockSandbox = {
  session: LabRuntimeSession;
  files: Map<string, string>;
};

function parentPaths(path: string) {
  const parts = normalizeLabPath(path).split("/");
  const parents: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    parents.push(parts.slice(0, index).join("/"));
  }
  return parents;
}

export function createMockLabRuntimeProvider(): LabRuntimeProvider {
  const sandboxes = new Map<string, MockSandbox>();

  function getSandbox(sandboxId: string) {
    const sandbox = sandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Mock lab sandbox not found: ${sandboxId}`);
    }
    return sandbox;
  }

  function ensureParents(sandbox: MockSandbox, path: string) {
    for (const parent of parentPaths(path)) {
      if (!sandbox.files.has(parent)) {
        sandbox.files.set(parent, "");
      }
    }
  }

  return {
    async create(input: LabRuntimeCreateInput) {
      const sandboxId = makeLabSessionName(input.title);
      const session: LabRuntimeSession = {
        provider: "daytona",
        sandboxId,
        workspacePath: "/workspace",
        status: "ready",
        previewUrls: [],
      };
      sandboxes.set(sandboxId, {
        session,
        files: new Map([[".", ""]]),
      });
      return session;
    },
    async resume(input) {
      return getSandbox(input.sandboxId).session;
    },
    async list(input) {
      const sandbox = getSandbox(input.sandboxId);
      const dir = normalizeLabPath(input.path);
      const prefix = dir === "." ? "" : `${dir}/`;
      const entries = new Map<string, LabRuntimeFileEntry>();

      for (const [path, content] of sandbox.files) {
        if (path === dir || !path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        const [name, ...remaining] = rest.split("/");
        if (!name) continue;
        const entryPath = prefix ? `${prefix}${name}` : name;
        entries.set(entryPath, {
          path: entryPath,
          name,
          type: remaining.length > 0 || content === "" ? "directory" : "file",
          size: remaining.length > 0 || content === "" ? undefined : content.length,
        });
      }

      return [...entries.values()].sort((a, b) => a.path.localeCompare(b.path));
    },
    async read(input) {
      const sandbox = getSandbox(input.sandboxId);
      const path = normalizeLabPath(input.path);
      const content = sandbox.files.get(path);
      if (content === undefined) throw new Error(`Mock file not found: ${path}`);
      return content;
    },
    async write(input) {
      const sandbox = getSandbox(input.sandboxId);
      const path = normalizeLabPath(input.path);
      ensureParents(sandbox, path);
      sandbox.files.set(path, input.content);
    },
    async createFile(input) {
      const sandbox = getSandbox(input.sandboxId);
      const path = normalizeLabPath(input.path);
      ensureParents(sandbox, path);
      sandbox.files.set(path, input.content ?? "");
    },
    async rename(input) {
      const sandbox = getSandbox(input.sandboxId);
      const oldPath = normalizeLabPath(input.oldPath);
      const newPath = normalizeLabPath(input.newPath);
      const content = sandbox.files.get(oldPath);
      if (content === undefined) throw new Error(`Mock file not found: ${oldPath}`);
      sandbox.files.delete(oldPath);
      ensureParents(sandbox, newPath);
      sandbox.files.set(newPath, content);
    },
    async delete(input) {
      const sandbox = getSandbox(input.sandboxId);
      const path = normalizeLabPath(input.path);
      sandbox.files.delete(path);
      if (input.recursive) {
        for (const existingPath of [...sandbox.files.keys()]) {
          if (existingPath.startsWith(`${path}/`)) sandbox.files.delete(existingPath);
        }
      }
    },
    async search(input) {
      const sandbox = getSandbox(input.sandboxId);
      const root = normalizeLabPath(input.path);
      const matches: LabRuntimeSearchMatch[] = [];
      for (const [path, content] of sandbox.files) {
        if (content === "" || (root !== "." && !path.startsWith(root))) continue;
        content.split("\n").forEach((line, index) => {
          if (line.includes(input.query)) {
            matches.push({ path, line: index + 1, content: line });
          }
        });
      }
      return matches;
    },
    async runCommand(input) {
      const result: LabRuntimeCommandResult = {
        command: input.command,
        cwd: input.cwd,
        exitCode: 0,
        stdout: `mock: ${input.command}`,
        stderr: "",
        output: `mock: ${input.command}`,
      };
      return result;
    },
    async createSession(input) {
      getSandbox(input.sandboxId);
      return { sessionId: input.sessionId };
    },
    async runSessionCommand(input) {
      const result = await this.runCommand(input);
      return { ...result, commandId: `cmd-${Date.now()}` };
    },
    async createPty(input) {
      getSandbox(input.sandboxId);
      return { ptyId: input.ptyId, initialOutput: "" };
    },
    async getPreview(input) {
      getSandbox(input.sandboxId);
      return {
        port: input.port,
        url: `https://preview.example/${input.sandboxId}/${input.port}`,
      };
    },
    async archive(input) {
      const sandbox = getSandbox(input.sandboxId);
      sandbox.session = { ...sandbox.session, status: "archived" };
    },
  };
}
