import { describe, expect, it } from "vitest";

import { resolveExecutorLifetimeTurnCap, TaskExecutor } from "../executor";

describe("executor performance budgets", () => {
  it("caps ordinary adaptive tasks well below legacy runaway limits", () => {
    expect(
      resolveExecutorLifetimeTurnCap({
        isDeepWorkTask: false,
        maxGlobalTurns: null,
        settingsLifetimeCap: 500,
        configuredLifetimeCap: null,
      }),
    ).toBe(32);
  });

  it("keeps an intentionally larger but bounded deep-work window", () => {
    expect(
      resolveExecutorLifetimeTurnCap({
        isDeepWorkTask: true,
        maxGlobalTurns: null,
        settingsLifetimeCap: 500,
        configuredLifetimeCap: null,
      }),
    ).toBe(240);
  });

  it("honors tighter guardrails and explicit per-task overrides", () => {
    expect(
      resolveExecutorLifetimeTurnCap({
        isDeepWorkTask: false,
        maxGlobalTurns: null,
        settingsLifetimeCap: 30,
        configuredLifetimeCap: null,
      }),
    ).toBe(30);
    expect(
      resolveExecutorLifetimeTurnCap({
        isDeepWorkTask: false,
        maxGlobalTurns: null,
        settingsLifetimeCap: 30,
        configuredLifetimeCap: 120,
      }),
    ).toBe(120);
  });

  it("keeps ordinary stalled tool-bearing model calls capped at 150 seconds", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.getExpectedOutputTokensPerSecond = () => 1;

    expect(executor.getRetryTimeoutMs(120_000, 0, true, 8_000)).toBe(
      150_000,
    );
  });

  it("reserves step time for recovery after a large artifact model call", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.getExpectedOutputTokensPerSecond = () => 1;

    expect(executor.getRetryTimeoutMs(120_000, 0, true, 16_000)).toBe(
      210_000,
    );
  });
});
