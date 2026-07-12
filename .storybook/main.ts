import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp",
  ],
  framework: "@storybook/nextjs-vite",
  staticDirs: ["../public"],
  env: (config) => ({
    ...config,
    NEXT_PUBLIC_DESMOS_API_KEY: "storybook-mock",
  }),
  viteFinal: async (config) => ({
    ...config,
    define: {
      ...config.define,
      "process.env.NEXT_PUBLIC_DESMOS_API_KEY":
        JSON.stringify("storybook-mock"),
    },
  }),
};

export default config;
