import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkSystemGuide } from "../WorkSystemGuide";

describe("WorkSystemGuide", () => {
  it("explains that automation and the everyday assistant are parallel work sources", () => {
    const markup = renderToStaticMarkup(
      React.createElement(WorkSystemGuide, {
        current: "assistant",
        onOpenTeam: () => {},
        onOpenAutomation: () => {},
        onOpenMission: () => {},
      }),
    );

    expect(markup).toContain('<nav class="work-system-guide"');
    expect(markup).toContain('aria-label="NeoWorker 工作链路"');
    expect(markup).toContain("四个模块，一套工作");
    expect(markup).toContain("配置执行者");
    expect(markup).toContain("发起工作");
    expect(markup).toContain("监督与结果");
    expect(markup).toContain("智能体团队");
    expect(markup).toContain("自动化");
    expect(markup).toContain("日常助理");
    expect(markup).toContain("任务中枢");
    expect(markup).toContain("也可以直接交办一项工作");
    expect(markup.match(/work-system-connector/g)).toHaveLength(2);
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('disabled=""');
  });
});
