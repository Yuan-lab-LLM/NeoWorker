import { describe, expect, it } from "vitest";
import { isCapabilityCatalogPlan } from "../plan-quality";

describe("isCapabilityCatalogPlan", () => {
  const catalog = [
    { description: "**文件与代码**：读写、搜索、管理工作区文件" },
    { description: "**网络**：搜索网页、抓取页面、浏览器自动化" },
    { description: "**终端**：执行命令行任务、构建项目、管理 git" },
    { description: "**macOS 原生**：AppleScript、日历、提醒事项" },
    { description: "**通信**：邮件、Slack、Telegram" },
    { description: "**云存储**：Google Drive、Dropbox、OneDrive" },
    { description: "**其他**：定时任务、记忆、并行子代理" },
  ];

  it("rejects a capability catalog masquerading as a task plan", () => {
    expect(isCapabilityCatalogPlan(catalog, "你好啊。你是谁啊")).toBe(true);
  });

  it("does not reject a concrete multi-step plan", () => {
    expect(
      isCapabilityCatalogPlan(
        [
          { description: "读取用户提供的销售数据" },
          { description: "清洗缺失值并计算关键指标" },
          { description: "生成趋势图和结论摘要" },
          { description: "导出最终分析报告" },
        ],
        "分析这份销售数据",
      ),
    ).toBe(false);
  });

  it("allows an explicit capability audit", () => {
    expect(isCapabilityCatalogPlan(catalog, "请测试并验证系统的所有工具能力")).toBe(false);
  });
});
