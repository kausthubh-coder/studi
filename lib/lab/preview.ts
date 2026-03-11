const PREVIEW_PORT_MIN = 3000;
const PREVIEW_PORT_MAX = 9999;
const IGNORED_PREVIEW_PORTS = new Set([9229]);

export function isPreviewablePort(port: number) {
  return (
    port >= PREVIEW_PORT_MIN &&
    port <= PREVIEW_PORT_MAX &&
    !IGNORED_PREVIEW_PORTS.has(port)
  );
}
