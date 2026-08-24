import { describe, expect, it } from "vitest";
import { getLocalizedPluginTryAskingPrompt } from "../localized-plugin-prompts";

describe("localized plugin prompts", () => {
  it("localizes AI governance legal suggestions in Chinese", () => {
    const prompts = [
      "Use Ai Governance Legal Ai Inventory for this legal workflow",
      "Use Ai Governance Legal Aia Generation for this legal workflow",
      "Use Ai Governance Legal Cold Start Interview for this legal workflow",
      "Use Ai Governance Legal Customize for this legal workflow",
      "Use Ai Governance Legal Matter Workspace for this legal workflow",
    ];

    expect(
      prompts.map((prompt, index) =>
        getLocalizedPluginTryAskingPrompt(
          "ai-governance-legal-pack",
          prompt,
          index,
          "zh-CN",
        ),
      ),
    ).toEqual([
      "建立或查看 AI 系统清单",
      "生成一份 AI 影响评估（AIA）",
      "开始 AI 治理信息采集",
      "调整 AI 治理法务配置",
      "创建或切换法律事项工作区",
    ]);
  });

  it("keeps the executable prompt unchanged outside Chinese", () => {
    const prompt =
      "Use Ai Governance Legal Ai Inventory for this legal workflow";

    expect(
      getLocalizedPluginTryAskingPrompt(
        "ai-governance-legal-pack",
        prompt,
        0,
        "en",
      ),
    ).toBe(prompt);
  });

  it("uses the localized slash-command name for other plugin packs", () => {
    expect(
      getLocalizedPluginTryAskingPrompt(
        "commercial-legal-pack",
        "Use Commercial Legal Amendment History for this legal workflow",
        0,
        "zh-CN",
        "商业法务 · 修订历史",
      ),
    ).toBe("运行“商业法务 · 修订历史”工作流");
  });

  it("never falls back to an English pack prompt in the Chinese UI", () => {
    expect(
      getLocalizedPluginTryAskingPrompt(
        "third-party-pack",
        "Use the third-party workflow for this request.",
        0,
        "zh-CN",
      ),
    ).toBe("使用此能力组合开始一项新任务，并在执行前确认目标和交付要求。");
  });
});
