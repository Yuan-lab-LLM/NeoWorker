import { describe, expect, it } from "vitest";
import type { Task } from "../../../shared/types";
import {
  collectProjectRoleIds,
  filterProjectWorkspaceTasks,
  groupProjectTasksBySession,
  isProjectStageComplete,
  summarizeProjectProgress,
} from "../ProjectWorkspaceView";

const task = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  title: "项目任务",
  prompt: "项目任务",
  status: "pending",
  workspaceId: "workspace-1",
  projectId: "project-1",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe("ProjectWorkspaceView context contract", () => {
  it("uses projectId and the shared workspace filter on every task page", () => {
    const tasks = [
      task({ id: "a", workspaceId: "workspace-1" }),
      task({ id: "b", workspaceId: "workspace-2" }),
      task({ id: "other", projectId: "project-2", workspaceId: "workspace-1" }),
    ];

    expect(
      filterProjectWorkspaceTasks(tasks, "project-1", "workspace-1").map(
        (item) => item.id,
      ),
    ).toEqual(["a"]);
    expect(
      filterProjectWorkspaceTasks(tasks, "project-1", "all").map(
        (item) => item.id,
      ),
    ).toEqual(["a", "b"]);
  });

  it("groups multiple task nodes under one session", () => {
    const groups = groupProjectTasksBySession([
      task({ id: "root", sessionId: "session-1", createdAt: 1, updatedAt: 1 }),
      task({
        id: "follow-up",
        sessionId: "session-1",
        createdAt: 2,
        updatedAt: 3,
      }),
      task({
        id: "standalone",
        sessionId: undefined,
        createdAt: 3,
        updatedAt: 2,
      }),
    ]);

    expect(
      groups
        .find((group) => group.sessionId === "session-1")
        ?.tasks.map((item) => item.id),
    ).toEqual(["root", "follow-up"]);
    expect(
      groups.find((group) => group.sessionId === "standalone")?.tasks,
    ).toHaveLength(1);
  });

  it("derives the project team from assigned and mentioned roles", () => {
    expect(
      collectProjectRoleIds([
        task({
          assignedAgentRoleId: "lead",
          mentionedAgentRoleIds: ["reviewer", "lead"],
        }),
        task({ assignedAgentRoleId: "writer" }),
      ]),
    ).toEqual(["lead", "reviewer", "writer"]);
  });

  it("summarizes root-task progress without inflating child task counts", () => {
    expect(
      summarizeProjectProgress([
        task({ id: "done", status: "completed" }),
        task({ id: "active", status: "executing" }),
        task({ id: "blocked", status: "blocked" }),
        task({ id: "child", parentTaskId: "active", status: "completed" }),
      ]),
    ).toEqual({
      total: 3,
      active: 1,
      completed: 1,
      attention: 1,
      percent: 33,
      label: "1 项工作正在推进",
    });
  });

  it("marks a stage complete only when every root task is completed", () => {
    const completed = summarizeProjectProgress([
      task({ id: "done-1", status: "completed" }),
      task({ id: "done-2", status: "completed" }),
    ]);
    const blocked = summarizeProjectProgress([
      task({ id: "done", status: "completed" }),
      task({ id: "blocked", status: "blocked" }),
    ]);

    expect(isProjectStageComplete(completed)).toBe(true);
    expect(isProjectStageComplete(blocked)).toBe(false);
    expect(isProjectStageComplete(summarizeProjectProgress([]))).toBe(false);
  });
});
