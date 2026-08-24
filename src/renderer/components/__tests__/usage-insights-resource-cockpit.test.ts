import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cockpitSource = readFileSync(
  new URL("../UsageInsightsResourceCockpit.tsx", import.meta.url),
  "utf8",
);

describe("UsageInsightsResourceCockpit", () => {
  it("shows measurable usage without presenting an unreliable cost", () => {
    expect(cockpitSource).toContain("totalCompletionTokens");
    expect(cockpitSource).toContain("totalToolCalls");
    expect(cockpitSource).not.toContain("formatCurrency");
    expect(cockpitSource).not.toContain("costMetrics.totalCost");
    expect(cockpitSource).not.toContain("Expenses for this period");
  });
});
