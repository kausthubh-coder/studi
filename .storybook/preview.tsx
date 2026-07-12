import type { Preview } from "@storybook/nextjs-vite";
import { sb } from "storybook/test";
import {
  DM_Serif_Display,
  Plus_Jakarta_Sans,
  Source_Serif_4,
} from "next/font/google";

import { StudiMockProvider } from "./mocks/StudiMockProvider";
import type { StudiStoryParameters } from "./mocks/types";
import "../app/globals.css";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

sb.mock(import("@clerk/nextjs"));
sb.mock(import("convex/react"));
sb.mock(import("convex/react-clerk"));
sb.mock(import("@convex-dev/agent/react"));
sb.mock(import("@monaco-editor/react"));

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  style: ["italic", "normal"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif-4",
  subsets: ["latin"],
  display: "swap",
});

function resetBrowserFixtures() {
  localStorage.clear();
  sessionStorage.clear();
  delete globalThis.__STUDI_STORYBOOK_RUNTIME__;
  delete window.Desmos;
  delete window.__studiDesmosLoader;
  document
    .querySelectorAll<HTMLScriptElement>(
      'script[src^="https://www.desmos.com/api/"]',
    )
    .forEach((script) => script.remove());
}

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <StudiMockProvider
        parameters={
          context.parameters.studi as StudiStoryParameters | undefined
        }
      >
        <div
          className={`${dmSerifDisplay.variable} ${plusJakartaSans.variable} ${sourceSerif.variable}`}
          style={{ minHeight: "100vh" }}
        >
          <Story />
        </div>
      </StudiMockProvider>
    ),
  ],
  beforeEach: () => {
    resetBrowserFixtures();
    return resetBrowserFixtures;
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      // 'todo' - show a11y violations in the test UI only
      // 'error' - fail CI on a11y violations
      // 'off' - skip a11y checks entirely
      test: "todo",
    },
    nextjs: {
      appDirectory: true,
    },
  },
};

export default preview;
