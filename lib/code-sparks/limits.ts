export const maxCodeSparkIdBytes = 160;

export function assertCodeSparkId(sparkId: string) {
  if (new TextEncoder().encode(sparkId).byteLength > maxCodeSparkIdBytes) {
    throw new Error(`Code Spark id exceeds ${maxCodeSparkIdBytes} bytes.`);
  }
}
