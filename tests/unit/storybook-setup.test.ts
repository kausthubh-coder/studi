import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const readProjectFile = (path: string) => readFileSync(path, "utf8");

describe("Storybook setup", () => {
  it("keeps the Next.js Storybook, testing, accessibility, and MCP wiring in place", () => {
    const packageJson = JSON.parse(readProjectFile("package.json")) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const mainConfig = readProjectFile(".storybook/main.ts");
    const previewConfig = readProjectFile(".storybook/preview.tsx");
    const gitignore = readProjectFile(".gitignore");

    expect(packageJson.scripts).toMatchObject({
      storybook: expect.stringContaining("storybook dev"),
      "build-storybook": expect.stringContaining("storybook build"),
      "test:storybook": expect.stringContaining("--project storybook"),
      "test:unit": expect.stringContaining("--project unit"),
    });
    expect(packageJson.scripts?.storybook).toContain("--host 127.0.0.1");
    expect(packageJson.devDependencies).toEqual(
      expect.objectContaining({
        "@storybook/addon-a11y": expect.any(String),
        "@storybook/addon-mcp": expect.any(String),
        "@storybook/addon-vitest": expect.any(String),
        "@storybook/nextjs-vite": expect.any(String),
      }),
    );

    expect(mainConfig).toContain("@storybook/nextjs-vite");
    expect(mainConfig).toContain("@storybook/addon-mcp");
    expect(mainConfig).toContain("../public");
    expect(mainConfig).toContain(
      'NEXT_PUBLIC_DESMOS_API_KEY: "storybook-mock"',
    );
    expect(mainConfig).toContain('"process.env.NEXT_PUBLIC_DESMOS_API_KEY":');
    expect(mainConfig).toContain('JSON.stringify("storybook-mock")');
    expect(mainConfig).not.toContain("loadEnv");
    expect(mainConfig).not.toContain(".env.local");
    expect(previewConfig).toContain('"../app/globals.css"');
    expect(previewConfig).toContain("appDirectory: true");
    expect(previewConfig).toContain('sb.mock(import("@clerk/nextjs"))');
    expect(previewConfig).toContain('sb.mock(import("convex/react"))');
    expect(previewConfig).toContain(
      'sb.mock(import("@convex-dev/agent/react"))',
    );
    expect(previewConfig).toContain('sb.mock(import("@monaco-editor/react"))');
    expect(previewConfig).toContain("StudiMockProvider");
    expect(gitignore).toContain("storybook-static/");
  });

  it("keeps provider and editor integrations isolated from real services", () => {
    const clerkMock = readProjectFile("__mocks__/@clerk/nextjs.js");
    const convexMock = readProjectFile("__mocks__/convex/react.js");
    const agentMock = readProjectFile("__mocks__/@convex-dev/agent/react.js");
    const monacoMock = readProjectFile("__mocks__/@monaco-editor/react.js");

    expect(clerkMock).toContain("useStudiMockRuntime");
    expect(convexMock).toContain("Unhandled Storybook Convex");
    expect(agentMock).toContain("LoadingFirstPage");
    expect(monacoMock).toContain('data-monaco-mock": "true"');
    expect(monacoMock).not.toContain("cdn.jsdelivr.net");
    for (const externalMock of [clerkMock, convexMock, agentMock, monacoMock]) {
      expect(externalMock).not.toContain(".storybook/mocks/");
    }
  });

  it("keeps Storybook fixtures aligned with the production remediation contracts", () => {
    const provider = readProjectFile(".storybook/mocks/StudiMockProvider.tsx");
    const billing = readProjectFile(".storybook/fixtures/billing.ts");
    const chatStories = readProjectFile("components/StudiChat.stories.tsx");
    const landingStories = readProjectFile(
      "components/landing/LandingPage.stories.tsx",
    );

    expect(provider).toContain('"chat:cancelGeneration"');
    expect(provider).toContain('promptMessageId: "message_story_followup"');
    expect(provider).not.toContain("alreadyOnList");
    expect(chatStories).toContain('promptMessageId: "message_story_followup"');
    expect(chatStories).toContain('"chat:cancelGeneration": cancelGeneration');
    expect(landingStories).not.toContain("alreadyOnList");
    expect(billing).toContain("textAiCostUsdLimit: 1.5");
    expect(billing).toContain("textAiCostUsdLimit: 4.5");
    expect(billing).toContain('status: "canceled"');
    expect(billing).toContain("textPromptLimit: 450");
  });
});
