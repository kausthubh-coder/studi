import { describe, expect, test } from "bun:test";
import {
  getLabTemplateDefinition,
  resolveLabRuntime,
  resolveTemplateKey,
} from "./profiles";

describe("resolveTemplateKey", () => {
  test("normalizes common aliases", () => {
    expect(resolveTemplateKey("react-vite")).toBe("react_vite");
    expect(resolveTemplateKey("html-css")).toBe("html_css");
    expect(resolveTemplateKey("next.js")).toBe("nextjs");
  });
});

describe("resolveLabRuntime", () => {
  test("prefers explicit template overrides", () => {
    const runtime = resolveLabRuntime({
      template: "gleam",
      language: "elixir",
    });

    expect(runtime.templateKey).toBe("gleam");
    expect(runtime.language).toBe("elixir");
    expect(runtime.templateEnvVarName).toBe("CSB_TEMPLATE_GLEAM_ID");
  });

  test("maps frameworks to the expected template", () => {
    expect(resolveLabRuntime({ framework: "sveltekit" }).templateKey).toBe(
      "sveltekit",
    );
    expect(resolveLabRuntime({ framework: "react" }).templateKey).toBe(
      "react_vite",
    );
    expect(resolveLabRuntime({ framework: "flask" }).templateKey).toBe(
      "python_flask_server",
    );
  });

  test("maps explicit languages to a base template", () => {
    expect(resolveLabRuntime({ language: "python" }).templateKey).toBe("python");
    expect(resolveLabRuntime({ language: "elixir" }).templateKey).toBe("elixir");
    expect(resolveLabRuntime({ language: "gleam" }).templateKey).toBe("gleam");
  });

  test("keeps official template ids for runtime fallback", () => {
    expect(getLabTemplateDefinition("react_vite").officialTemplateId).toBe(
      "kd848j",
    );
    expect(getLabTemplateDefinition("elixir").officialTemplateId).toBe(
      "9k9tmw",
    );
  });

  test("falls back to javascript when no signal is present", () => {
    const runtime = resolveLabRuntime({});

    expect(runtime.templateKey).toBe("javascript");
    expect(runtime.language).toBe("javascript");
  });
});
