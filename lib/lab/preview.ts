const PREVIEW_PORT_MIN = 3000;
const PREVIEW_PORT_MAX = 9999;
const IGNORED_PREVIEW_PORTS = new Set([9229, 22222]);

export function isPreviewablePort(port: number) {
  return (
    port >= PREVIEW_PORT_MIN &&
    port <= PREVIEW_PORT_MAX &&
    !IGNORED_PREVIEW_PORTS.has(port)
  );
}

export function extractPreviewPortCandidates(output: string): number[] {
  const candidates = new Set<number>();

  const addPort = (rawPort: string) => {
    const parsed = Number.parseInt(rawPort, 10);
    if (!Number.isFinite(parsed) || !isPreviewablePort(parsed)) {
      return;
    }
    candidates.add(parsed);
  };

  const hostRegex =
    /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::|%3A)(\d{2,5})/gi;
  for (const match of output.matchAll(hostRegex)) {
    if (match[1]) {
      addPort(match[1]);
    }
  }

  const portRegex = /\bport\s+(\d{2,5})\b/gi;
  for (const match of output.matchAll(portRegex)) {
    if (match[1]) {
      addPort(match[1]);
    }
  }

  return Array.from(candidates).sort((a, b) => a - b);
}
