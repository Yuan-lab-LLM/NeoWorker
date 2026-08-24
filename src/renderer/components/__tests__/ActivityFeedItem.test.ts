import { describe, expect, it } from "vitest";

import { formatActivityDescriptionForDisplay } from "../ActivityFeedItem";

describe("formatActivityDescriptionForDisplay", () => {
  it("explains verification failures in plain Chinese", () => {
    expect(
      formatActivityDescriptionForDisplay(
        {
          activityType: "error",
          title: "Task error",
          description:
            "Task missing verification evidence: no completed review/verification step or review-backed conclusion was detected.",
        },
        "zh-CN",
      ),
    ).toBe("任务结束前没有完成审查或验证步骤，系统无法确认结果是否可靠。");
  });

  it("turns JSON parser errors into an actionable Chinese explanation", () => {
    expect(
      formatActivityDescriptionForDisplay(
        {
          activityType: "error",
          title: "Task error",
          description:
            "Expected ',' or '}' after property value in JSON at position 1487 (line 1 column 1488)",
        },
        "zh-CN",
      ),
    ).toBe(
      "JSON 数据格式错误：第 1 行、第 1488 列附近的结构不完整，请检查逗号、引号或括号。",
    );
  });

  it("describes tool calls and model roles in Chinese", () => {
    expect(
      formatActivityDescriptionForDisplay(
        {
          activityType: "tool_used",
          title: "Tool used",
          description: "read_file",
        },
        "zh-CN",
      ),
    ).toBe("调用工具：读取文件内容");

    expect(
      formatActivityDescriptionForDisplay(
        {
          activityType: "info",
          title: "Model routing updated",
          description: "Reviewer/Critic",
        },
        "zh-CN",
      ),
    ).toBe("本次任务的执行角色已调整为审核/质检员。");
  });

  it("keeps original descriptions in non-Chinese locales", () => {
    expect(
      formatActivityDescriptionForDisplay(
        {
          activityType: "error",
          title: "Task error",
          description: "Task missing verification evidence",
        },
        "en",
      ),
    ).toBe("Task missing verification evidence");
  });
});
