import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MCTopBar } from "../MCTopBar";

const createTopBarData = (overrides: Record<string, unknown> = {}) =>
  ({
    workspaces: [],
    selectedWorkspaceId: "__all__",
    setSelectedWorkspaceId: () => {},
    companies: [],
    selectedCompanyId: null,
    setSelectedCompanyId: () => {},
    activeAgentsCount: 0,
    queueStatusState: "ready",
    runtimeRunningCount: 0,
    runtimeQueuedCount: 0,
    isRefreshing: false,
    handleManualRefresh: () => {},
    selectedWorkspace: null,
    setStandupOpen: () => {},
    setTeamsOpen: () => {},
    setReviewsOpen: () => {},
    activeTab: "board",
    setActiveTab: () => {},
    selectedCompany: null,
    currentTime: new Date("2026-07-22T09:00:00+08:00"),
    agentContext: { getUiCopy: () => "Standup" },
    missionControlItems: [],
    ...overrides,
  }) as Any;

describe("MCTopBar information architecture", () => {
  it("renders a single Task page without page-level tabs", () => {
    const markup = renderToStaticMarkup(
      React.createElement(MCTopBar, {
        data: createTopBarData(),
      }),
    );

    expect(markup).toContain("<h1>运行中心</h1>");
    expect(markup).toContain("长任务、自动化和需要你介入的工作");
    expect(markup).toContain("普通对话不会显示在这里");
    expect(markup).not.toContain("NeoWorker 工作链路");
    expect(markup).not.toContain(">团队</button>");
    expect(markup).not.toContain("mc-command-tabs");
    expect(markup).not.toContain(">简报</button>");
    expect(markup).not.toContain(">全部工作</button>");
    expect(markup).not.toContain(">智能洞察</button>");
    expect(markup).not.toContain('role="menu"');
    expect(markup).not.toContain("快捷入口");
    expect(markup).not.toContain("工作区工具");
    expect(markup).not.toContain("lucide-ellipsis");
    expect(markup).not.toContain("能力中心");
    expect(markup).not.toContain("管理公司");
  });

  it("keeps the selected workspace visible without a shortcut menu", () => {
    const workspace = { id: "workspace-1", name: "产品团队" };
    const markup = renderToStaticMarkup(
      React.createElement(MCTopBar, {
        data: createTopBarData({
          workspaces: [workspace],
          selectedWorkspaceId: workspace.id,
          selectedWorkspace: workspace,
        }),
      }),
    );

    expect(markup).toContain("产品团队");
    expect(markup).not.toContain('role="menu"');
    expect(markup).not.toContain("工作简报");
    expect(markup).not.toContain("请先选择具体工作区");
  });

  it("keeps company controls hidden while preserving company-backed data", () => {
    const company = { id: "company-1", name: "本地公司" };
    const markup = renderToStaticMarkup(
      React.createElement(MCTopBar, {
        data: createTopBarData({
          companies: [company],
          selectedCompanyId: company.id,
          selectedCompany: company,
        }),
      }),
    );

    expect(markup).not.toContain("本地公司");
    expect(markup).not.toContain("管理公司");
    expect(
      markup.match(/mc-v2-selector mc-command-context-menu/g),
    ).toHaveLength(1);
  });
});
