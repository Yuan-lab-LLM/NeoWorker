import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { Task } from "../../../../shared/types";
import {
  formatExactTaskTimestamp,
  getCalendarAnchorMonthForDay,
  getTaskCalendarDays,
  getTaskCalendarPlacement,
  MCTaskCalendarView,
} from "../MCTaskCalendarView";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Prepare release notes",
    prompt: "Summarize the release",
    status: "queued",
    workspaceId: "workspace-1",
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now(),
    ...overrides,
  } as Task;
}

describe("MCTaskCalendarView", () => {
  it("builds a six-week Monday-first calendar grid", () => {
    const anchor = new Date(2026, 6, 15).getTime();
    const days = getTaskCalendarDays(anchor, anchor);

    expect(days).toHaveLength(42);
    expect(days[0].date.getDay()).toBe(1);
    expect(days.some((day) => day.isToday)).toBe(true);
  });

  it("keeps current-month selections in place and navigates cross-month dates", () => {
    const august = new Date(2026, 7, 1).getTime();

    expect(
      getCalendarAnchorMonthForDay(august, new Date(2026, 7, 19).getTime()),
    ).toBe(august);
    expect(
      getCalendarAnchorMonthForDay(august, new Date(2026, 8, 1).getTime()),
    ).toBe(new Date(2026, 8, 1).getTime());
  });

  it("renders task times as a read-only calendar without drag controls", () => {
    const dueDate = new Date();
    dueDate.setHours(23, 59, 0, 0);
    const completedAt = new Date();
    completedAt.setHours(14, 30, 0, 0);
    const tasks = [
      makeTask({ id: "scheduled", dueDate: dueDate.getTime() }),
      makeTask({
        id: "completed",
        title: "Publish release notes",
        status: "completed",
        completedAt: completedAt.getTime(),
      }),
      makeTask({ id: "unscheduled", title: "Choose an owner" }),
    ];

    const markup = renderToStaticMarkup(
      React.createElement(MCTaskCalendarView, {
        tasks,
        data: {
          getTaskAttentionReason: () => null,
        },
        selectedTaskId: null,
        onSelectTask: () => {},
      }),
    );

    expect(markup).toContain('aria-label="任务日历"');
    expect(markup).toContain('class="mc-task-calendar-day-hit-area"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("已选择");
    expect(markup).toContain(">周一</span>");
    expect(markup).toContain("Prepare release notes");
    expect(markup).toContain("Publish release notes");
    expect(markup).not.toContain("Choose an owner");
    expect(markup).toContain("1 项进行中任务没有截止时间");
    expect(markup).toContain("时间显示规则");
    expect(markup).not.toContain(">时间规则</strong>");
    expect(markup).not.toContain("待排期");
    expect(markup).not.toContain("拖到");
    expect(markup).not.toContain('draggable="true"');
  });

  it("explains an empty month instead of showing a blank grid", () => {
    const markup = renderToStaticMarkup(
      React.createElement(MCTaskCalendarView, {
        tasks: [makeTask({ id: "unscheduled" })],
        data: {
          getTaskAttentionReason: () => null,
        },
        selectedTaskId: null,
        onSelectTask: () => {},
      }),
    );

    expect(markup).toContain("本月没有可显示的任务时间");
    expect(markup).toContain("历史任务按完成时间显示");
    expect(markup).toContain('class="mc-task-calendar empty-month"');
    expect(markup).toContain("当天没有任务");
    expect(markup).toContain("选择其他日期查看安排");
    expect(markup).not.toContain("拖");
  });

  it("maps terminal tasks to their actual completion time", () => {
    const completedAt = new Date(2026, 6, 27, 16, 30).getTime();
    const updatedAt = new Date(2026, 6, 27, 17, 45).getTime();

    expect(
      getTaskCalendarPlacement(
        makeTask({ status: "completed", completedAt, updatedAt }),
      ),
    ).toEqual({
      timestamp: completedAt,
      kind: "completed",
      label: "完成",
    });
    expect(
      getTaskCalendarPlacement(
        makeTask({ status: "failed", completedAt: undefined, updatedAt }),
      ),
    ).toEqual({
      timestamp: updatedAt,
      kind: "updated",
      label: "失败",
    });
    expect(getTaskCalendarPlacement(makeTask())).toBeNull();
  });

  it("formats a full, concrete timestamp", () => {
    const timestamp = new Date(2026, 6, 27, 14, 5).getTime();
    const formatted = formatExactTaskTimestamp(timestamp);

    expect(formatted).toContain("2026");
    expect(formatted).toContain("07");
    expect(formatted).toContain("27");
    expect(formatted).toContain("14:05");
  });
});
