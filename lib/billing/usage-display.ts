type MonthlyUsageInput = {
  textAiCostUsd: number;
  textAiCostUsdLimit: number;
  textPromptCount: number;
};

function nonNegativeFinite(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function buildMonthlyUsageDisplay(input: MonthlyUsageInput) {
  const used = nonNegativeFinite(input.textAiCostUsd);
  const limit = nonNegativeFinite(input.textAiCostUsdLimit);
  const rawPercent = limit > 0 ? (used / limit) * 100 : 0;
  const percent = Math.min(100, Math.max(0, Math.round(rawPercent)));
  const promptCount = Math.max(
    0,
    Math.floor(nonNegativeFinite(input.textPromptCount)),
  );

  return {
    percent,
    capacityLabel: `${percent}% of monthly AI capacity used`,
    promptLabel: `${promptCount} chat prompt${promptCount === 1 ? "" : "s"} sent`,
    explanation:
      "Chat prompts are counted separately. Tutor replies and Sparks also use the shared monthly AI capacity.",
  } as const;
}
