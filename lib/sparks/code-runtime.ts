import type { CodePlaygroundLanguage, CodePlaygroundPayload } from "./contracts";

export const defaultCodeSparkPrimaryFile: Record<
  CodePlaygroundLanguage,
  string
> = {
  python: "main.py",
  javascript: "main.js",
  typescript: "main.ts",
};

export function getCodeSparkPrimaryFile(payload: CodePlaygroundPayload): string {
  return payload.primaryFile ?? defaultCodeSparkPrimaryFile[payload.language];
}

export function buildCodeSparkRuntimeFiles(
  payload: CodePlaygroundPayload,
  currentPrimaryCode: string,
) {
  const primaryFile = getCodeSparkPrimaryFile(payload);
  const files =
    payload.starterFiles && payload.starterFiles.length > 0
      ? payload.starterFiles
      : [{ path: primaryFile, content: payload.starterCode }];

  let foundPrimary = false;
  const runtimeFiles = files.map((file) => {
    if (file.path !== primaryFile) return file;
    foundPrimary = true;
    return { ...file, content: currentPrimaryCode };
  });

  if (!foundPrimary) {
    runtimeFiles.unshift({ path: primaryFile, content: currentPrimaryCode });
  }

  return {
    primaryFile,
    files: runtimeFiles,
  };
}
