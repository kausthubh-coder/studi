import { convexTest } from "convex-test";
import { register as registerAgent } from "@convex-dev/agent/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import type { FunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const testApi = api as unknown as {
  codeSparks: {
    upsertSessionFromArtifact: FunctionReference<"mutation", "public">;
    getSessionForSpark: FunctionReference<"query", "public">;
    writeFile: FunctionReference<"mutation", "public">;
  };
  codeSparkActions: {
    run: FunctionReference<"action", "public">;
  };
};

const testInternal = internal as unknown as {
  codeSparks: {
    getRuntimeSessionForSparkInternal: FunctionReference<"query", "internal">;
    recordRunResultInternal: FunctionReference<"mutation", "internal">;
  };
};

const removedPublicRecordRunResult =
  "codeSparks:recordRunResult" as unknown as FunctionReference<
    "mutation",
    "public"
  >;

const oldArbitraryCommandRun =
  "codeSparks:run" as unknown as FunctionReference<"action", "public">;

function testConvex() {
  const t = convexTest(schema, modules);
  registerAgent(t);
  registerRateLimiter(t);
  return t;
}

async function createOwnedThread(t: ReturnType<typeof testConvex>) {
  const agentThread = await t.mutation(components.agent.threads.createThread, {
    userId: "user_a",
    title: "Code Spark thread",
  });
  await t.mutation(internal.chat.createThreadRecord, {
    userId: "user_a",
    threadId: agentThread._id,
    title: "Code Spark thread",
    lastMessageAt: 1,
  });
  return agentThread._id;
}

