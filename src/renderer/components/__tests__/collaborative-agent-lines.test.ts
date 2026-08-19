import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { AgentTeamRun, Task, TaskEvent } from "../../../shared/types";
import { CollaborativeAgentLines } from "../CollaborativeAgentLines";

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

function makeRun(overrides: Partial<AgentTeamRun> = {}): AgentTeamRun {
  return {
    id: "run-1",
    rootTaskId: "parent-1",
    status: "running",
    createdAt: 1740840900000,
    updatedAt: 1740840900000,
    ...overrides,
  } as AgentTeamRun;
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "child-1",
    parentTaskId: "parent-1",
    title: "Context and Scope",
    prompt: "Investigate issue",
    status: "executing",
    workspaceId: "workspace-1",
    createdAt: 1740840900000,
    updatedAt: 1740840900000,
    ...overrides,
  } as Task;
}

function makeEvent(
  type: TaskEvent["type"],
  timestamp: number,
  payload: Record<string, unknown>,
  overrides: Partial<TaskEvent> = {},
): TaskEvent {
  return {
    id: `${type}-${timestamp}`,
    taskId: "child-1",
    timestamp,
    type,
    payload,
    schemaVersion: 2,
    ...overrides,
  } as TaskEvent;
}

function renderLines(childTask: Task, childEvents: TaskEvent[]): string {
  return render(
    React.createElement(CollaborativeAgentLines, {
      collaborativeRun: makeRun(),
      childTasks: [childTask],
      childEvents,
      onOpenAgent: () => undefined,
      mainTaskCompleted: true,
    }),
  );
}

describe("CollaborativeAgentLines", () => {
  it("renders an accessible collapse control above the expert list", () => {
    const markup = renderLines(
      makeTask({ title: "Anansi (builder)", status: "executing" }),
      [],
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-label="折叠"');
    expect(markup).toContain('class="collab-lines-toggle"');
    expect(markup).toMatch(/aria-controls="[^"]+"/);
  });

  it("shows completed for a finished subagent instead of a later DELIVER stage start", () => {
    const markup = renderLines(
      makeTask({ status: "completed", completedAt: 1740841080000 }),
      [
        makeEvent("step_completed", 1740841020000, {
          description: "Collect evidence",
        }),
        makeEvent(
          "timeline_group_started",
          1740841080000,
          { stage: "DELIVER", message: "Starting DELIVER" },
          { groupId: "stage:deliver" },
        ),
      ],
    );

    expect(markup).toContain("1 个完成");
    expect(markup).not.toContain("Starting DELIVER");
  });

  it("surfaces failed terminal subagent status with the latest failure label", () => {
    const markup = renderLines(
      makeTask({ status: "failed", error: "Network lookup failed" }),
      [
        makeEvent("step_failed", 1740841020000, {
          description: "Fetch upstream release",
        }),
        makeEvent(
          "timeline_group_started",
          1740841080000,
          { stage: "DELIVER", message: "Starting DELIVER" },
          { groupId: "stage:deliver" },
        ),
      ],
    );

    expect(markup).toContain("失败：Fetch upstream release");
    expect(markup).not.toContain("Starting DELIVER");
  });

  it("shows warnings for partial-success subagents", () => {
    const markup = renderLines(
      makeTask({
        status: "completed",
        terminalStatus: "partial_success",
        completedAt: 1740841080000,
      }),
      [
        makeEvent("step_failed", 1740841020000, {
          description: "Optional changelog lookup",
        }),
        makeEvent("task_completed", 1740841080000, {
          terminalStatus: "partial_success",
        }),
      ],
    );

    expect(markup).toContain("部分完成");
    expect(markup).toContain("查看问题");
    expect(markup).not.toContain("需要审核");
  });

  it.each([
    ["needs_user_action", "需要你处理"],
    ["awaiting_approval", "等待批准"],
    ["resume_available", "可继续"],
  ] as const)(
    "shows %s with its real action state",
    (terminalStatus, label) => {
      const markup = renderLines(
        makeTask({ status: "completed", terminalStatus }),
        [],
      );

      expect(markup).toContain(label);
      expect(markup).toContain(
        terminalStatus === "needs_user_action"
          ? "去处理"
          : terminalStatus === "awaiting_approval"
            ? "去批准"
            : "继续",
      );
      expect(markup).not.toContain("需要审核");
    },
  );

  it("shows per-agent terminal chips and aggregate counts", () => {
    const markup = render(
      React.createElement(CollaborativeAgentLines, {
        collaborativeRun: makeRun(),
        childTasks: [
          makeTask({
            id: "child-1",
            title: "Finished lane",
            status: "completed",
            completedAt: 1740841080000,
          }),
          makeTask({
            id: "child-2",
            title: "Broken lane",
            status: "failed",
            error: "Command failed",
          }),
        ],
        childEvents: [
          makeEvent(
            "step_failed",
            1740841020000,
            { description: "Run verification" },
            { taskId: "child-2" },
          ),
        ],
        onOpenAgent: () => undefined,
        onWrapUp: () => undefined,
        mainTaskCompleted: false,
      }),
    );

    expect(markup).toContain("1 个完成 · 1 个失败");
    expect(markup).toContain(">完成<");
    expect(markup).toContain(">失败<");
    expect(markup).not.toContain("failures need review");
    expect(markup).toContain("收尾");
  });

  it("localizes built-in finance agent names", () => {
    const markup = renderLines(
      makeTask({ title: "Research/Data Reader", status: "completed" }),
      [],
    );

    expect(markup).toContain("研究/数据读取员");
    expect(markup).not.toContain(">Research/Data Reader<");
  });

  it("shows generated callsigns as clear Chinese expert roles", () => {
    const markup = renderLines(
      makeTask({ title: "Anansi (builder)", status: "executing" }),
      [],
    );

    expect(markup).toContain("方案构建专家");
    expect(markup).toContain("负责实现方案、搭建产出并完成交付");
    expect(markup).toContain("Anansi");
    expect(markup).not.toContain("(builder)");
  });
});
