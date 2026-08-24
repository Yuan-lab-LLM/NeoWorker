import { describe, it, expect } from "vitest";
import { classifyApp } from "../app-risk-profile";

describe("classifyApp", () => {
  it("classifies Safari as browser with view_only cap", () => {
    const p = classifyApp("com.apple.Safari", "Safari");
    expect(p.riskClass).toBe("browser");
    expect(p.maxSuggestedLevel).toBe("view_only");
    expect(p.sentinelWarning).toBeDefined();
  });

  it("classifies Terminal as terminal_ide with click_only cap", () => {
    const p = classifyApp("com.apple.Terminal", "Terminal");
    expect(p.riskClass).toBe("terminal_ide");
    expect(p.maxSuggestedLevel).toBe("click_only");
  });

  it("flags Finder with sentinel copy", () => {
    const p = classifyApp("com.apple.finder", "Finder");
    expect(p.riskClass).toBe("finder");
    expect(p.sentinelWarning).toMatch(/Finder/i);
  });
});
