import { describe, expect, it, vi } from "vitest";
import { TaskExecutor } from "../executor";

describe("TaskExecutor HTML tool availability", () => {
  it("keeps the deterministic Markdown-to-HTML converter exposed for explicit HTML requests", () => {
    const executor = Object.create(TaskExecutor.prototype) as Any;
    executor.task = {
      id: "html-follow-up",
      title: "Existing research report",
      prompt: "Research the market",
      agentConfig: {},
    };
    executor.lastUserMessage = "生成一个 HTML 格式文件";
    executor.lastAssistantOutput = "The report is available as Markdown.";
    executor.currentStepId = null;
    executor.plan = null;
    executor.toolUsageCounts = new Map();
    executor.hasTaskToolAllowlistConfigured = vi.fn().mockReturnValue(false);
    executor.getToolPolicyContext = vi.fn().mockReturnValue({});
    executor.isVisualCanvasTask = vi.fn().mockReturnValue(false);
    executor.emitEvent = vi.fn();

    const converter = {
      name: "convert_markdown_to_html",
      runtime: { exposure: "deferred" },
    };

    const filtered = executor.applyAdaptiveToolAvailabilityFilter([converter]);

    expect(filtered).toEqual([converter]);
  });
});
