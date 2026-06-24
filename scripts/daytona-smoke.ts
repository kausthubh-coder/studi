import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDaytonaLabRuntimeProvider } from "../convex/labs/daytonaProvider";

type SmokeStep = {
  name: string;
  status: "success" | "failed" | "skipped";
  detail?: string;
};

const steps: SmokeStep[] = [];

function record(step: SmokeStep) {
  steps.push(step);
  console.log(`${step.status.toUpperCase()} ${step.name}${step.detail ? ` - ${step.detail}` : ""}`);
}

async function main() {
  if (!process.env.DAYTONA_API_KEY) {
    record({
      name: "env",
      status: "skipped",
      detail: "DAYTONA_API_KEY is not set",
    });
    return;
  }

  const provider = createDaytonaLabRuntimeProvider();
  const session = await provider.create({
    title: "studi-live-smoke",
    language: "python",
  });
  record({
    name: "create sandbox",
    status: "success",
    detail: `sandbox=${session.sandboxId}`,
  });

  try {
    await provider.write({
      sandboxId: session.sandboxId,
      path: "smoke/main.py",
      content: "print('studi daytona python ok')\n",
    });
    const python = await provider.runCommand({
      sandboxId: session.sandboxId,
      command: "python smoke/main.py",
      timeoutSec: 30,
    });
    record({
      name: "python",
      status: python.exitCode === 0 ? "success" : "failed",
      detail: python.stdout ?? python.output,
    });

    await provider.write({
      sandboxId: session.sandboxId,
      path: "smoke/main.js",
      content: "console.log('studi daytona javascript ok')\n",
    });
    const js = await provider.runCommand({
      sandboxId: session.sandboxId,
      command: "node smoke/main.js",
      timeoutSec: 30,
    });
    record({
      name: "javascript",
      status: js.exitCode === 0 ? "success" : "skipped",
      detail: js.stdout || js.stderr || js.output,
    });

    await provider.write({
      sandboxId: session.sandboxId,
      path: "smoke/main.ts",
      content:
        "const value: string = 'studi daytona typescript ok'; console.log(value)\n",
    });
    const ts = await provider.runCommand({
      sandboxId: session.sandboxId,
      command: "bun smoke/main.ts || npx tsx smoke/main.ts",
      timeoutSec: 60,
    });
    record({
      name: "typescript",
      status: ts.exitCode === 0 ? "success" : "skipped",
      detail: ts.stdout || ts.stderr || ts.output,
    });

    await provider.runCommand({
      sandboxId: session.sandboxId,
      command:
        "cd smoke && python -m http.server 8765 > /tmp/studi-smoke-preview.log 2>&1 &",
      timeoutSec: 5,
    });
    const preview = await provider.getPreview({
      sandboxId: session.sandboxId,
      port: 8765,
    });
    record({
      name: "preview",
      status: preview.url ? "success" : "skipped",
      detail: preview.url,
    });
  } finally {
    await provider.archive({ sandboxId: session.sandboxId });
    record({
      name: "archive sandbox",
      status: "success",
      detail: `sandbox=${session.sandboxId}`,
    });
  }

  await mkdir(".tmp", { recursive: true });
  const reportPath = join(
    ".tmp",
    `daytona-smoke-${new Date().toISOString().replaceAll(":", "-")}.json`,
  );
  await writeFile(
    reportPath,
    JSON.stringify({ createdAt: new Date().toISOString(), steps }, null, 2),
  );
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  record({
    name: "smoke",
    status: "failed",
    detail: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
