import { describe, expect, it } from "vitest";
import { GuardrailManager } from "../guardrail-manager";

describe("GuardrailManager defaults", () => {
  it("starts tasks without configurable resource ceilings", () => {
    const defaults = GuardrailManager.getDefaults();

    expect(defaults.tokenBudgetEnabled).toBe(false);
    expect(defaults.iterationLimitEnabled).toBe(false);
    expect(defaults.fileSizeLimitEnabled).toBe(false);
  });
});
