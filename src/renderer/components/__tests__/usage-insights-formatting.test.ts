import { describe, expect, it } from "vitest";

import { formatUsageCount } from "../usageInsightsFormatting";

describe("formatUsageCount", () => {
  it("renders counts with a multiplication sign instead of the escaped token text", () => {
    expect(formatUsageCount(22)).toBe("22×");
    expect(formatUsageCount(22)).not.toContain("\\u00D7");
  });
});
