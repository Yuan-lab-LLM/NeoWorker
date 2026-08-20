import { describe, it, expect } from "vitest";
import { formatProviderErrorForDisplay } from "../provider-error-format";
import type { Task } from "../types";

describe("formatProviderErrorForDisplay", () => {
  it("returns friendly message for free-models-per-min rate limit (manual task)", () => {
    const msg =
      "OpenRouter API error: 429 Too Many Requests - Rate limit exceeded: free-models-per-min.";
    expect(formatProviderErrorForDisplay(msg)).toContain("Rate limit exceeded");
    expect(formatProviderErrorForDisplay(msg)).toContain("OpenRouter API key");
    expect(formatProviderErrorForDisplay(msg)).toContain("Settings");
  });

  it("returns short message for rate limit when task is automated", () => {
    const msg = "429 Too Many Requests - Rate limit exceeded: free-models-per-min.";
    const cronTask = { source: "cron" } as Task;
    const improvementTask = { source: "improvement" } as Task;
    expect(formatProviderErrorForDisplay(msg, { task: cronTask })).toBe(
      "Rate limit exceeded. Will retry automatically.",
    );
    expect(formatProviderErrorForDisplay(msg, { task: improvementTask })).toBe(
      "Rate limit exceeded. Will retry automatically.",
    );
  });

  it("returns friendly message for generic 429 (manual)", () => {
    const msg = "429 Too Many Requests";
    expect(formatProviderErrorForDisplay(msg)).toContain("Rate limit exceeded");
    expect(formatProviderErrorForDisplay(msg)).toContain("try again");
  });

  it("passes through non-rate-limit errors", () => {
    const msg = "Invalid API key provided";
    expect(formatProviderErrorForDisplay(msg)).toBe(msg);
  });

  it("returns Provider error for empty input", () => {
    expect(formatProviderErrorForDisplay("")).toBe("Provider error");
    expect(formatProviderErrorForDisplay("   ")).toBe("Provider error");
  });
});
