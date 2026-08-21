import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AgentRoleData } from "../../../../electron/preload";
import type { Task } from "../../../../shared/types";
import {
  getTaskBoardContentMode,
  isTaskDeletionBlocked,
  MCBoardTab,
  shouldVirtualizeTaskList,
} from "../MCBoardTab";
import {
  getTaskBoardView,
  shouldShowTaskInRunCenter,
} from "../task-board-view";
import type { MissionControlData } from "../useMissionControlData";

function renderBoard(
  data: MissionControlData,
  props: Partial<React.ComponentProps<typeof MCBoardTab>> = {},
): string {
  return renderToStaticMarkup(
    React.createElement(MCBoardTab, { data, ...props }),
  );
}

function makeAgent(overrides: Partial<AgentRoleData> = {}): AgentRoleData {
  return {
    id: "agent-1",
    name: "agent-1",
    displayName: "Project Manager",
    description: "Keeps work moving",
    icon: "Bot",
    color: "#8b5cf6",
    isActive: true,
    isSystem: false,
    capabilities: ["plan"],
    autonomyLevel: "lead",
    systemPrompt: "",
    createdAt: Date.UTC(2026, 3, 11, 12, 0, 0),
    updatedAt: Date.UTC(2026, 3, 11, 12, 0, 0),
    ...overrides,
  } as AgentRoleData;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Subconscious: Project Manager",
    prompt: "Review the backlog",
    status: "queued",
    boardColumn: "backlog",
    assignedAgentRoleId: "agent-1",
    createdAt: Date.UTC(2026, 3, 11, 12, 0, 0),
    updatedAt: Date.UTC(2026, 3, 11, 12, 15, 0),
    workspaceId: "ws-1",
    labels: [],
    priority: 0,
    estimatedMinutes: 30,
    source: "subconscious",
    ...overrides,
  } as Task;
}

function makeData(taskOverrides: Partial<Task> = {}): MissionControlData {
  const agent = makeAgent();
  const task = makeTask(taskOverrides);

  return {
    agents: [agent],
    tasks: [task],
    taskLabels: [],
    workspaces: [{ id: "ws-1", name: "Workspace One" }],
    detailPanel: null,
    dragOverColumn: null,
    setDetailPanel: () => {},
    setDragOverColumn: () => {},
    getAgent: (agentRoleId?: string | null) =>
      agentRoleId === agent.id ? agent : null,
    getAgentStatus: () => "idle",
    handleMoveTask: async () => {},
    handleTriggerHeartbeat: async () => {},
    handleSetTaskPriority: async () => {},
    formatRelativeTime: () => "just now",
    formatTaskEstimate: () => "30m",
    getTaskDueInfo: () => null,
    getTaskPriorityMeta: (priority?: number) => ({
      value: priority ?? 0,
      label: "Priority",
      color: "#b91c1c",
      shortLabel: `P${priority ?? 0}`,
    }),
    getMissionColumnForTask: () => "assigned",
    getTaskLabels: () => [],
    getTaskAttentionReason: (candidate: Task) =>
      candidate.terminalStatus === "awaiting_approval"
        ? "Awaiting approval"
        : null,
    getTaskNextMissionColumn: () => "in_progress",
    isTaskTerminal: () => false,
    isTaskStale: () => false,
    isTaskAttentionRequired: (candidate: Task) =>
      candidate.terminalStatus === "awaiting_approval",
    agentContext: {
      getUiCopy: (_key: string) => "No tasks yet",
    },
    isAllWorkspacesSelected: false,
    getWorkspaceName: () => "Workspace One",
  } as unknown as MissionControlData;
}

