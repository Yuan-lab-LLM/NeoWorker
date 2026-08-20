import { describe, expect, it } from "vitest";

import {
  formatTaskEstimate,
  getTaskAttentionReasonForUi,
  getTaskDueInfo,
  getTaskPriorityMeta,
  isTaskStaleForUi,
  resolveMissionColumnForTask,
} from "../useMissionControlData";

describe("Mission Control board helpers", () => {
  it("routes terminal tasks into the done/history lane", () => {
    expect(
      resolveMissionColumnForTask({
        status: "failed",
        boardColumn: "in_progress",
        assignedAgentRoleId: "agent-1",
      }),
    ).toBe("done");

    expect(
      resolveMissionColumnForTask({
        status: "cancelled",
        boardColumn: "todo",
        assignedAgentRoleId: "agent-1",
      }),
    ).toBe("done");
  });

  it("keeps backlog tasks split between inbox and assigned", () => {
    expect(
      resolveMissionColumnForTask({
        status: "queued",
        boardColumn: "backlog",
        assignedAgentRoleId: undefined,
      }),
    ).toBe("inbox");

    expect(
      resolveMissionColumnForTask({
        status: "queued",
        boardColumn: "backlog",
        assignedAgentRoleId: "agent-1",
      }),
    ).toBe("assigned");
  });

  it("shows actively executing backlog tasks in the working lane", () => {
    expect(
      resolveMissionColumnForTask({
        status: "executing",
        boardColumn: "backlog",
        assignedAgentRoleId: undefined,
      }),
    ).toBe("in_progress");

    expect(
      resolveMissionColumnForTask({
        status: "planning",
        boardColumn: "todo",
        assignedAgentRoleId: "agent-1",
      }),
    ).toBe("in_progress");
  });

  it("formats due dates as overdue or due soon", () => {
    const now = Date.UTC(2026, 2, 30, 12, 0, 0);

    expect(getTaskDueInfo(now - 30 * 60 * 1000, now)).toMatchObject({
      tone: "overdue",
      isOverdue: true,
      label: "30m overdue",
    });

    expect(getTaskDueInfo(now + 2 * 60 * 60 * 1000, now)).toMatchObject({
      tone: "soon",
      isDueSoon: true,
      label: "Due in 2h",
    });
  });

  it("formats estimates and priority metadata for decision-ready cards", () => {
    expect(formatTaskEstimate(45)).toBe("45m");
    expect(formatTaskEstimate(180)).toBe("3h");
    expect(getTaskPriorityMeta(4)).toMatchObject({
      label: "Urgent",
      shortLabel: "P4",
    });
  });

  it("marks long-running active work as stale but ignores closed work", () => {
    const now = Date.UTC(2026, 2, 30, 12, 0, 0);

    expect(
      isTaskStaleForUi(
        {
          status: "executing",
          createdAt: now - 8 * 60 * 60 * 1000,
          updatedAt: now - 7 * 60 * 60 * 1000,
        },
        now,
      ),
    ).toBe(true);

    expect(
      isTaskStaleForUi(
        {
          status: "completed",
          createdAt: now - 8 * 60 * 60 * 1000,
          updatedAt: now - 7 * 60 * 60 * 1000,
        },
        now,
      ),
    ).toBe(false);
  });

  it("never marks completed work overdue or ownerless", () => {
    const now = Date.UTC(2026, 2, 30, 12, 0, 0);
    expect(
      getTaskAttentionReasonForUi(
        {
          id: "completed-task",
          title: "Completed report",
          prompt: "Create the report",
          status: "completed",
          workspaceId: "workspace-1",
          createdAt: now - 2 * 86_400_000,
          updatedAt: now - 86_400_000,
          dueDate: now - 60_000,
          boardColumn: "backlog",
        },
        now,
      ),
    ).toBeNull();
  });
});
