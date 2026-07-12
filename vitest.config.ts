import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
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
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
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
      },
      {
        extends: true,
        define: {
          "process.env.NEXT_PUBLIC_DESMOS_API_KEY":
            JSON.stringify("storybook-mock"),
        },
        plugins: [
          storybookTest({
            configDir: path.join(rootDir, ".storybook"),
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
