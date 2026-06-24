import { register as registerAgent } from "@convex-dev/agent/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { __setLabRuntimeProviderForTesting } from "./labActions";
import schema from "./schema";
import { modules } from "./test.setup";
import type { LabRuntimeProvider } from "../lib/labs/runtime";

function testConvex() {
  const t = convexTest(schema, modules);
  registerAgent(t);
  registerRateLimiter(t);
  return t;
}

describe("lab session Convex ownership", () => {
  it("preflights thread ownership before provider work", async () => {
    const t = testConvex();

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Derivatives",
      lastMessageAt: 1,
    });

    await expect(
      t.query(internal.labs.assertThreadOwnerInternal, {
        userId: "user_a",
        threadId: "thread_a",
      }),
    ).resolves.toBeNull();

    await expect(
      t.query(internal.labs.assertThreadOwnerInternal, {
        userId: "user_b",
        threadId: "thread_a",
      }),
    ).rejects.toThrow("Thread not found");
  });

  it("materializes a code spark through the lab runtime with ownership and mocks", async () => {
    const t = testConvex();
    const writes: Array<{ path: string; content: string }> = [];
    const commands: Array<{ command: string; cwd?: string }> = [];
    const provider: LabRuntimeProvider = {
      async create() {
        return {
          provider: "daytona",
          sandboxId: "sandbox_code_spark",
          workspacePath: "/workspace",
          status: "ready",
          previewUrls: [],
        };
      },
      async resume() {
        return {
          provider: "daytona",
          sandboxId: "sandbox_code_spark",
          workspacePath: "/workspace",
          status: "ready",
          previewUrls: [],
        };
      },
      async list() {
        return [];
      },
      async read() {
        return "";
      },
      async write(input) {
        writes.push({ path: input.path, content: input.content });
      },
      async createFile() {},
      async rename() {},
      async delete() {},
      async search() {
        return [];
      },
      async runCommand(input) {
        commands.push({ command: input.command, cwd: input.cwd });
        return {
          command: input.command,
          cwd: input.cwd,
          exitCode: 0,
          stdout: "42\n",
          stderr: "",
          output: "42\n",
        };
      },
      async createSession(input) {
        return { sessionId: input.sessionId };
      },
      async runSessionCommand(input) {
        return { command: input.command, commandId: "cmd_1", exitCode: 0 };
      },
      async createPty(input) {
        return { ptyId: input.ptyId };
      },
      async getPreview(input) {
        return {
          port: input.port,
          url: `https://preview.example/${input.port}`,
        };
      },
      async archive() {},
    };
    __setLabRuntimeProviderForTesting(provider);

    try {
      await t.mutation(internal.chat.createThreadRecord, {
        userId: "user_a",
        threadId: "thread_a",
        title: "Code",
        lastMessageAt: 1,
      });
      await t.mutation(internal.billing.syncBillingProfileInternal, {
        userId: "user_a",
        planKey: "intro",
        status: "active",
      });

      const authed = t.withIdentity({ subject: "user_a" });
      const result = await authed.action(api.labActions.materializeCodeSpark, {
        threadId: "thread_a",
        sparkInstanceId: "spark-a",
        sparkTitle: "Answer lab",
        language: "python",
        files: [{ path: "main.py", content: "print(42)\n" }],
        primaryFile: "main.py",
        runCommand: "python main.py",
        previewPort: 3000,
      });

      expect(result).toMatchObject({
        status: "success",
        reusedLab: false,
        command: "python main.py",
        preview: { url: "https://preview.example/3000" },
      });
      expect(writes).toEqual([
        {
          path: "code-sparks/spark-a/main.py",
          content: "print(42)\n",
        },
      ]);
      expect(commands).toEqual([
        { command: "python main.py", cwd: "code-sparks/spark-a" },
      ]);

      await expect(
        authed.query(api.sparkFeedback.getCodeSparkState, {
          threadId: "thread_a",
          sparkInstanceId: "spark-a",
        }),
      ).resolves.toMatchObject({
        lastStatus: "success",
        lastStdout: "42\n",
        lastRunCommand: "python main.py",
        labPreviewUrl: "https://preview.example/3000",
      });

      const writeCountAfterSuccess = writes.length;
      const escapedPathResult = await authed.action(
        api.labActions.materializeCodeSpark,
        {
          threadId: "thread_a",
          sparkInstanceId: "spark-escape",
          language: "python",
          files: [{ path: "../outside.py", content: "print(0)\n" }],
          primaryFile: "../outside.py",
          runCommand: "python outside.py",
        },
      );
      expect(escapedPathResult).toMatchObject({
        status: "error",
        error: "Lab paths must stay within the workspace",
      });
      expect(writes).toHaveLength(writeCountAfterSuccess);

      await expect(
        t.withIdentity({ subject: "user_b" }).action(
          api.labActions.materializeCodeSpark,
          {
            threadId: "thread_a",
            sparkInstanceId: "spark-b",
            language: "python",
            files: [{ path: "main.py", content: "print(0)\n" }],
            primaryFile: "main.py",
            runCommand: "python main.py",
          },
        ),
      ).rejects.toThrow("Thread not found");
    } finally {
      __setLabRuntimeProviderForTesting(null);
    }
  });

  it("stores and lists lab sessions only for the owning thread", async () => {
    const t = testConvex();

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Derivatives",
      lastMessageAt: 1,
    });
    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_b",
      threadId: "thread_b",
      title: "Integrals",
      lastMessageAt: 1,
    });

    const session = await t.mutation(internal.labs.createLabSessionInternal, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Slope lab",
      provider: "daytona",
      sandboxId: "sandbox_a",
      workspacePath: "/workspace",
      language: "python",
      status: "ready",
      previewUrls: [],
    });

    const authed = t.withIdentity({ subject: "user_a" });
    await expect(
      authed.query(api.labs.listLabSessions, {
        threadId: "thread_a",
      }),
    ).resolves.toMatchObject([
      {
        _id: session._id,
        sandboxId: "sandbox_a",
        workspacePath: "/workspace",
      },
    ]);

    await expect(
      t.withIdentity({ subject: "user_b" }).query(api.labs.getLabSession, {
        labSessionId: session._id,
      }),
    ).rejects.toThrow("Lab session not found");
  });

  it("records runtime errors and hides archived labs by default", async () => {
    const t = testConvex();

    await t.mutation(internal.chat.createThreadRecord, {
      userId: "user_a",
      threadId: "thread_a",
      title: "Thread",
      lastMessageAt: 1,
    });

    const session = await t.mutation(internal.labs.createLabSessionInternal, {
      userId: "user_a",
      threadId: "thread_a",
      provider: "daytona",
      sandboxId: "sandbox_a",
      workspacePath: "/workspace",
      status: "ready",
    });

    await t.mutation(internal.labs.recordLabErrorInternal, {
      userId: "user_a",
      labSessionId: session._id,
      message: "provider timeout",
      category: "timeout",
      retriable: true,
    });

    await expect(
      t.withIdentity({ subject: "user_a" }).query(api.labs.getLabSession, {
        labSessionId: session._id,
      }),
    ).resolves.toMatchObject({
      status: "error",
      lastError: {
        message: "provider timeout",
        category: "timeout",
        retriable: true,
      },
    });

    await t.mutation(internal.labs.archiveLabSessionInternal, {
      userId: "user_a",
      labSessionId: session._id,
    });

    await expect(
      t.withIdentity({ subject: "user_a" }).query(api.labs.listLabSessions, {
        threadId: "thread_a",
      }),
    ).resolves.toEqual([]);

    await expect(
      t.withIdentity({ subject: "user_a" }).query(api.labs.listLabSessions, {
        threadId: "thread_a",
        includeArchived: true,
      }),
    ).resolves.toHaveLength(1);
  });
});
