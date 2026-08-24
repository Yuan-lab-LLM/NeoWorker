import { describe, expect, it } from "vitest";

import { defaultStepLoopBudget } from "../LoopBudgetPolicy";

describe("defaultStepLoopBudget", () => {
  it("keeps an ordinary step bounded while allowing both malformed-argument recoveries", () => {
    expect(defaultStepLoopBudget()).toEqual({
      maxIterations: 8,
      maxLlmCalls: 8,
      maxRecoveredResponses: 2,
      maxRepeatedIterations: 2,
      maxContextRecoveries: 1,
      maxMaxTokenRecoveries: 1,
    });
  });
});
