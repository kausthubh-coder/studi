import { describe, expect, it } from "vitest";
import {
  getModelConfig,
  listModelProfiles,
  openRouterReasoningProviderOptions,
} from "@/lib/model-config";

describe("model config", () => {
  it("uses Sonnet 4.6 for every active model role", () => {
    for (const profile of listModelProfiles()) {
      const { providerOptions: _providerOptions, ...models } =
        getModelConfig(profile);

      expect(Object.values(models)).toEqual(
        expect.arrayContaining(
          Array.from({ length: 5 }, () => "anthropic/claude-sonnet-4.6"),
        ),
      );
      expect(new Set(Object.values(models))).toEqual(
        new Set(["anthropic/claude-sonnet-4.6"]),
      );
    }
  });

  it("centralizes OpenRouter medium reasoning provider options", () => {
    expect(openRouterReasoningProviderOptions).toEqual({
      openrouter: {
        reasoning: {
          effort: "medium",
        },
      },
    });
  });
});
