import {
  DEFAULT_USAGE_INSIGHTS_PERIOD_PRESET,
  getVisibleUsageInsightsPeriodPresets,
  USAGE_INSIGHTS_PERIOD_PRESETS,
} from "../usageInsightsPeriods";
import { describe, expect, it } from "vitest";

describe("usageInsightsPeriods", () => {
  it("offers a one-day preset before the existing defaults", () => {
    expect(
      USAGE_INSIGHTS_PERIOD_PRESETS.map(({ label }) => label).slice(0, 4),
    ).toEqual(["1d", "7d", "14d", "30d"]);
  });

  it("keeps 7d as the default selection", () => {
    expect(DEFAULT_USAGE_INSIGHTS_PERIOD_PRESET).toBe(7);
  });

  it("keeps short presets visible even when the data is newer than a week", () => {
    expect(
      getVisibleUsageInsightsPeriodPresets(2).map(({ value }) => value),
    ).toEqual([1, 7, "custom"]);
  });
});
