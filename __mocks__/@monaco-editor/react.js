import React from "react";
import { fn } from "storybook/test";

const { createElement } = React;

function EditorMock({
  value = "",
  defaultValue = "",
  language = "text",
  height = "100%",
  onChange,
  options = {},
}) {
  const readOnly = Boolean(options.readOnly);
  return createElement("textarea", {
    "aria-label": "Code editor",
    "data-language": language,
    "data-monaco-mock": "true",
    readOnly,
    spellCheck: false,
    value: value ?? defaultValue,
    onChange: (event) => {
      if (!readOnly) {
        onChange?.(event.currentTarget.value);
      }
    },
    style: {
      boxSizing: "border-box",
      width: "100%",
      height,
      minHeight: "180px",
      resize: "none",
      border: 0,
      padding: "12px",
      background: "#1e1e1e",
      color: "#f5f5f5",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: `${options.fontSize ?? 13}px`,
      lineHeight: 1.5,
    },
  });
}

function DiffEditorMock({ modified = "", onChange, options = {} }) {
  return EditorMock({
    value: modified,
    onChange,
    options,
    language: "diff",
    height: "100%",
  });
}

const monacoFixture = {
  editor: {},
  Uri: {
    parse: (value) => ({ path: value, toString: () => value }),
  },
};

export const Editor = fn(EditorMock).mockName("MonacoEditor");
export const DiffEditor = fn(DiffEditorMock).mockName("MonacoDiffEditor");
export const useMonaco = fn(() => monacoFixture).mockName("useMonaco");
export const loader = {
  config: fn().mockName("monacoLoaderConfig"),
  init: fn(async () => monacoFixture).mockName("monacoLoaderInit"),
  __getMonacoInstance: fn(() => monacoFixture).mockName("getMonacoInstance"),
};

export default Editor;
