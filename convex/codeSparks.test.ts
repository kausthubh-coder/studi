import { convexTest } from "convex-test";
import { register as registerAgent } from "@convex-dev/agent/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  billing: {
    incrementFreeOnboardingUsageInternal: FunctionReference<
      "mutation",
      "internal"
    >;
  };
  codeSparks: {
    getRuntimeSessionForSparkInternal: FunctionReference<"query", "internal">;
    recordRunResultInternal: FunctionReference<"mutation", "internal">;
    reserveRunInternal: FunctionReference<"mutation", "internal">;
    finalizeRunReservationInternal: FunctionReference<"mutation", "internal">;
    cleanupOperationalDataInternal: FunctionReference<"mutation", "internal">;
    persistGeneratedSessionInternal: FunctionReference<"mutation", "internal">;
  };
  chat: {
    deleteThreadRecordInternal: FunctionReference<"mutation", "internal">;
  };
};

const removedPublicRecordRunResult =
  "codeSparks:recordRunResult" as unknown as FunctionReference<
    "mutation",
    "public"
  >;

const oldArbitraryCommandRun = "codeSparks:run" as unknown as FunctionReference<
  "action",
  "public"
>;

function setLocalFakeRuntimeEnv() {
  vi.stubEnv("CODE_SPARK_PROVIDER", "local_fake");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubEnv("VERCEL_TOKEN", "");
  vi.stubEnv("VERCEL_TEAM_ID", "");
  vi.stubEnv("VERCEL_PROJECT_ID", "");
}

function setVercelSandboxWithoutAuthEnv() {
  vi.stubEnv("CODE_SPARK_PROVIDER", "vercel_sandbox");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "");
  vi.stubEnv("VERCEL_TOKEN", "");
  vi.stubEnv("VERCEL_TEAM_ID", "");
  vi.stubEnv("VERCEL_PROJECT_ID", "");
}

function setDefaultRuntimeEnv() {
  if (process.env.CODE_SPARK_PROVIDER === "vercel_sandbox") {
    return;
  }
  setLocalFakeRuntimeEnv();
}

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

function pythonArtifactArgs(threadId: string, sparkId: string) {
  return {
    threadId,
    messageId: `message_${sparkId}`,
    sparkId,
    title: "Return a value",
    mode: "challenge" as const,
    language: "python" as const,
    provider: "local_fake" as const,
    providerStatus: "test_only" as const,
    activePath: "main.py",
    runCommand: "python3 main.py",
    testCommand: "python3 tests/answer.check.py",
    files: [
      {
        path: "main.py",
        language: "python" as const,
        contents: "def answer():\n    return None\n",
        editable: true,
        role: "starter" as const,
      },
      {
        path: "tests/answer.check.py",
        language: "python" as const,
        contents:
          "from main import answer\nif answer() is None:\n    raise AssertionError('Expected a value')\n",
        editable: false,
        role: "test" as const,
      },
    ],
    tests: [
      {
        id: "visible-answer",
        label: "answer() returns a concrete value",
        command: "python3 tests/answer.check.py",
        hidden: false,
      },
    ],
  };
}

function publicPythonArtifactArgs(threadId: string, sparkId: string) {
  const artifact = pythonArtifactArgs(threadId, sparkId);
  return {
    ...artifact,
    files: artifact.files.filter((file) => file.role === "starter"),
  };
}