describe("Code Spark Convex persistence", () => {
  it("persists and hydrates a Code Spark attached to a thread", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    const created = await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Add numbers",
      mode: "challenge",
      language: "typescript",
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      runCommand: "node tests/add.check.ts",
      testCommand: "node tests/add.check.ts",
      files: [
        {
          path: "src/add.ts",
          language: "typescript",
          contents: "export const add = () => 0;",
          editable: true,
          role: "starter",
        },
      ],
      tests: [
        {
          id: "visible",
          label: "adds visible values",
          command: "node tests/add.check.ts",
          hidden: false,
        },
      ],
    });

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "spark_1",
    });
    const runtimeHydrated = await t.query(
      testInternal.codeSparks.getRuntimeSessionForSparkInternal,
      {
        userId: "user_a",
        threadId,
        sparkId: "spark_1",
      },
    );

    expect(hydrated?.sessionId).toEqual(created.sessionId);
    expect(hydrated?.files).toHaveLength(1);
    expect(hydrated?.hiddenTestCount).toBe(0);
    expect(runtimeHydrated?.files).toHaveLength(1);
    expect(runtimeHydrated?.checks).toEqual([
      {
        id: "visible",
        label: "adds visible values",
        command: "node tests/add.check.ts",
        hidden: false,
      },
    ]);
    expect(runtimeHydrated?.recentRunCount).toBe(0);
  });

  it("rejects client-supplied hidden checks and hidden test files", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        threadId,
        messageId: "message_1",
        sparkId: "spark_1",
        title: "Secret check attempt",
        mode: "challenge",
        language: "typescript",
        provider: "local_fake",
        providerStatus: "test_only",
        activePath: "src/add.ts",
        runCommand: "node tests/add.check.ts",
        testCommand: "node tests/add.check.ts",
        files: [
          {
            path: "src/add.ts",
            language: "typescript",
            contents: "export const add = () => 0;",
            editable: true,
            role: "starter",
          },
          {
            path: "tests/secret.check.ts",
            language: "typescript",
            contents: "console.log('SECRET_HIDDEN_SOURCE')",
            editable: false,
            role: "hidden_test",
          },
        ],
        tests: [
          {
            id: "secret",
            label: "secret check",
            command: "node tests/secret.check.ts",
            hidden: true,
          },
        ],
      }),
    ).rejects.toThrow("visible check");
  });

  it("records provider-unavailable runs without losing editable files", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Python print",
      mode: "workspace",
      language: "python",
      provider: "unavailable",
      providerStatus: "unavailable",
      activePath: "main.py",
      runCommand: "python3 main.py",
      testCommand: "python3 main.py",
      files: [
        {
          path: "main.py",
          language: "python",
          contents: "print('hi')",
          editable: true,
          role: "starter",
        },
      ],
      tests: [],
    });

    await authed.mutation(testApi.codeSparks.writeFile, {
      threadId,
      sparkId: "spark_1",
      path: "main.py",
      contents: "print('saved draft')",
    });

    await t.mutation(testInternal.codeSparks.recordRunResultInternal, {
      userId: "user_a",
      threadId,
      sparkId: "spark_1",
      kind: "run",
      provider: "unavailable",
      status: "unavailable",
      command: "python3 main.py",
      stdout: "",
      stderr: "Set CODE_SPARK_PROVIDER=vercel_sandbox.",
      timedOut: false,
      durationMs: 0,
    });

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "spark_1",
    });

    expect(hydrated?.files[0]?.contents).toBe("print('saved draft')");
    expect(hydrated?.lastRun).toMatchObject({
      status: "unavailable",
      provider: "unavailable",
    });
  });

  it("does not overwrite persisted learner edits when the artifact remounts", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });
    const seedArgs = {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Add numbers",
      mode: "challenge" as const,
      language: "typescript" as const,
      provider: "local_fake" as const,
      providerStatus: "test_only" as const,
      activePath: "src/add.ts",
      runCommand: "node tests/add.check.ts",
      testCommand: "node tests/add.check.ts",
      files: [
        {
          path: "src/add.ts",
          language: "typescript" as const,
          contents: "export const add = () => 0;",
          editable: true,
          role: "starter" as const,
        },
      ],
      tests: [],
    };

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, seedArgs);
    await authed.mutation(testApi.codeSparks.writeFile, {
      threadId,
      sparkId: "spark_1",
      path: "src/add.ts",
      contents: "export const add = () => 5;",
    });
    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, seedArgs);

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "spark_1",
    });

    expect(hydrated?.files[0]?.contents).toBe("export const add = () => 5;");
  });

  it("does not let public re-upsert rewrite executable metadata", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Add numbers",
      mode: "challenge",
      language: "typescript",
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      runCommand: "node tests/add.check.ts",
      testCommand: "node tests/add.check.ts",
      files: [
        {
          path: "src/add.ts",
          language: "typescript",
          contents:
            "export function add(a: number, b: number) { return a + b; }",
          editable: true,
          role: "starter",
        },
      ],
      tests: [
        {
          id: "visible",
          label: "visible edge check",
          command: "node tests/add.check.ts",
          hidden: false,
        },
      ],
    });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Add numbers remounted",
      mode: "challenge",
      language: "typescript",
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      runCommand: "node tests/leak.check.ts",
      testCommand: "node tests/leak.check.ts",
      files: [
        {
          path: "src/add.ts",
          language: "typescript",
          contents:
            "export function add(a: number, b: number) { return 0; }",
          editable: true,
          role: "starter",
        },
        {
          path: "tests/visible.check.ts",
          language: "typescript",
          contents: "console.log('late visible check')",
          editable: false,
          role: "test",
        },
      ],
      tests: [
        {
          id: "late",
          label: "late visible check",
          command: "node tests/visible.check.ts",
          hidden: false,
        },
      ],
    });

    const runtimeHydrated = await t.query(
      testInternal.codeSparks.getRuntimeSessionForSparkInternal,
      {
        userId: "user_a",
        threadId,
        sparkId: "spark_1",
      },
    );

    expect(runtimeHydrated?.runCommand).toBe("node tests/add.check.ts");
    expect(runtimeHydrated?.testCommand).toBe("node tests/add.check.ts");
    expect(runtimeHydrated?.checks).toEqual([
      {
        id: "visible",
        label: "visible edge check",
        command: "node tests/add.check.ts",
        hidden: false,
      },
    ]);
    expect(
      runtimeHydrated?.files
        .map((file: { path: string }) => file.path)
        .sort(),
    ).toEqual([
      "src/add.ts",
    ]);
    expect(JSON.stringify(runtimeHydrated)).not.toContain("LATE_HIDDEN_SOURCE");

    const runResult = await authed.action(testApi.codeSparkActions.run, {
      threadId,
      sparkId: "spark_1",
      mode: "run",
    });
    const testResult = await authed.action(testApi.codeSparkActions.run, {
      threadId,
      sparkId: "spark_1",
      mode: "test",
    });

    expect(runResult.status).toBe("passed");
    expect(testResult.status).toBe("passed");
    expect(runResult.stdout).not.toContain("LATE_HIDDEN_SOURCE");
    expect(testResult.stdout).not.toContain("LATE_HIDDEN_SOURCE");
  });

  it("does not expose a public mutation that can forge run records", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);

    await expect(
      t.withIdentity({ subject: "user_a" }).mutation(removedPublicRecordRunResult, {
        threadId,
        sparkId: "spark_1",
        kind: "run",
        provider: "local_fake",
        status: "passed",
        stdout: "forged",
        stderr: "",
        timedOut: false,
      }),
    ).rejects.toThrow();
  });

  it("rejects client-supplied shell commands and still runs stored modes", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        threadId,
        messageId: "message_1",
        sparkId: "spark_bad",
        title: "Bad command",
        mode: "challenge",
        language: "typescript",
        provider: "local_fake",
        providerStatus: "test_only",
        activePath: "src/add.ts",
        runCommand: "node -e \"console.log('leak')\"",
        testCommand: "node tests/add.check.ts",
        files: [
          {
            path: "src/add.ts",
            language: "typescript",
            contents: "export const add = () => 0;",
            editable: true,
            role: "starter",
          },
        ],
        tests: [],
      }),
    ).rejects.toThrow("Code Spark command is not allowlisted");

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Safe command",
      mode: "challenge",
      language: "typescript",
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      runCommand: "node tests/add.check.ts",
      testCommand: "node tests/add.check.ts",
      files: [
        {
          path: "src/add.ts",
          language: "typescript",
          contents: "export function add(a: number, b: number) { return a + b; }",
          editable: true,
          role: "starter",
        },
      ],
      tests: [
        {
          id: "visible",
          label: "adds visible values",
          command: "node tests/add.check.ts",
          hidden: false,
        },
      ],
    });

    await expect(
      authed.action(oldArbitraryCommandRun, {
        threadId,
        sparkId: "spark_1",
        kind: "run",
        command: "node -e \"console.log(require('fs').readFileSync('tests/hidden.check.ts','utf8'))\"",
      }),
    ).rejects.toThrow();

    const result = await authed.action(testApi.codeSparkActions.run, {
      threadId,
      sparkId: "spark_1",
      mode: "run",
    });

    expect(result.status).toBe("passed");

    const testResult = await authed.action(testApi.codeSparkActions.run, {
      threadId,
      sparkId: "spark_1",
      mode: "test",
    });

    expect(testResult.status).toBe("passed");
  });

  it("rate-limits rapid repeated provider runs per session", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Safe command",
      mode: "challenge",
      language: "typescript",
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      runCommand: "node tests/add.check.ts",
      testCommand: "node tests/add.check.ts",
      files: [
        {
          path: "src/add.ts",
          language: "typescript",
          contents: "export function add(a: number, b: number) { return a + b; }",
          editable: true,
          role: "starter",
        },
      ],
      tests: [
        {
          id: "visible",
          label: "adds visible values",
          command: "node tests/add.check.ts",
          hidden: false,
        },
      ],
    });

    for (let index = 0; index < 3; index += 1) {
      await t.mutation(testInternal.codeSparks.recordRunResultInternal, {
        userId: "user_a",
        threadId,
        sparkId: "spark_1",
        kind: "run",
        provider: "local_fake",
        status: "passed",
        command: "node tests/add.check.ts",
        stdout: "ok",
        stderr: "",
        timedOut: false,
        durationMs: 1,
      });
    }

    await expect(
      authed.action(testApi.codeSparkActions.run, {
        threadId,
        sparkId: "spark_1",
        mode: "run",
      }),
    ).rejects.toThrow("run limit");
  });

  it("enforces thread ownership", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);

    await expect(
      t.withIdentity({ subject: "user_b" }).query(testApi.codeSparks.getSessionForSpark, {
        threadId,
        sparkId: "spark_1",
      }),
    ).rejects.toThrow("Thread not found");
  });
});
