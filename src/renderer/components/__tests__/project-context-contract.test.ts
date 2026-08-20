import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectHubSource = readFileSync(
  fileURLToPath(new URL("../ProjectHubPanel.tsx", import.meta.url)),
  "utf8",
);
const appSource = readFileSync(
  fileURLToPath(new URL("../../App.tsx", import.meta.url)),
  "utf8",
);
const taskHandlerSource = readFileSync(
  fileURLToPath(new URL("../../../electron/ipc/handlers.ts", import.meta.url)),
  "utf8",
);
const taskContextSource = readFileSync(
  fileURLToPath(new URL("../TaskContextBar.tsx", import.meta.url)),
  "utf8",
);
const addTaskToProjectDialogSource = readFileSync(
  fileURLToPath(new URL("../AddTaskToProjectDialog.tsx", import.meta.url)),
  "utf8",
);
const sidebarSource = readFileSync(
  fileURLToPath(new URL("../Sidebar.tsx", import.meta.url)),
  "utf8",
);
const collapsedSidebarSource = readFileSync(
  fileURLToPath(new URL("../CollapsedSidebarRail.tsx", import.meta.url)),
  "utf8",
);
const projectWorkspaceSource = readFileSync(
  fileURLToPath(new URL("../ProjectWorkspaceView.tsx", import.meta.url)),
  "utf8",
);

describe("project context contract", () => {
  it("creates a real project and links its required primary workspace", () => {
    expect(projectHubSource).toContain(
      "window.electronAPI.createProjectWithWorkspace({",
    );
    expect(projectHubSource).toContain("handleLinkWorkspace");
    expect(projectHubSource).toContain("handleUnlinkWorkspace");
    expect(projectHubSource).toContain("handleSetPrimaryWorkspace");
    expect(projectHubSource).toContain("const { project, link }");
    expect(projectHubSource).toContain("temporary");
    expect(projectHubSource).toContain(
      "Please fill in the project name and project goals, and select a primary workspace.",
    );
  });

  it("propagates projectId into tasks without leaking it across a workspace override", () => {
    expect(appSource).toContain("let effectiveProjectId =");
    expect(appSource).toContain(
      "workspaceOverride.id !== currentWorkspace?.id",
    );
    expect(appSource).toContain(
      "...(effectiveProjectId ? { projectId: effectiveProjectId } : {})",
    );
  });

  it("lets an ordinary conversation join an existing project", () => {
    expect(taskContextSource).toContain("Join the project");
    expect(addTaskToProjectDialogSource).toContain("linkProjectWorkspace");
    expect(addTaskToProjectDialogSource).toContain("updateTaskProject");
    expect(addTaskToProjectDialogSource).toContain(
      "existing content and file locations will not change",
    );
  });

  it("keeps projects as conversation context instead of a primary navigation item", () => {
    expect(sidebarSource).not.toContain("sidebar.projects");
    expect(collapsedSidebarSource).not.toContain("sidebar.projects");
    expect(taskContextSource).toContain("projects.context.openNamed");
    expect(taskContextSource).toContain("setProjectPickerOpen(true)");
  });

  it("offers review, next phase, follow-up, and archive actions after completion", () => {
    expect(projectWorkspaceSource).toContain("isProjectStageComplete");
    expect(projectWorkspaceSource).toContain("projects.action.review");
    expect(projectWorkspaceSource).toContain("projects.action.nextPhase");
    expect(projectWorkspaceSource).toContain("projects.action.createFollowUp");
    expect(projectWorkspaceSource).toContain("projects.action.archive");
  });

  it("clears stale project context when a new workspace is not linked", () => {
    expect(appSource).toContain(
      "window.electronAPI.getProject(effectiveProjectId)",
    );
    expect(appSource).toContain(
      "window.electronAPI.listProjectWorkspaces(effectiveProjectId)",
    );
    expect(appSource).toContain(
      "!links.some((link) => link.workspaceId === effectiveWorkspace.id)",
    );
    expect(appSource).toContain("effectiveProjectId = undefined");
    expect(appSource).toContain("setCurrentProjectId(null)");
  });

  it("assigns every directly created task a generated or inherited sessionId", () => {
    expect(taskHandlerSource).toContain(
      "const resolvedSessionId = sessionId || task.id",
    );
    expect(taskHandlerSource).toContain(
      "taskRepo.update(task.id, { sessionId: resolvedSessionId })",
    );
  });
});