describe("MCBoardTab", () => {
  it("shows the calendar even when the selected task view is empty", () => {
    expect(getTaskBoardContentMode("calendar", 0)).toBe("calendar");
    expect(getTaskBoardContentMode("calendar", 12)).toBe("calendar");
    expect(getTaskBoardContentMode("list", 0)).toBe("empty");
    expect(getTaskBoardContentMode("list", 12)).toBe("list");
  });

  it("virtualizes the task list at the 500-row requirement boundary", () => {
    expect(shouldVirtualizeTaskList(499)).toBe(false);
    expect(shouldVirtualizeTaskList(500)).toBe(true);
    expect(shouldVirtualizeTaskList(5_000)).toBe(true);
  });

  it("assigns every task to exactly one primary task view", () => {
    const isTerminal = (task: Task) =>
      ["completed", "failed", "cancelled", "interrupted"].includes(task.status);
    const needsAttention = (task: Task) =>
      ["blocked", "failed", "interrupted"].includes(task.status);

    expect(
      getTaskBoardView(
        makeTask({ status: "executing" }),
        isTerminal,
        needsAttention,
      ),
    ).toBe("active");
    expect(
      getTaskBoardView(
        makeTask({ status: "blocked" }),
        isTerminal,
        needsAttention,
      ),
    ).toBe("attention");
    expect(
      getTaskBoardView(
        makeTask({ status: "failed" }),
        isTerminal,
        needsAttention,
      ),
    ).toBe("attention");
    expect(
      getTaskBoardView(
        makeTask({ status: "interrupted" }),
        isTerminal,
        needsAttention,
      ),
    ).toBe("attention");
    expect(
      getTaskBoardView(
        makeTask({ status: "completed" }),
        isTerminal,
        needsAttention,
      ),
    ).toBe("history");
    expect(
      getTaskBoardView(
        makeTask({ status: "cancelled" }),
        isTerminal,
        needsAttention,
      ),
    ).toBe("history");
  });

  it("keeps ordinary completed chats out of the run center", () => {
    expect(
      shouldShowTaskInRunCenter(
        makeTask({
          status: "completed",
          source: "manual",
          assignedAgentRoleId: undefined,
          boardColumn: "backlog",
          estimatedMinutes: undefined,
        }),
      ),
    ).toBe(false);
  });

  it("does not duplicate a newly started ordinary chat in the run center", () => {
    const now = Date.UTC(2026, 3, 11, 12, 4, 0);
    expect(
      shouldShowTaskInRunCenter(
        makeTask({
          status: "executing",
          source: "manual",
          assignedAgentRoleId: undefined,
          boardColumn: "backlog",
          estimatedMinutes: undefined,
          createdAt: now - 30_000,
        }),
        now,
      ),
    ).toBe(false);
  });

  it("keeps live, automated, explicitly managed, and meaningful failed work", () => {
    const now = Date.UTC(2026, 3, 11, 12, 10, 0);
    expect(
      shouldShowTaskInRunCenter(
        makeTask({
          status: "executing",
          source: "manual",
          assignedAgentRoleId: undefined,
          boardColumn: "backlog",
          estimatedMinutes: undefined,
          createdAt: now - 6 * 60_000,
        }),
        now,
      ),
    ).toBe(true);
    expect(
      shouldShowTaskInRunCenter(
        makeTask({ status: "completed", source: "cron" }),
      ),
    ).toBe(true);
    expect(
      shouldShowTaskInRunCenter(
        makeTask({
          status: "completed",
          source: "manual",
          assignedAgentRoleId: "agent-1",
          dueDate: now + 60_000,
        }),
      ),
    ).toBe(true);
    expect(
      shouldShowTaskInRunCenter(
        makeTask({
          status: "failed",
          source: "manual",
          assignedAgentRoleId: undefined,
          boardColumn: "backlog",
          estimatedMinutes: undefined,
          lastRunDurationMs: 90_000,
        }),
      ),
    ).toBe(true);
  });

  it("uses task-status tabs and a compact operational summary", () => {
    const markup = renderBoard(makeData());

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="任务视图"');
    expect(markup).toContain('class="mc-task-tab active"');
    expect(markup).toContain('class="mc-task-tab-count"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain(">进行中</span>");
    expect(markup).toContain(">需要处理</span>");
    expect(markup).toContain(">历史</span>");
    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('aria-label="任务概况"');
    expect(markup).toContain(">执行中</strong>");
    expect(markup).toContain(">等待开始</strong>");
    expect(markup).toContain(">暂停 / 停滞</strong>");
    expect(markup).not.toContain(">待分配</strong>");
    expect(markup).not.toContain("任务范围");
    expect(markup).not.toContain("全部任务");
    expect(markup).not.toContain("mc-v2-board-presets");
    expect(markup).not.toContain("全部智能体");
    expect(markup).not.toContain("全部标签");
    expect(markup).not.toContain("全部状态");
    expect(markup).not.toContain("显示空列");
  });

  it("shows localized agent names on the task board", () => {
    const markup = renderBoard(makeData());

    expect(markup).toContain(">项目经理</strong>");
  });

  it("routes creation to the automation workspace instead of duplicating chat creation", () => {
    const markup = renderBoard(makeData(), {
      onOpenAutomations: () => {},
      onOpenTask: async () => {},
    });

    expect(markup).toContain("定时与自动化");
    expect(markup).not.toContain("新建任务");
    expect(markup).not.toContain("关联已有任务");
    expect(markup).toContain("打开任务");
  });

  it("offers a meaningful priority filter instead of unexplained priority codes", () => {
    const markup = renderBoard(makeData({ priority: 4 }));

    expect(markup).toContain('aria-label="按优先级筛选"');
    expect(markup).toContain(">全部优先级</span>");
    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).not.toContain("<datalist");
    expect(markup).not.toContain('title="优先级：紧急"');
    expect(markup).toContain(">紧急</span>");
    expect(markup).toContain("mc-task-row-priority-menu");
  });

  it("keeps priority directly available without a redundant row menu", () => {
    const markup = renderBoard(makeData());

    expect(markup).toContain(">负责人 / 工作区</span>");
    expect(markup).toContain(">更新时间</span>");
    expect(markup).toContain(">优先级</span>");
    expect(markup).toContain(">操作</span>");
    expect(markup).toContain("mc-task-row-priority");
    expect(markup).toContain("lucide-flag");
    expect(markup).not.toContain("mc-task-row-menu");
    expect(markup).not.toContain("mc-task-more-trigger");
    expect(markup).not.toContain("lucide-ellipsis");
    expect(markup).not.toContain("查看任务详情");
    expect(markup).not.toContain("调整优先级");
    expect(markup).toContain("mc-task-row-scope");
    expect(markup).not.toContain("mc-task-row-avatar");
  });

  it("keeps the same compact priority control for unassigned tasks", () => {
    const markup = renderBoard(makeData({ assignedAgentRoleId: undefined }));

    expect(markup).toContain("lucide-flag");
    expect(markup).toContain("mc-task-row-priority-menu");
    expect(markup).not.toContain("mc-task-more-trigger");
    expect(markup).not.toContain("mc-task-row-menu");
  });

  it("moves single and batch deletions into the seven-day recovery flow", () => {
    const markup = renderBoard(makeData());

    expect(markup).toContain("批量管理");
    expect(markup).toContain(
      'aria-label="将“Subconscious: Project Manager”移到最近删除"',
    );
    expect(markup).toContain("lucide-trash-2");
    expect(markup).not.toContain("mc-task-row-menu");
    expect(markup).not.toContain("lucide-ellipsis");
  });

  it("prevents deletion while a task is actively running", () => {
    expect(isTaskDeletionBlocked("executing")).toBe(true);
    expect(isTaskDeletionBlocked("planning")).toBe(true);
    expect(isTaskDeletionBlocked("running")).toBe(true);
    expect(isTaskDeletionBlocked("queued")).toBe(false);
    expect(isTaskDeletionBlocked("failed")).toBe(false);
    expect(isTaskDeletionBlocked("completed")).toBe(false);
  });

  it("offers list and calendar displays and shows the exact update time", () => {
    const markup = renderBoard(makeData());

    expect(markup).toContain('aria-label="任务展示方式"');
    expect(markup).toContain('aria-label="列表视图"');
    expect(markup).toContain('aria-label="日历视图"');
    expect(markup).toContain(">列表</span>");
    expect(markup).toContain(">日历</span>");
    expect(markup).toContain("mc-task-row-time-exact");
    expect(markup).toContain("2026");
    expect(markup).toContain("04");
    expect(markup).toContain("11");
  });
});
