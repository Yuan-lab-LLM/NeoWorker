import { describe, expect, it } from "vitest";

import { applyPersistedLanguage } from "../../i18n";
import { deriveTaskHeaderPresentation } from "../../components/MainContent/task-event-presentation";
import {
  getManagedAgentPromptForDisplay,
  getManagedAgentTaskTitleForDisplay,
} from "../mission-control-copy";

const INTERNAL_PROMPT = [
  "Run a read-only market research workflow. Compare sources and produce a memo.",
  "",
  "Operating notes:",
  "Expected finance artifacts: docx, json.",
  "",
  "Preferred memory sources:",
  "- workspace",
  "- sessions",
  "",
  "User request:",
  "Run the configured workflow for Market Researcher.",
].join("\n");

describe("managed-agent display copy", () => {
  it("hides internal English engine context in Chinese", () => {
    applyPersistedLanguage("zh-CN");

    const display = getManagedAgentPromptForDisplay(INTERNAL_PROMPT);
    expect(display).toContain("运行“市场研究助手”已配置的工作流");
    expect(display).toContain("最终结果均使用简体中文");
    expect(display).not.toContain("Operating notes");
  });

  it("localizes titles from older agent runs", () => {
    applyPersistedLanguage("zh-CN");
    expect(getManagedAgentTaskTitleForDisplay("市场研究助手 agent test")).toBe(
      "市场研究助手 智能体测试",
    );
    expect(
      getManagedAgentTaskTitleForDisplay("Market Researcher agent test"),
    ).toBe("市场研究助手 智能体测试");
  });

  it("uses the localized prompt in the main task presentation", () => {
    applyPersistedLanguage("zh-CN");

    const presentation = deriveTaskHeaderPresentation({
      title: "市场研究助手 agent test",
      rawPrompt: INTERNAL_PROMPT,
    });
    expect(presentation.cleanedDisplayPrompt).toContain("市场研究助手");
    expect(presentation.cleanedDisplayPrompt).not.toContain("Operating notes");
    expect(presentation.headerTitle).toBe("市场研究助手 智能体测试");
  });

  it("shows only the user's goal for an automatically created team task", () => {
    applyPersistedLanguage("zh-CN");
    const rawPrompt = [
      "比较三个方案并给出建议。",
      "",
      "输出要求：全程使用简体中文完成分析、过程说明和最终结果；代码、文件名、产品名和必须保留的专业术语除外。",
    ].join("\n");

    const presentation = deriveTaskHeaderPresentation({
      title: "比较三个方案并给出建议。",
      rawPrompt,
    });

    expect(presentation.cleanedDisplayPrompt).toBe("比较三个方案并给出建议。");
    expect(presentation.cleanedDisplayPrompt).not.toContain("输出要求");
  });
});


it("hides historical team engine scaffolding without changing the request", () => {
  const request = "调研企业级 AI 工作站市场，核对来源并交付报告。";
  const prompt = `You are part of the team "Collab-1791129669764".\n\nTASK FOR INDEPENDENT ANALYSIS:\nTitle: 市场调研\n${request}\n\nAnalyze this task from your area of expertise.\nProvide thorough analysis.`;
  expect(getManagedAgentPromptForDisplay(prompt)).toBe(request);
  expect(getManagedAgentPromptForDisplay("请翻译这句话：You are part of the team" )).toContain("请翻译");
});