describe("Code Spark Convex persistence", () => {
  beforeEach(() => {
    setDefaultRuntimeEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("persists and hydrates a Code Spark attached to a thread", async () => {
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

    expect(hydrated?.sessionId).toBeUndefined();
    expect(hydrated?.files).toHaveLength(1);
    expect(hydrated?.tests).toEqual([
      {
        id: "visible",
        label: "adds visible values",
        hidden: false,
      },
    ]);
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

  it("projects challenge sessions without test files, internal commands, or raw persisted output", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await t.mutation(testInternal.codeSparks.persistGeneratedSessionInternal, {
      userId: "user_a",
      ...pythonArtifactArgs(threadId, "challenge_projection"),
    });
    await t.mutation(testInternal.codeSparks.recordRunResultInternal, {
      userId: "user_a",
      threadId,
      sparkId: "challenge_projection",
      kind: "test",
      provider: "local_fake",
      status: "failed",
      command: "python3 tests/answer.check.py",
      stdout: "LEAKED_ANSWER=42 from tests/answer.check.py",
      stderr:
        "Traceback: /vercel/sandbox/tests/answer.check.py expected answer 42",
      exitCode: 1,
      timedOut: false,
      durationMs: 5,
    });

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "challenge_projection",
    });

    expect(hydrated?.files.map((file: { path: string }) => file.path)).toEqual([
      "main.py",
    ]);
    expect(hydrated?.tests).toEqual([
      {
        id: "visible-answer",
        label: "answer() returns a concrete value",
        hidden: false,
      },
    ]);
    expect(hydrated?.runCommand).toBeUndefined();
    expect(hydrated?.testCommand).toBeUndefined();
    expect(hydrated?.lastRun).toEqual({
      kind: "test",
      provider: "local_fake",
      status: "failed",
      reason: "Check failed. Review your code and try again.",
    });
    expect(hydrated?.lastRun?.provider).toBe("local_fake");
    expect(hydrated?.lastRun?.command).toBeUndefined();
    expect(hydrated?.lastRun?.exitCode).toBeUndefined();
    expect(hydrated?.lastRun?.durationMs).toBeUndefined();
    expect(hydrated?.lastRun?.timedOut).toBeUndefined();
    expect(JSON.stringify(hydrated)).not.toMatch(
      /LEAKED_ANSWER|answer\.check|\/vercel\/sandbox|expected answer 42/,
    );
  });

  it("persists learner-program output with provider attestation but without commands or test internals", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await t.mutation(testInternal.codeSparks.persistGeneratedSessionInternal, {
      userId: "user_a",
      ...pythonArtifactArgs(threadId, "challenge_terminal"),
    });
    await t.mutation(testInternal.codeSparks.recordRunResultInternal, {
      userId: "user_a",
      threadId,
      sparkId: "challenge_terminal",
      kind: "run",
      provider: "vercel_sandbox",
      status: "passed",
      command: "python3 main.py",
      stdout: "learner output\n",
      stderr: "",
      exitCode: 0,
      timedOut: false,
      durationMs: 8,
    });

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "challenge_terminal",
    });

    expect(hydrated?.lastRun).toEqual({
      kind: "run",
      provider: "vercel_sandbox",
      status: "passed",
      stdout: "learner output\n",
      stderr: "",
      exitCode: 0,
      durationMs: 8,
      timedOut: false,
      reason: "Program finished.",
    });
    expect(JSON.stringify(hydrated?.lastRun)).not.toMatch(
      /python3 main\.py|answer\.check/,
    );
  });

  it("projects only editable learner files with a valid active path and no private linkage", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });
    const args = pythonArtifactArgs(threadId, "strict_challenge_projection");

    const created = await t.mutation(
      testInternal.codeSparks.persistGeneratedSessionInternal,
      {
        userId: "user_a",
        ...args,
        activePath: "tests/answer.check.py",
        files: [
          args.files[0],
          {
            path: "learner.json",
            language: "python" as const,
            contents: "{}",
            editable: true,
            role: "config" as const,
          },
          {
            path: "README.md",
            language: "python" as const,
            contents: "Private teacher notes",
            editable: false,
            role: "readme" as const,
          },
          {
            path: "solutions/answer.py",
            language: "python" as const,
            contents: "def answer(): return 42",
            editable: true,
            role: "solution" as const,
          },
          args.files[1],
        ],
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(created.sessionId, {
        providerSessionId: "provider-private-id",
        providerSnapshotId: "snapshot-private-id",
      });
    });

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "strict_challenge_projection",
    });

    expect(hydrated?.files.map((file: { path: string }) => file.path)).toEqual([
      "main.py",
      "learner.json",
    ]);
    expect(
      hydrated?.files.every((file: { editable: boolean }) => file.editable),
    ).toBe(true);
    expect(hydrated?.activePath).toBe("main.py");
    expect(
      hydrated?.files.some(
        (file: { path: string }) => file.path === hydrated.activePath,
      ),
    ).toBe(true);
    expect(hydrated?.sessionId).toBeUndefined();
    expect(hydrated?.providerSessionId).toBeUndefined();
    expect(hydrated?.threadId).toBeUndefined();
    expect(hydrated?.messageId).toBeUndefined();
    expect(hydrated?.sparkId).toBeUndefined();
    expect(JSON.stringify(hydrated)).not.toMatch(
      /provider-private-id|snapshot-private-id|solutions\/answer|return 42|answer\.check|Private teacher notes/,
    );
  });

  it("fails closed when persisted challenge files use private paths with learner roles", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await t.mutation(testInternal.codeSparks.persistGeneratedSessionInternal, {
      userId: "user_a",
      threadId,
      messageId: "message_mislabeled_private",
      sparkId: "mislabeled_private",
      title: "Mislabeled private files",
      mode: "challenge",
      language: "typescript",
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "TESTS\\answer.CHECK.TS",
      runCommand: "node tests/answer.check.ts",
      testCommand: "node tests/answer.check.ts",
      files: [
        {
          path: "src/answer.ts",
          language: "typescript",
          contents: "export const answer = 0;",
          editable: true,
          role: "starter",
        },
        {
          path: "support/test-utils.ts",
          language: "typescript",
          contents: "export const helper = true;",
          editable: true,
          role: "starter",
        },
        {
          path: "solutions/answer.ts",
          language: "typescript",
          contents: "export const answer = 42;",
          editable: true,
          role: "starter",
        },
        {
          path: "TESTS\\answer.CHECK.TS",
          language: "typescript",
          contents: "if (answer !== 42) throw new Error('expected 42');",
          editable: true,
          role: "starter",
        },
      ],
      tests: [
        {
          id: "visible-answer",
          label: "answer is correct",
          command: "node tests/answer.check.ts",
          hidden: false,
        },
      ],
    });

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "mislabeled_private",
    });
    const runtimeHydrated = await t.query(
      testInternal.codeSparks.getRuntimeSessionForSparkInternal,
      {
        userId: "user_a",
        threadId,
        sparkId: "mislabeled_private",
      },
    );

    expect(hydrated?.files.map((file: { path: string }) => file.path)).toEqual([
      "src/answer.ts",
      "support/test-utils.ts",
    ]);
    expect(hydrated?.activePath).toBe("src/answer.ts");
    expect(JSON.stringify(hydrated)).not.toMatch(
      /solutions\/answer|answer\.check|expected 42/i,
    );
    expect(
      runtimeHydrated?.files.map((file: { path: string }) => file.path),
    ).toEqual(
      expect.arrayContaining([
        "src/answer.ts",
        "support/test-utils.ts",
        "solutions/answer.ts",
        "TESTS/answer.CHECK.TS",
      ]),
    );

    for (const path of ["solutions/answer.ts", "TESTS\\answer.CHECK.TS"]) {
      await expect(
        authed.mutation(testApi.codeSparks.writeFile, {
          threadId,
          sparkId: "mislabeled_private",
          path,
          contents: "learner overwrite",
        }),
      ).rejects.toThrow(/not editable/i);
    }

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        threadId,
        sparkId: "guessed_private_create",
        title: "Guessed private path",
        mode: "challenge",
        language: "typescript",
        provider: "local_fake",
        providerStatus: "test_only",
        activePath: "Tests/answer.check.ts",
        runCommand: "node tests/answer.check.ts",
        testCommand: "node tests/answer.check.ts",
        files: [
          {
            path: "Tests/answer.check.ts",
            language: "typescript",
            contents: "export const leaked = 42;",
            editable: true,
            role: "starter",
          },
        ],
        tests: [],
      }),
    ).rejects.toThrow(/private/i);

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        threadId,
        sparkId: "guessed_private_role",
        title: "Guessed private role",
        mode: "challenge",
        language: "typescript",
        provider: "local_fake",
        providerStatus: "test_only",
        activePath: "src/teacher.ts",
        runCommand: "node tests/answer.check.ts",
        testCommand: "node tests/answer.check.ts",
        files: [
          {
            path: "src/teacher.ts",
            language: "typescript",
            contents: "export const leaked = 42;",
            editable: true,
            role: "test",
          },
        ],
        tests: [],
      }),
    ).rejects.toThrow(/private/i);
  });

  it("persists generated challenge internals before accepting the redacted initial artifact", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });
    const internalArtifact = pythonArtifactArgs(threadId, "generated_private");

    await t.mutation(testInternal.codeSparks.persistGeneratedSessionInternal, {
      userId: "user_a",
      ...internalArtifact,
    });
    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      ...internalArtifact,
      runCommand: "",
      testCommand: "",
      files: internalArtifact.files.filter((file) => file.role !== "test"),
      tests: internalArtifact.tests.map((test) => ({
        id: test.id,
        label: test.label,
        command: "",
        hidden: test.hidden,
      })),
    });

    const runtime = await t.query(
      testInternal.codeSparks.getRuntimeSessionForSparkInternal,
      {
        userId: "user_a",
        threadId,
        sparkId: "generated_private",
      },
    );
    const publicSession = await authed.query(
      testApi.codeSparks.getSessionForSpark,
      {
        threadId,
        sparkId: "generated_private",
      },
    );

    expect(runtime?.testCommand).toBe("python3 tests/answer.check.py");
    expect(runtime?.files.map((file: { path: string }) => file.path)).toContain(
      "tests/answer.check.py",
    );
    expect(runtime?.checks[0]?.command).toBe("python3 tests/answer.check.py");
    expect(JSON.stringify(publicSession)).not.toContain("answer.check.py");
  });

  it("keeps workspace sessions inspectable through public hydration", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });
    const args = {
      ...pythonArtifactArgs(threadId, "workspace_projection"),
      mode: "workspace" as const,
    };

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, args);
    await t.mutation(testInternal.codeSparks.recordRunResultInternal, {
      userId: "user_a",
      threadId,
      sparkId: "workspace_projection",
      kind: "test",
      provider: "local_fake",
      status: "failed",
      command: "python3 tests/answer.check.py",
      stdout: "workspace raw stdout",
      stderr: "workspace raw stderr",
      exitCode: 1,
      timedOut: false,
      durationMs: 5,
    });

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "workspace_projection",
    });

    expect(
      hydrated?.files.map((file: { path: string }) => file.path),
    ).toContain("tests/answer.check.py");
    expect(hydrated?.runCommand).toBe("python3 main.py");
    expect(hydrated?.testCommand).toBe("python3 tests/answer.check.py");
    expect(hydrated?.tests[0]?.command).toBe("python3 tests/answer.check.py");
    expect(hydrated?.lastRun).toMatchObject({
      command: "python3 tests/answer.check.py",
      stdout: "workspace raw stdout",
      stderr: "workspace raw stderr",
    });
  });

  it("limits challenge writes to editable learner files while preserving workspace editing", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });
    const challenge = pythonArtifactArgs(threadId, "challenge_writes");

    await t.mutation(testInternal.codeSparks.persistGeneratedSessionInternal, {
      userId: "user_a",
      ...challenge,
      files: [
        challenge.files[0],
        {
          path: "learner.json",
          language: "python",
          contents: "{}",
          editable: true,
          role: "config",
        },
        {
          path: "solutions/answer.py",
          language: "python",
          contents: "def answer(): return 42",
          editable: true,
          role: "solution",
        },
        {
          ...challenge.files[1],
          editable: true,
        },
        {
          path: "private/answer.py",
          language: "python",
          contents: "def answer(): return 99",
          editable: true,
          role: "starter",
        },
      ],
    });

    await expect(
      authed.mutation(testApi.codeSparks.writeFile, {
        threadId,
        sparkId: "challenge_writes",
        path: "main.py",
        contents: "def answer(): return 7",
      }),
    ).resolves.toMatchObject({ version: 2 });
    await expect(
      authed.mutation(testApi.codeSparks.writeFile, {
        threadId,
        sparkId: "challenge_writes",
        path: "learner.json",
        contents: '{"hint": true}',
      }),
    ).resolves.toMatchObject({ version: 3 });

    for (const path of [
      "solutions/answer.py",
      "tests/answer.check.py",
      "private/answer.py",
    ]) {
      await expect(
        authed.mutation(testApi.codeSparks.writeFile, {
          threadId,
          sparkId: "challenge_writes",
          path,
          contents: "learner overwrite",
        }),
      ).rejects.toThrow(/not editable/i);
    }

    const workspace = {
      ...pythonArtifactArgs(threadId, "workspace_writes"),
      mode: "workspace" as const,
      files: [
        pythonArtifactArgs(threadId, "workspace_writes").files[0],
        {
          path: "tests/learner.test.py",
          language: "python" as const,
          contents: "assert True",
          editable: true,
          role: "test" as const,
        },
      ],
    };
    await t.mutation(testInternal.codeSparks.persistGeneratedSessionInternal, {
      userId: "user_a",
      ...workspace,
    });
    await expect(
      authed.mutation(testApi.codeSparks.writeFile, {
        threadId,
        sparkId: "workspace_writes",
        path: "tests/learner.test.py",
        contents: "assert 1 + 1 == 2",
      }),
    ).resolves.toMatchObject({ version: 2 });
  });

  it("rejects public creation of solution and explicitly private paths", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });
    const base = pythonArtifactArgs(threadId, "public_private_create");

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...base,
        activePath: "solutions/answer.py",
        files: [
          {
            ...base.files[0],
            path: "solutions/answer.py",
            role: "solution",
          },
        ],
      }),
    ).rejects.toThrow(/private/i);

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...base,
        sparkId: "public_private_path",
        activePath: "private/answer.py",
        files: [
          {
            ...base.files[0],
            path: "private/answer.py",
          },
        ],
      }),
    ).rejects.toThrow(/private/i);
  });

  it("rejects oversized files, metadata, visible checks, and edits", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });
    const base = publicPythonArtifactArgs(threadId, "payload_limits");

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...base,
        sparkId: "too_many_files",
        files: Array.from({ length: 9 }, (_, index) => ({
          ...base.files[0],
          path: `src/file_${index}.py`,
        })),
      }),
    ).rejects.toThrow(/at most 8 files/i);

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...base,
        sparkId: "path_too_long",
        activePath: `${"a".repeat(181)}.py`,
        files: [
          {
            ...base.files[0],
            path: `${"a".repeat(181)}.py`,
          },
        ],
        tests: [],
      }),
    ).rejects.toThrow(/path.*180 bytes/i);

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...base,
        sparkId: "content_too_large",
        files: [
          {
            ...base.files[0],
            contents: "x".repeat(20_001),
          },
        ],
        tests: [],
      }),
    ).rejects.toThrow(/file.*20,000 bytes/i);

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...base,
        sparkId: "aggregate_too_large",
        files: Array.from({ length: 4 }, (_, index) => ({
          ...base.files[0],
          path: `src/aggregate_${index}.py`,
          contents: "x".repeat(17_000),
        })),
        tests: [],
      }),
    ).rejects.toThrow(/aggregate.*64,000 bytes/i);

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...base,
        sparkId: "too_many_checks",
        tests: Array.from({ length: 13 }, (_, index) => ({
          id: `check_${index}`,
          label: `Visible check ${index}`,
          command: "python3 tests/answer.check.py",
          hidden: false,
        })),
      }),
    ).rejects.toThrow(/at most 12 checks/i);

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...base,
        sparkId: "check_label_too_long",
        tests: [
          {
            id: "visible",
            label: "x".repeat(241),
            command: "python3 tests/answer.check.py",
            hidden: false,
          },
        ],
      }),
    ).rejects.toThrow(/check label.*240 bytes/i);

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...base,
        sparkId: "title_too_long",
        title: "x".repeat(161),
      }),
    ).rejects.toThrow(/title.*160 bytes/i);

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...base,
        sparkId: "x".repeat(161),
      }),
    ).rejects.toThrow(/spark id.*160 bytes/i);

    await expect(
      authed.query(testApi.codeSparks.getSessionForSpark, {
        threadId,
        sparkId: "x".repeat(161),
      }),
    ).rejects.toThrow(/spark id.*160 bytes/i);

    await expect(
      authed.query(testApi.codeSparks.getSessionForSpark, {
        threadId,
        sparkId: "é".repeat(80),
      }),
    ).resolves.toBeNull();

    await expect(
      authed.query(testApi.codeSparks.getSessionForSpark, {
        threadId,
        sparkId: "é".repeat(81),
      }),
    ).rejects.toThrow(/spark id.*160 bytes/i);

    await expect(
      authed.mutation(testApi.codeSparks.writeFile, {
        threadId,
        sparkId: "x".repeat(161),
        path: "main.py",
        contents: "print('bounded')",
      }),
    ).rejects.toThrow(/spark id.*160 bytes/i);

    await expect(
      authed.action(testApi.codeSparkActions.run, {
        threadId,
        sparkId: "x".repeat(161),
        mode: "run",
      }),
    ).rejects.toThrow(/spark id.*160 bytes/i);

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...base,
        messageId: "x".repeat(161),
      }),
    ).rejects.toThrow(/message id.*160 bytes/i);

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, base);
    await expect(
      authed.mutation(testApi.codeSparks.writeFile, {
        threadId,
        sparkId: "payload_limits",
        path: "main.py",
        contents: "x".repeat(20_001),
      }),
    ).rejects.toThrow(/file.*20,000 bytes/i);
  });

  it("caps Code Spark sessions per thread", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    for (let index = 0; index < 32; index += 1) {
      await authed.mutation(
        testApi.codeSparks.upsertSessionFromArtifact,
        publicPythonArtifactArgs(threadId, `bounded_${index}`),
      );
    }

    await expect(
      authed.mutation(
        testApi.codeSparks.upsertSessionFromArtifact,
        publicPythonArtifactArgs(threadId, "bounded_overflow"),
      ),
    ).rejects.toThrow(/at most 32 code sparks per thread/i);
  });

  it("derives persisted provider readiness from server config instead of artifact claims", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Provider truth",
      mode: "challenge",
      language: "typescript",
      provider: "vercel_sandbox",
      providerStatus: "configured",
      activePath: "src/add.ts",
      runCommand: "node src/add.ts",
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

    expect(hydrated).toMatchObject({
      provider: "local_fake",
      providerStatus: "test_only",
      status: "ready",
    });
  });

  it("persists unavailable provider readiness when server config cannot run Code Spark", async () => {
    setVercelSandboxWithoutAuthEnv();
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Unavailable provider truth",
      mode: "challenge",
      language: "typescript",
      provider: "vercel_sandbox",
      providerStatus: "configured",
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

    expect(hydrated).toMatchObject({
      provider: "unavailable",
      providerStatus: "unavailable",
      status: "unavailable",
    });
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

  it("does not expose legacy hidden test files through public hydration", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    const created = await authed.mutation(
      testApi.codeSparks.upsertSessionFromArtifact,
      {
        threadId,
        messageId: "message_1",
        sparkId: "spark_1",
        title: "Legacy hidden file",
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
        tests: [],
      },
    );

    await t.run(async (ctx) => {
      await ctx.db.insert("codeSparkFiles", {
        sessionId: created.sessionId,
        path: "tests/secret.check.ts",
        language: "typescript",
        contents: "console.log('SECRET_HIDDEN_SOURCE')",
        version: 1,
        hash: "legacy-hidden",
        editable: false,
        role: "hidden_test",
        updatedAt: Date.now(),
      });
    });

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "spark_1",
    });

    expect(hydrated?.files.map((file: { path: string }) => file.path)).toEqual([
      "src/add.ts",
    ]);
    expect(JSON.stringify(hydrated)).not.toContain("SECRET_HIDDEN_SOURCE");
  });

  it("reads historical c, rust, and mixed rows while public creation stays restricted", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });
    const historicalLanguages = ["c", "rust", "mixed"] as const;

    await t.run(async (ctx) => {
      const now = Date.now();
      for (const language of historicalLanguages) {
        const sessionId = await ctx.db.insert("codeSparkSessions", {
          userId: "user_a",
          threadId,
          sparkId: `legacy_${language}`,
          title: `Legacy ${language}`,
          mode: "workspace",
          language,
          provider: "unavailable",
          providerStatus: "unavailable",
          status: "archived",
          activePath: `src/main.${language}`,
          runCommand: "unsupported historical command",
          testCommand: "unsupported historical command",
          version: 1,
          createdAt: now,
          updatedAt: now,
          lastAccessedAt: now,
        });
        await ctx.db.insert("codeSparkFiles", {
          sessionId,
          path: `src/main.${language}`,
          language,
          contents: `historical ${language} source`,
          version: 1,
          hash: language,
          editable: true,
          role: "starter",
          updatedAt: now,
        });
      }
    });

    for (const language of historicalLanguages) {
      const hydrated = await authed.query(
        testApi.codeSparks.getSessionForSpark,
        { threadId, sparkId: `legacy_${language}` },
      );
      expect(hydrated?.language).toBe(language);
      expect(hydrated?.files[0]?.language).toBe(language);
    }

    await expect(
      authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
        ...pythonArtifactArgs(threadId, "new_rust"),
        language: "rust",
      } as never),
    ).rejects.toThrow();
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

    await authed.mutation(
      testApi.codeSparks.upsertSessionFromArtifact,
      seedArgs,
    );
    await authed.mutation(testApi.codeSparks.writeFile, {
      threadId,
      sparkId: "spark_1",
      path: "src/add.ts",
      contents: "export const add = () => 5;",
    });
    await authed.mutation(
      testApi.codeSparks.upsertSessionFromArtifact,
      seedArgs,
    );

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "spark_1",
    });

    expect(hydrated?.files[0]?.contents).toBe("export const add = () => 5;");
  });

  it("hydrates persisted visible checks instead of remounted payload checks", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Persisted check",
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
          id: "persisted-visible",
          label: "persisted visible check",
          command: "node tests/add.check.ts",
          hidden: false,
        },
      ],
    });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Payload changed later",
      mode: "challenge",
      language: "typescript",
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.ts",
      runCommand: "node tests/new.check.ts",
      testCommand: "node tests/new.check.ts",
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
          id: "new-payload-visible",
          label: "new payload visible check",
          command: "node tests/new.check.ts",
          hidden: false,
        },
      ],
    });

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "spark_1",
    });

    expect(hydrated?.tests).toEqual([
      {
        id: "persisted-visible",
        label: "persisted visible check",
        hidden: false,
      },
    ]);
    expect(JSON.stringify(hydrated?.tests)).not.toContain(
      "new-payload-visible",
    );
  });

  it("does not overwrite persisted edits across multiple starter files when the artifact remounts", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });
    const seedArgs = {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Add and format",
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
        {
          path: "src/format.ts",
          language: "typescript" as const,
          contents: "export const format = () => '';",
          editable: true,
          role: "starter" as const,
        },
      ],
      tests: [
        {
          id: "visible",
          label: "visible check",
          command: "node tests/add.check.ts",
          hidden: false,
        },
      ],
    };

    await authed.mutation(
      testApi.codeSparks.upsertSessionFromArtifact,
      seedArgs,
    );
    await authed.mutation(testApi.codeSparks.writeFile, {
      threadId,
      sparkId: "spark_1",
      path: "src/add.ts",
      contents: "export const add = (a: number, b: number) => a + b;",
    });
    await authed.mutation(testApi.codeSparks.writeFile, {
      threadId,
      sparkId: "spark_1",
      path: "src/format.ts",
      contents: "export const format = (value: number) => `answer: ${value}`;",
    });
    await authed.mutation(
      testApi.codeSparks.upsertSessionFromArtifact,
      seedArgs,
    );

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "spark_1",
    });

    expect(
      Object.fromEntries(
        hydrated?.files.map((file: { path: string; contents: string }) => [
          file.path,
          file.contents,
        ]) ?? [],
      ),
    ).toMatchObject({
      "src/add.ts": "export const add = (a: number, b: number) => a + b;",
      "src/format.ts":
        "export const format = (value: number) => `answer: ${value}`;",
    });
  });

  it("keeps server classification and runtime state immutable across malicious public re-upsert", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });
    const generated = pythonArtifactArgs(threadId, "spark_1");

    await t.mutation(testInternal.codeSparks.persistGeneratedSessionInternal, {
      userId: "user_a",
      ...generated,
    });
    await t.run(async (ctx) => {
      const session = await ctx.db
        .query("codeSparkSessions")
        .withIndex("by_userId_threadId_sparkId", (q) =>
          q
            .eq("userId", "user_a")
            .eq("threadId", threadId)
            .eq("sparkId", "spark_1"),
        )
        .unique();
      if (!session) throw new Error("missing generated session");
      await ctx.db.patch(session._id, {
        providerSessionId: "provider-private-session",
      });
    });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "attacker_message",
      sparkId: "spark_1",
      title: "Learner-renamed challenge",
      mode: "workspace",
      language: "typescript",
      provider: "daytona",
      providerStatus: "configured",
      activePath: "src/attacker.ts",
      runCommand: "",
      testCommand: "",
      files: [
        {
          path: "src/attacker.ts",
          language: "typescript",
          contents: "console.log('ATTACKER_FILE')",
          editable: true,
          role: "starter",
        },
        {
          path: "tests/attacker.check.ts",
          language: "typescript",
          contents: "console.log('ATTACKER_CHECK')",
          editable: false,
          role: "test",
        },
      ],
      tests: [
        {
          id: "attacker",
          label: "attacker replacement check",
          command: "",
          hidden: false,
        },
      ],
    });

    const persisted = await t.run(async (ctx) => {
      const session = await ctx.db
        .query("codeSparkSessions")
        .withIndex("by_userId_threadId_sparkId", (q) =>
          q
            .eq("userId", "user_a")
            .eq("threadId", threadId)
            .eq("sparkId", "spark_1"),
        )
        .unique();
      if (!session) throw new Error("missing session");
      const files = await ctx.db
        .query("codeSparkFiles")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      const checks = await ctx.db
        .query("codeSparkChecks")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", session._id))
        .collect();
      return { session, files, checks };
    });
    expect(persisted.session).toMatchObject({
      messageId: generated.messageId,
      mode: "challenge",
      language: "python",
      provider: "local_fake",
      providerStatus: "test_only",
      providerSessionId: "provider-private-session",
      status: "ready",
      activePath: "main.py",
      runCommand: "python3 main.py",
      testCommand: "python3 tests/answer.check.py",
    });
    expect(persisted.files.map((file) => file.path).sort()).toEqual([
      "main.py",
      "tests/answer.check.py",
    ]);
    expect(persisted.checks).toHaveLength(1);
    expect(JSON.stringify(persisted)).not.toMatch(
      /ATTACKER_FILE|ATTACKER_CHECK/,
    );

    const runtimeHydrated = await t.query(
      testInternal.codeSparks.getRuntimeSessionForSparkInternal,
      {
        userId: "user_a",
        threadId,
        sparkId: "spark_1",
      },
    );

    expect(runtimeHydrated?.runCommand).toBe("python3 main.py");
    expect(runtimeHydrated?.testCommand).toBe("python3 tests/answer.check.py");
    expect(runtimeHydrated?.checks).toEqual([
      {
        id: "visible-answer",
        label: "answer() returns a concrete value",
        command: "python3 tests/answer.check.py",
        hidden: false,
      },
    ]);
    expect(
      runtimeHydrated?.files.map((file: { path: string }) => file.path).sort(),
    ).toEqual(["main.py", "tests/answer.check.py"]);

    const publicHydrated = await authed.query(
      testApi.codeSparks.getSessionForSpark,
      { threadId, sparkId: "spark_1" },
    );
    expect(publicHydrated).toMatchObject({
      title: "Learner-renamed challenge",
      mode: "challenge",
      language: "python",
      activePath: "main.py",
    });
    expect(publicHydrated?.runCommand).toBeUndefined();
    expect(publicHydrated?.testCommand).toBeUndefined();
    expect(publicHydrated?.providerSessionId).toBeUndefined();
    expect(JSON.stringify(publicHydrated)).not.toMatch(
      /answer\.check|ATTACKER_FILE|ATTACKER_CHECK/,
    );

    const runResult = await authed.action(testApi.codeSparkActions.run, {
      threadId,
      sparkId: "spark_1",
      mode: "run",
    });
    expect(runResult.status).toBe("passed");
    expect(runResult).toMatchObject({
      status: "passed",
      stdout: expect.any(String),
      stderr: expect.any(String),
      exitCode: 0,
      reason: "Program finished.",
    });
    expect(runResult).toHaveProperty("provider", "local_fake");
    expect(JSON.stringify(runResult)).not.toMatch(
      /python3|answer\.check|ATTACKER/,
    );
  });

  it("does not expose a public mutation that can forge run records", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);

    await expect(
      t
        .withIdentity({ subject: "user_a" })
        .mutation(removedPublicRecordRunResult, {
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

  it("blocks Code Spark runs when the learner is out of free onboarding entitlement", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Entitlement gated run",
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
            "export function add(a: number, b: number) { return a + b; }\nconsole.log(add(2, 3));",
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

    await t.mutation(
      testInternal.billing.incrementFreeOnboardingUsageInternal,
      {
        userId: "user_a",
        promptCount: 3,
        textAiCostUsd: 0,
      },
    );

    await expect(
      authed.action(testApi.codeSparkActions.run, {
        threadId,
        sparkId: "spark_1",
        mode: "run",
      }),
    ).rejects.toThrow(
      "You've used your free onboarding chats. Choose a plan to keep going.",
    );

    const sessionAfterBlockedRun = await authed.query(
      testApi.codeSparks.getSessionForSpark,
      {
        threadId,
        sparkId: "spark_1",
      },
    );
    expect(sessionAfterBlockedRun?.lastRun).toBeUndefined();
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
      runCommand: "node src/add.ts",
      testCommand: "node tests/add.check.ts",
      files: [
        {
          path: "src/add.ts",
          language: "typescript",
          contents:
            "export function add(a: number, b: number) { return a + b; }\nconsole.log(add(2, 3));",
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
        command:
          "node -e \"console.log(require('fs').readFileSync('tests/hidden.check.ts','utf8'))\"",
      }),
    ).rejects.toThrow();

    const result = await authed.action(testApi.codeSparkActions.run, {
      threadId,
      sparkId: "spark_1",
      mode: "run",
    });

    expect(result).toMatchObject({
      status: "passed",
      stdout: expect.any(String),
      stderr: expect.any(String),
      exitCode: 0,
      reason: "Program finished.",
    });
    expect(result).toHaveProperty("provider", "local_fake");

    const testResult = await authed.action(testApi.codeSparkActions.run, {
      threadId,
      sparkId: "spark_1",
      mode: "test",
    });

    expect(testResult).toEqual({
      status: "passed",
      provider: "local_fake",
      reason: "Check passed.",
    });
  });

  it("accepts Node-compatible JS visible check commands for JS/TS sparks", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await t.mutation(testInternal.codeSparks.persistGeneratedSessionInternal, {
      userId: "user_a",
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Node visible check",
      mode: "challenge",
      language: "typescript",
      provider: "local_fake",
      providerStatus: "test_only",
      activePath: "src/add.mjs",
      runCommand: "node src/add.mjs",
      testCommand: "node tests/add.check.mjs",
      files: [
        {
          path: "src/add.mjs",
          language: "typescript",
          contents:
            "export function add(a, b) { return a + b; }\nconsole.log(add(2, 3));",
          editable: true,
          role: "starter",
        },
        {
          path: "tests/add.check.mjs",
          language: "typescript",
          contents:
            "import { add } from '../src/add.mjs';\nif (add(2, 3) !== 5) throw new Error('Expected 5');",
          editable: false,
          role: "test",
        },
      ],
      tests: [
        {
          id: "visible-js",
          label: "adds visible JS values",
          command: "node tests/add.check.mjs",
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

    expect(runtimeHydrated?.runCommand).toBe("node src/add.mjs");
    expect(runtimeHydrated?.checks).toEqual([
      {
        id: "visible-js",
        label: "adds visible JS values",
        command: "node tests/add.check.mjs",
        hidden: false,
      },
    ]);

    const result = await authed.action(testApi.codeSparkActions.run, {
      threadId,
      sparkId: "spark_1",
      mode: "run",
    });

    if (process.env.CODE_SPARK_PROVIDER === "vercel_sandbox") {
      if (result.status === "unavailable") {
        expect(result).toEqual({
          status: "unavailable",
          reason: "Code runner unavailable. Try again in a moment.",
        });
        return;
      }
      expect(result).toMatchObject({
        status: "passed",
        stdout: expect.stringContaining("5"),
        stderr: "",
        exitCode: 0,
        reason: "Program finished.",
      });
      expect(result).toHaveProperty("provider", "local_fake");
      return;
    }

    expect(result).toMatchObject({
      status: "passed",
      stdout: expect.any(String),
      stderr: expect.any(String),
      exitCode: 0,
      reason: "Program finished.",
    });
    expect(result).toHaveProperty("provider", "local_fake");
  });

  it("fails closed with an explicit setup reason when Vercel Sandbox is forced without auth", async () => {
    setVercelSandboxWithoutAuthEnv();
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_1",
      sparkId: "spark_1",
      title: "Provider config blocker",
      mode: "challenge",
      language: "typescript",
      provider: "unavailable",
      providerStatus: "unavailable",
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
          label: "adds visible values",
          command: "node tests/add.check.ts",
          hidden: false,
        },
      ],
    });

    const result = await authed.action(testApi.codeSparkActions.run, {
      threadId,
      sparkId: "spark_1",
      mode: "run",
    });

    expect(result).toEqual({
      status: "unavailable",
      provider: "unavailable",
      reason: "Code runner unavailable. Try again in a moment.",
    });

    const reservations = await t.run(async (ctx) =>
      ctx.db.query("codeSparkRunReservations").collect(),
    );
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.status).toBe("released");
  });

  it("sanitizes provider setup failures for workspace runs and persistence", async () => {
    setVercelSandboxWithoutAuthEnv();
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    await authed.mutation(testApi.codeSparks.upsertSessionFromArtifact, {
      threadId,
      messageId: "message_workspace_provider_error",
      sparkId: "workspace_provider_error",
      title: "Provider error hygiene",
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
          contents: "print('hello')",
          editable: true,
          role: "starter",
        },
      ],
      tests: [],
    });

    const result = await authed.action(testApi.codeSparkActions.run, {
      threadId,
      sparkId: "workspace_provider_error",
      mode: "run",
    });

    expect(result).toMatchObject({
      status: "unavailable",
      provider: "unavailable",
      stdout: "",
      stderr: "Code Spark runtime provider is unavailable. Try again in a moment.",
      reason: "Code Spark runtime provider is unavailable. Try again in a moment.",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /VERCEL_TOKEN|VERCEL_TEAM_ID|VERCEL_PROJECT_ID|\/Users\//,
    );

    const hydrated = await authed.query(testApi.codeSparks.getSessionForSpark, {
      threadId,
      sparkId: "workspace_provider_error",
    });
    expect(JSON.stringify(hydrated?.lastRun)).not.toMatch(
      /VERCEL_TOKEN|VERCEL_TEAM_ID|VERCEL_PROJECT_ID|\/Users\//,
    );
    expect(hydrated?.lastRun).toMatchObject({
      status: "unavailable",
      stderr: "Code Spark runtime provider is unavailable. Try again in a moment.",
    });
  });

  it("atomically limits true concurrent provider reservations across different spark ids", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });

    for (let index = 0; index < 4; index += 1) {
      await authed.mutation(
        testApi.codeSparks.upsertSessionFromArtifact,
        publicPythonArtifactArgs(threadId, `spark_${index}`),
      );
    }

    const beforeCooldown = Date.now();
    const concurrentResults = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        authed.action(testApi.codeSparkActions.run, {
          threadId,
          sparkId: `spark_${index}`,
          mode: "run",
        }),
      ),
    );
    expect(
      concurrentResults.filter((result) => result.status === "passed"),
    ).toHaveLength(3);
    const cooldownResults = concurrentResults.filter(
      (result) => result.code === "CODE_SPARK_COOLDOWN",
    );
    expect(cooldownResults).toHaveLength(1);
    const cooldownResult = cooldownResults[0]!;

    expect(cooldownResult).toMatchObject({
      status: "unavailable",
      code: "CODE_SPARK_COOLDOWN",
      reason:
        "Code Spark has too many runs in progress. Wait for one to finish.",
    });
    expect(cooldownResult.retryAfterMs).toBeGreaterThan(120_000);
    expect(cooldownResult.retryAfterMs).toBeLessThanOrEqual(5 * 60_000);
    expect(cooldownResult.cooldownUntil).toBeGreaterThanOrEqual(
      beforeCooldown + cooldownResult.retryAfterMs,
    );
    expect(Object.keys(cooldownResult).sort()).toEqual([
      "code",
      "cooldownUntil",
      "reason",
      "retryAfterMs",
      "status",
    ]);

    const metering = await t.run(async (ctx) => {
      const reservations = await ctx.db
        .query("codeSparkRunReservations")
        .collect();
      const usage = await ctx.db.query("codeSparkUsage").collect();
      return { reservations, usage };
    });
    expect(metering.reservations).toHaveLength(3);
    expect(
      metering.reservations.every((row) => row.status === "completed"),
    ).toBe(true);
    expect(metering.usage).toHaveLength(3);
    expect(metering.usage.every((row) => row.provider === "local_fake")).toBe(
      true,
    );
  });

  it("keeps a user-global active-run lease for the full provider lifetime across thread deletion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T18:00:00.000Z"));
    try {
      const t = testConvex();
      const firstThreadId = await createOwnedThread(t);
      const startedAt = Date.now();
      const admittedReservationIds: string[] = [];

      for (let index = 0; index < 3; index += 1) {
        const sparkId = `active_${index}`;
        await t.mutation(
          testInternal.codeSparks.persistGeneratedSessionInternal,
          {
            userId: "user_a",
            ...pythonArtifactArgs(firstThreadId, sparkId),
          },
        );
        const admission = await t.mutation(
          testInternal.codeSparks.reserveRunInternal,
          {
            userId: "user_a",
            threadId: firstThreadId,
            sparkId,
          },
        );
        expect(admission.allowed).toBe(true);
        if (admission.allowed) {
          admittedReservationIds.push(admission.reservationId);
        }
      }

      const liveBeforeDelete = await t.run(async (ctx) =>
        ctx.db.query("codeSparkRunReservations").collect(),
      );
      expect(liveBeforeDelete).toHaveLength(3);
      expect(
        liveBeforeDelete.every(
          (row) =>
            row.status === "reserved" && row.expiresAt > startedAt + 120_000,
        ),
      ).toBe(true);

      await t.mutation(testInternal.chat.deleteThreadRecordInternal, {
        userId: "user_a",
        threadId: firstThreadId,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      vi.setSystemTime(new Date(startedAt + 120_001));
      const cleanupWhileProviderMayStillBeLive = await t.mutation(
        testInternal.codeSparks.cleanupOperationalDataInternal,
        { now: Date.now() },
      );
      expect(cleanupWhileProviderMayStillBeLive.reconciledReservations).toBe(0);

      const secondThreadId = await createOwnedThread(t);
      await t.mutation(
        testInternal.codeSparks.persistGeneratedSessionInternal,
        {
          userId: "user_a",
          ...pythonArtifactArgs(secondThreadId, "after_active_delete"),
        },
      );
      const blocked = await t.mutation(
        testInternal.codeSparks.reserveRunInternal,
        {
          userId: "user_a",
          threadId: secondThreadId,
          sparkId: "after_active_delete",
        },
      );
      expect(blocked.allowed).toBe(false);
      if (!blocked.allowed) {
        expect(blocked.retryAfterMs).toBeGreaterThan(0);
        expect(blocked.cooldownUntil).toBeGreaterThan(Date.now());
      }

      await t.mutation(testInternal.codeSparks.finalizeRunReservationInternal, {
        userId: "user_a",
        reservationId: admittedReservationIds[0] as never,
        completed: true,
        provider: "local_fake",
        status: "passed",
        durationMs: 120_001,
        timedOut: false,
      });
      const admittedAfterFinalize = await t.mutation(
        testInternal.codeSparks.reserveRunInternal,
        {
          userId: "user_a",
          threadId: secondThreadId,
          sparkId: "after_active_delete",
        },
      );
      expect(admittedAfterFinalize.allowed).toBe(true);

      vi.setSystemTime(new Date(startedAt + 10 * 60_000));
      const staleCleanup = await t.mutation(
        testInternal.codeSparks.cleanupOperationalDataInternal,
        { now: Date.now() },
      );
      expect(staleCleanup.reconciledReservations).toBe(3);
      const afterStaleCleanup = await t.run(async (ctx) =>
        ctx.db.query("codeSparkRunReservations").collect(),
      );
      expect(
        afterStaleCleanup.filter((row) => row.status === "reserved"),
      ).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces the cumulative monthly Code Spark run entitlement", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00.000Z"));
    try {
      const t = testConvex();
      const threadId = await createOwnedThread(t);
      await t.mutation(
        testInternal.codeSparks.persistGeneratedSessionInternal,
        {
          userId: "user_a",
          ...pythonArtifactArgs(threadId, "monthly_limit"),
        },
      );

      const unavailableAdmission = await t.mutation(
        testInternal.codeSparks.reserveRunInternal,
        {
          userId: "user_a",
          threadId,
          sparkId: "monthly_limit",
          monthlyRunLimit: 2,
          billingPeriodStart: Date.parse("2026-07-01T00:00:00.000Z"),
          billingPeriodEnd: Date.parse("2026-08-01T00:00:00.000Z"),
        },
      );
      expect(unavailableAdmission.allowed).toBe(true);
      if (unavailableAdmission.allowed) {
        await t.mutation(
          testInternal.codeSparks.finalizeRunReservationInternal,
          {
            userId: "user_a",
            reservationId: unavailableAdmission.reservationId,
            completed: false,
            provider: "unavailable",
            status: "unavailable",
            durationMs: 0,
            timedOut: false,
          },
        );
      }
      vi.advanceTimersByTime(16_000);

      for (let index = 0; index < 2; index += 1) {
        const admission = await t.mutation(
          testInternal.codeSparks.reserveRunInternal,
          {
            userId: "user_a",
            threadId,
            sparkId: "monthly_limit",
            monthlyRunLimit: 2,
            billingPeriodStart: Date.parse("2026-07-01T00:00:00.000Z"),
            billingPeriodEnd: Date.parse("2026-08-01T00:00:00.000Z"),
          },
        );
        expect(admission.allowed).toBe(true);
        if (admission.allowed) {
          await t.mutation(
            testInternal.codeSparks.finalizeRunReservationInternal,
            {
              userId: "user_a",
              reservationId: admission.reservationId,
              completed: true,
              provider: "local_fake",
              status: "passed",
              durationMs: 1,
              timedOut: false,
            },
          );
        }
        vi.advanceTimersByTime(16_000);
      }

      const blocked = await t.mutation(
        testInternal.codeSparks.reserveRunInternal,
        {
          userId: "user_a",
          threadId,
          sparkId: "monthly_limit",
          monthlyRunLimit: 2,
          billingPeriodStart: Date.parse("2026-07-01T00:00:00.000Z"),
          billingPeriodEnd: Date.parse("2026-08-01T00:00:00.000Z"),
        },
      );

      expect(blocked).toMatchObject({
        allowed: false,
        limit: "monthly",
        cooldownUntil: Date.parse("2026-08-01T00:00:00.000Z"),
      });
      if (!blocked.allowed) {
        expect(blocked.retryAfterMs).toBe(
          Date.parse("2026-08-01T00:00:00.000Z") - Date.now(),
        );
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the user-global admission window after thread deletion until expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T18:00:00.000Z"));
    try {
      const t = testConvex();
      const firstThreadId = await createOwnedThread(t);
      const authed = t.withIdentity({ subject: "user_a" });

      for (let index = 0; index < 3; index += 1) {
        await authed.mutation(
          testApi.codeSparks.upsertSessionFromArtifact,
          publicPythonArtifactArgs(firstThreadId, `first_${index}`),
        );
        const result = await authed.action(testApi.codeSparkActions.run, {
          threadId: firstThreadId,
          sparkId: `first_${index}`,
          mode: "run",
        });
        expect(result.status).toBe("passed");
      }

      await t.mutation(testInternal.chat.deleteThreadRecordInternal, {
        userId: "user_a",
        threadId: firstThreadId,
      });

      const secondThreadId = await createOwnedThread(t);
      await authed.mutation(
        testApi.codeSparks.upsertSessionFromArtifact,
        publicPythonArtifactArgs(secondThreadId, "after_delete"),
      );

      const stillBlocked = await authed.action(testApi.codeSparkActions.run, {
        threadId: secondThreadId,
        sparkId: "after_delete",
        mode: "run",
      });
      expect(stillBlocked).toMatchObject({
        status: "unavailable",
        code: "CODE_SPARK_COOLDOWN",
      });

      vi.advanceTimersByTime(15_001);
      const afterExpiry = await authed.action(testApi.codeSparkActions.run, {
        threadId: secondThreadId,
        sparkId: "after_delete",
        mode: "run",
      });
      expect(afterExpiry.status).toBe("passed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconciles stuck reservations and bounds operational retention idempotently", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);
    const authed = t.withIdentity({ subject: "user_a" });
    const now = Date.now();
    const old = now - 36 * 24 * 60 * 60 * 1_000;

    const created = await authed.mutation(
      testApi.codeSparks.upsertSessionFromArtifact,
      publicPythonArtifactArgs(threadId, "retention"),
    );
    const seeded = await t.run(async (ctx) => {
      const expiredReservationId = await ctx.db.insert(
        "codeSparkRunReservations",
        {
          userId: "user_a",
          threadId,
          sparkId: "retention",
          sessionId: created.sessionId,
          status: "reserved",
          createdAt: now - 10_000,
          expiresAt: now - 1,
        },
      );
      const oldReservationId = await ctx.db.insert("codeSparkRunReservations", {
        userId: "user_a",
        threadId,
        sparkId: "retention",
        sessionId: created.sessionId,
        status: "completed",
        createdAt: old,
        expiresAt: old + 15_000,
        finalizedAt: old + 1,
      });
      await ctx.db.insert("codeSparkUsage", {
        userId: "user_a",
        threadId,
        sparkId: "retention",
        sessionId: created.sessionId,
        reservationId: oldReservationId,
        provider: "local_fake",
        status: "failed",
        durationMs: 1,
        timedOut: false,
        createdAt: old,
      });
      const oldRunId = await ctx.db.insert("codeSparkRuns", {
        sessionId: created.sessionId,
        version: 1,
        kind: "test",
        provider: "local_fake",
        status: "failed",
        timedOut: false,
        triggeredBy: "user",
        createdAt: old,
      });
      return { expiredReservationId, oldReservationId, oldRunId };
    });

    const firstCleanup = await t.mutation(
      testInternal.codeSparks.cleanupOperationalDataInternal,
      { now },
    );
    expect(firstCleanup).toMatchObject({
      reconciledReservations: 1,
      deletedRuns: 1,
      deletedUsage: 1,
      deletedReservations: 1,
    });

    const afterFirst = await t.run(async (ctx) => ({
      expired: await ctx.db.get(seeded.expiredReservationId),
      oldReservation: await ctx.db.get(seeded.oldReservationId),
      oldRun: await ctx.db.get(seeded.oldRunId),
      usage: await ctx.db.query("codeSparkUsage").collect(),
    }));
    expect(afterFirst.expired).toMatchObject({
      status: "released",
      finalizedAt: now,
    });
    expect(afterFirst.oldReservation).toBeNull();
    expect(afterFirst.oldRun).toBeNull();
    expect(afterFirst.usage).toEqual([]);

    const secondCleanup = await t.mutation(
      testInternal.codeSparks.cleanupOperationalDataInternal,
      { now },
    );
    expect(secondCleanup).toMatchObject({
      reconciledReservations: 0,
      deletedRuns: 0,
      deletedUsage: 0,
      deletedReservations: 0,
    });
  });

  it("cascades thread-scoped Code Spark data in bounded scheduled batches", async () => {
    vi.useFakeTimers();
    try {
      const t = testConvex();
      const threadId = await createOwnedThread(t);

      await t.run(async (ctx) => {
        const now = Date.now();
        for (let index = 0; index < 6; index += 1) {
          const sessionId = await ctx.db.insert("codeSparkSessions", {
            userId: "user_a",
            threadId,
            messageId: `message_${index}`,
            sparkId: `cascade_${index}`,
            title: "Cascade",
            mode: "challenge",
            language: "python",
            provider: "local_fake",
            providerStatus: "test_only",
            status: "ready",
            activePath: "main.py",
            runCommand: "python3 main.py",
            testCommand: "python3 tests/answer.check.py",
            version: 1,
            createdAt: now,
            updatedAt: now,
            lastAccessedAt: now,
          });
          await ctx.db.insert("codeSparkFiles", {
            sessionId,
            path: "main.py",
            language: "python",
            contents: "def answer(): return None",
            version: 1,
            hash: "hash",
            editable: true,
            role: "starter",
            updatedAt: now,
          });
          await ctx.db.insert("codeSparkChecks", {
            sessionId,
            checkId: "visible",
            label: "visible",
            command: "python3 tests/answer.check.py",
            hidden: false,
            createdAt: now,
            updatedAt: now,
          });

          const runCount = index === 0 ? 70 : 1;
          for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
            await ctx.db.insert("codeSparkRuns", {
              sessionId,
              version: 1,
              kind: "test",
              provider: "local_fake",
              command: "python3 tests/answer.check.py",
              status: "failed",
              stdout: "",
              stderr: "failed",
              durationMs: 1,
              timedOut: false,
              triggeredBy: "user",
              createdAt: now + runIndex,
            });
          }

          const reservationId = await ctx.db.insert(
            "codeSparkRunReservations",
            {
              userId: "user_a",
              threadId,
              sparkId: `cascade_${index}`,
              sessionId,
              status: "completed",
              createdAt: now,
              expiresAt: now + 15_000,
              finalizedAt: now,
            },
          );
          await ctx.db.insert("codeSparkUsage", {
            userId: "user_a",
            threadId,
            sparkId: `cascade_${index}`,
            sessionId,
            reservationId,
            provider: "local_fake",
            status: "failed",
            durationMs: 1,
            timedOut: false,
            createdAt: now,
          });
        }
      });

      await t.mutation(testInternal.chat.deleteThreadRecordInternal, {
        userId: "user_a",
        threadId,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const remaining = await t.run(async (ctx) => ({
        threads: await ctx.db.query("userThreads").collect(),
        sessions: await ctx.db.query("codeSparkSessions").collect(),
        files: await ctx.db.query("codeSparkFiles").collect(),
        checks: await ctx.db.query("codeSparkChecks").collect(),
        runs: await ctx.db.query("codeSparkRuns").collect(),
        reservations: await ctx.db.query("codeSparkRunReservations").collect(),
        usage: await ctx.db.query("codeSparkUsage").collect(),
      }));

      expect(remaining.threads).toEqual([]);
      expect(remaining.sessions).toEqual([]);
      expect(remaining.files).toEqual([]);
      expect(remaining.checks).toEqual([]);
      expect(remaining.runs).toEqual([]);
      expect(remaining.reservations).toHaveLength(6);
      expect(remaining.usage).toHaveLength(6);
      expect(
        remaining.reservations.every((row) => row.threadId === threadId),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("enforces thread ownership", async () => {
    const t = testConvex();
    const threadId = await createOwnedThread(t);

    await expect(
      t
        .withIdentity({ subject: "user_b" })
        .query(testApi.codeSparks.getSessionForSpark, {
          threadId,
          sparkId: "spark_1",
        }),
    ).rejects.toThrow("Thread not found");
  });
});
