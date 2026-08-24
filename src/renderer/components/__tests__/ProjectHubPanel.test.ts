import { describe, expect, it } from "vitest";
import type { Task, Workspace } from "../../../shared/types";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  countProjectTasks,
  countWorkspaceTasks,
  sortProjectWorkspaces,
} from "../ProjectHubPanel";

const workspace = (overrides: Partial<Workspace>): Workspace => ({
  id: "workspace-1",
  name: "项目一",
  path: "/projects/one",
  createdAt: 1,
  lastUsedAt: 1,
  permissions: {
    read: true,
    write: true,
    delete: true,
    network: false,
    shell: false,
  },
  ...overrides,
});

const task = (overrides: Partial<Task>): Task => ({
  id: "task-1",
  title: "测试任务",
  prompt: "测试任务",
  status: "pending",
  workspaceId: "workspace-1",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe("ProjectHubPanel helpers", () => {
  it("imports every project-card icon used by the panel", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../ProjectHubPanel.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toMatch(
      /import\s*\{[\s\S]*?FolderOpen,[\s\S]*?\}\s*from "lucide-react";/,
    );
    expect(source).toContain("<FolderOpen size={13}");
    expect(source).toContain("generated.components.projecthubpanel.542.21");
    expect(source).toContain("projects.primaryWorkspaceNamed");
  });

  it("keeps persistent projects, excludes temporary workspaces and sorts by activity", () => {
    const result = sortProjectWorkspaces([
      workspace({ id: "older", lastUsedAt: 20 }),
      workspace({ id: "temporary", isTemp: true, lastUsedAt: 100 }),
      workspace({ id: "newer", lastUsedAt: 30 }),
    ]);

    expect(result.map((item) => item.id)).toEqual(["newer", "older"]);
  });

  it("counts only root tasks inside the selected workspace", () => {
    const result = countWorkspaceTasks(
      [
        task({ id: "active", status: "executing" }),
        task({ id: "completed", status: "completed" }),
        task({ id: "child", parentTaskId: "active", status: "completed" }),
        task({ id: "other", workspaceId: "workspace-2", status: "completed" }),
      ],
      "workspace-1",
    );

    expect(result).toEqual({ total: 2, active: 1, completed: 1 });
  });

  it("counts project tasks by projectId instead of treating a workspace as a project", () => {
    const result = countProjectTasks(
      [
        task({ id: "active", projectId: "project-1", status: "executing" }),
        task({ id: "completed", projectId: "project-1", status: "completed" }),
        task({
          id: "same-workspace",
          projectId: "project-2",
          status: "completed",
        }),
        task({
          id: "child",
          projectId: "project-1",
          parentTaskId: "active",
          status: "completed",
        }),
      ],
      "project-1",
    );

    expect(result).toEqual({ total: 2, active: 1, completed: 1 });
  });
});
