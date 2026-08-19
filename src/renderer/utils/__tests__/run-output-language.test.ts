import { describe, expect, it } from "vitest";

import {
  buildManagedAgentRunPrompt,
  stripRunOutputLanguageRequirement,
  withRunOutputLanguage,
} from "../run-output-language";

describe("run output language", () => {
  it("requires Chinese output when the interface is Chinese", () => {
    const prompt = buildManagedAgentRunPrompt("Market Researcher", "zh-CN");

    expect(prompt).toContain("运行“Market Researcher”已配置的工作流");
    expect(prompt).toContain("全程使用简体中文");
  });

  it("does not duplicate the Chinese output requirement", () => {
    const once = withRunOutputLanguage("分析市场", "zh-CN");
    const twice = withRunOutputLanguage(once, "zh-CN");

    expect(twice).toBe(once);
  });

  it("keeps English runs concise in the English interface", () => {
    expect(buildManagedAgentRunPrompt("Market Researcher", "en")).toBe(
      "Run the configured workflow for Market Researcher.",
    );
  });

  it("hides the internal language requirement from the user-facing prompt", () => {
    const prompt = withRunOutputLanguage("分析市场", "zh-CN");

    expect(stripRunOutputLanguageRequirement(prompt)).toBe("分析市场");
  });
});
