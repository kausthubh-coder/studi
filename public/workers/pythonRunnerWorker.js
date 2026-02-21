const PYODIDE_VERSION = "0.27.4";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const MAX_OUTPUT_CHARS = 12000;

let pyodide = null;
let pyodideReadyPromise = null;

function normalizePythonSource(source) {
  if (typeof source !== "string") {
    return "";
  }

  let normalized = source.replace(/\r\n/g, "\n");

  if (!normalized.includes("\n")) {
    const escapedNewlineMatches = normalized.match(/\\n/g);
    if (escapedNewlineMatches && escapedNewlineMatches.length >= 2) {
      normalized = normalized
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t");
    }
  }

  if (!normalized.includes("\n") && /\s{2,}/.test(normalized)) {
    normalized = normalized.replace(
      /\s{2,}(?=(def |class |for |while |if |elif |else:|return |print\(|assert |test_cases|from |import |# ))/g,
      "\n",
    );

    normalized = normalized.replace(
      /(def\s+[A-Za-z_]\w*\([^)]*\)\s*: )#([^\n]*?)\bpass\b/g,
      (_full, signature, comment) =>
        `${signature}\n    #${String(comment).trim()}\n    pass`,
    );
  }

  return normalized;
}

function truncate(value) {
  if (typeof value !== "string") {
    return "";
  }
  if (value.length <= MAX_OUTPUT_CHARS) {
    return value;
  }
  return `${value.slice(0, MAX_OUTPUT_CHARS - 1).trimEnd()}...`;
}

async function ensurePyodide() {
  if (pyodide) {
    return pyodide;
  }

  if (!pyodideReadyPromise) {
    pyodideReadyPromise = (async () => {
      importScripts(`${PYODIDE_INDEX_URL}pyodide.js`);
      pyodide = await loadPyodide({
        indexURL: PYODIDE_INDEX_URL,
      });
      return pyodide;
    })();
  }

  return pyodideReadyPromise;
}

async function executePython({ code, testCode }) {
  const runtime = await ensurePyodide();
  runtime.globals.set("__studi_user_code", normalizePythonSource(code));
  runtime.globals.set(
    "__studi_test_code",
    normalizePythonSource(testCode || ""),
  );

  const startedAt = Date.now();
  const resultJson = await runtime.runPythonAsync(`
import io
import json
import traceback
from contextlib import redirect_stdout, redirect_stderr

user_code = __studi_user_code
test_code = __studi_test_code
stdout_stream = io.StringIO()
stderr_stream = io.StringIO()
error_text = None

with redirect_stdout(stdout_stream), redirect_stderr(stderr_stream):
    try:
        namespace = {}
        exec(user_code, namespace, namespace)
        if isinstance(test_code, str) and test_code.strip():
            exec(test_code, namespace, namespace)
    except Exception:
        error_text = traceback.format_exc()

json.dumps({
    "stdout": stdout_stream.getvalue(),
    "stderr": stderr_stream.getvalue(),
    "error": error_text,
})
`);

  let parsed = {
    stdout: "",
    stderr: "",
    error: "Execution failed to return structured output.",
  };

  try {
    const decoded = JSON.parse(resultJson);
    parsed = {
      stdout: typeof decoded.stdout === "string" ? decoded.stdout : "",
      stderr: typeof decoded.stderr === "string" ? decoded.stderr : "",
      error: typeof decoded.error === "string" ? decoded.error : null,
    };
  } catch {
    parsed.error = "Unable to parse Python execution output.";
  }

  runtime.globals.delete("__studi_user_code");
  runtime.globals.delete("__studi_test_code");

  return {
    stdout: truncate(parsed.stdout),
    stderr: truncate(parsed.stderr),
    error: parsed.error ? truncate(parsed.error) : null,
    durationMs: Date.now() - startedAt,
  };
}

self.onmessage = async (event) => {
  const data = event.data;

  if (!data || typeof data !== "object") {
    return;
  }

  if (data.type === "init") {
    try {
      await ensurePyodide();
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({
        type: "init_error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to initialize Python runtime.",
      });
    }
    return;
  }

  if (data.type === "run") {
    const requestId = typeof data.requestId === "string" ? data.requestId : "";
    try {
      const result = await executePython({
        code: typeof data.code === "string" ? data.code : "",
        testCode: typeof data.testCode === "string" ? data.testCode : "",
      });
      self.postMessage({
        type: "run_result",
        requestId,
        ...result,
      });
    } catch (error) {
      self.postMessage({
        type: "run_result",
        requestId,
        stdout: "",
        stderr: "",
        error:
          error instanceof Error ? error.message : "Python execution failed.",
        durationMs: 0,
      });
    }
  }
};
