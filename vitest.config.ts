import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup/vitest.ts"],
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "components/**/*.vitest.{ts,tsx}",
      "lib/**/*.vitest.{ts,tsx}",
    ],
    exclude: ["node_modules", ".next", "convex", "codesandbox/templates"],
    restoreMocks: true,
  },
});
