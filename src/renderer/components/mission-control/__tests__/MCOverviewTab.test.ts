import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "../../../../shared/types";
import { MCOverviewTab } from "../MCOverviewTab";
import type { MissionControlData } from "../useMissionControlData";

function renderOverview(overrides: Partial<MissionControlData> = {}): string {
  const tasks = (overrides.tasks || []) as Task[];
  const data = {
    missionControlBrief: null,
    activeAgentsCount: 2,
    totalTasksInQueue: tasks.filter((task) => task.status !== "completed")
      .length,
    pendingMentionsCount: 0,
    queueStatusState: "ready",
    runtimeRunningCount: 0,
    runtimeQueuedCount: 4,
    runtimeRunningTaskIds: [],
    commandCenterReviewQueue: [],
    formatRelativeTime: () => "just now",
    setActiveTab: vi.fn(),
    setDetailPanel: vi.fn(),
    loadMissionControlIntelligence: vi.fn(),
    selectedWorkspaceId: "ws-1",
    tasks,
    agents: [],
    tasksByAgent: new Map(),
    getAgent: () => undefined,
    getAgentStatus: () => "idle",
    getWorkspaceName: () => "Workspace One",
    getMissionColumnForTask: (task: Task) =>
      task.status === "executing" ? "in_progress" : "assigned",
    isTaskAttentionRequired: (task: Task) => (task.priority || 0) >= 3,
    isTaskTerminal: (task: Task) =>
      ["completed", "failed", "cancelled", "interrupted"].includes(task.status),
    ...overrides,
  } as unknown as MissionControlData;

  return renderToStaticMarkup(React.createElement(MCOverviewTab, { data }));
}

describe("MCOverviewTab", () => {
  it("renders the daily orchestration brief and focused summary", () => {
    const markup = renderOverview();

    expect(markup).toContain("mc-command-briefing");
    expect(markup).toContain("今天的工作进展已整理完成");
    expect(markup).toContain("等待你的判断");
  });

  it("promotes attention-required work into the focus list", () => {
    const now = Date.now();
    const markup = renderOverview({
      tasks: [
        {
          id: "task-urgent",
          title: "Approve customer refund",
          status: "executing",
          priority: 4,
          createdAt: now - 60_000,
          updatedAt: now,
          workspaceId: "ws-1",
        },
      ] as Task[],
    });

    expect(markup).toContain("处理优先事项");
    expect(markup).toContain("Approve customer refund");
    expect(markup).toContain("mc-command-focus-row");
  });

  it("renders active work from the real task collection", () => {
    const now = Date.now();
    const markup = renderOverview({
      tasks: [
        {
          id: "task-active",
          title: "Prepare weekly brief",
          status: "executing",
          priority: 1,
          createdAt: now - 60_000,
          updatedAt: now,
          workspaceId: "ws-1",
        },
      ] as Task[],
    });

    expect(markup).toContain("mc-command-schedule-row");
    expect(markup).toContain("Prepare weekly brief");
    expect(markup).toContain("执行中");
  });

  it("tolerates a brief while its sections are still loading", () => {
    const markup = renderOverview({
      missionControlBrief: {
        generatedAt: Date.now(),
        latestDecisions: [],
      } as unknown as MissionControlData["missionControlBrief"],
    });

    expect(markup).toContain("mc-command-overview");
    expect(markup).toContain("今天的工作进展已整理完成");
  });
});
