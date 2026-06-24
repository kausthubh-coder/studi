import { describe, expect, it } from "vitest";
import { createMockLabRuntimeProvider } from "@/lib/labs/mockRuntimeProvider";
import { normalizeLabPath } from "@/lib/labs/runtime";

describe("LabRuntimeProvider mock contract", () => {
  it("creates a lab, edits files, searches, runs commands, previews, and archives", async () => {
    const provider = createMockLabRuntimeProvider();
    const session = await provider.create({
      title: "Limits lab",
      language: "python",
    });

    expect(session.provider).toBe("daytona");
    expect(session.status).toBe("ready");

    await provider.write({
      sandboxId: session.sandboxId,
      path: "src/main.py",
      content: "print('aha')\n",
    });
    await provider.createFile({
      sandboxId: session.sandboxId,
      path: "README.md",
      content: "Lab notes",
    });

    const files = await provider.list({
      sandboxId: session.sandboxId,
      path: ".",
    });
    expect(files.map((file) => file.path)).toEqual(["README.md", "src"]);

    await expect(
      provider.read({ sandboxId: session.sandboxId, path: "src/main.py" }),
    ).resolves.toContain("aha");

    const matches = await provider.search({
      sandboxId: session.sandboxId,
      path: ".",
      query: "aha",
    });
    expect(matches).toMatchObject([{ path: "src/main.py", line: 1 }]);

    const command = await provider.runCommand({
      sandboxId: session.sandboxId,
      command: "python src/main.py",
    });
    expect(command.exitCode).toBe(0);
    expect(command.stdout).toContain("python src/main.py");

    const preview = await provider.getPreview({
      sandboxId: session.sandboxId,
      port: 3000,
    });
    expect(preview.url).toContain("3000");

    await provider.archive({ sandboxId: session.sandboxId });
    await expect(
      provider.resume({ sandboxId: session.sandboxId }),
    ).resolves.toMatchObject({ status: "archived" });
  });

  it("renames and deletes files without leaking provider details", async () => {
    const provider = createMockLabRuntimeProvider();
    const session = await provider.create({});

    await provider.write({
      sandboxId: session.sandboxId,
      path: "lesson/old.txt",
      content: "rename me",
    });
    await provider.rename({
      sandboxId: session.sandboxId,
      oldPath: "lesson/old.txt",
      newPath: "lesson/new.txt",
    });

    await expect(
      provider.read({ sandboxId: session.sandboxId, path: "lesson/new.txt" }),
    ).resolves.toBe("rename me");

    await provider.delete({
      sandboxId: session.sandboxId,
      path: "lesson/new.txt",
    });
    await expect(
      provider.read({ sandboxId: session.sandboxId, path: "lesson/new.txt" }),
    ).rejects.toThrow("Mock file not found");
  });
});

describe("normalizeLabPath", () => {
  it("normalizes workspace-relative paths", () => {
    expect(normalizeLabPath(undefined)).toBe(".");
    expect(normalizeLabPath(" ./src//main.py ")).toBe("src/main.py");
    expect(normalizeLabPath("src\\main.py")).toBe("src/main.py");
  });

  it("rejects paths that escape the lab workspace", () => {
    for (const path of [
      "../secret.txt",
      "src/../../secret.txt",
      "/etc/passwd",
      "C:\\Users\\learner\\secret.txt",
    ]) {
      expect(() => normalizeLabPath(path)).toThrow(/workspace/);
    }
  });
});
