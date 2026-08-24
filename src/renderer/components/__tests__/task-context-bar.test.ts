import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Task, Workspace } from "../../../shared/types";
import { TaskContextBar } from "../TaskContextBar";

const workspace: Workspace = {
  id: "workspace-1",
  name: "Launch workspace",
  path: "/tmp/launch",
  createdAt: 1,
  permissions: {
    read: true,
    write: true,
    delete: false,
    network: true,
    shell: false,
  },
};

function makeTask(): Task {
  return {
    id: "task-1",
    title: "Launch",
    prompt: "Prepare launch",
    status: "blocked",
    terminalStatus: "awaiting_approval",
    workspaceId: workspace.id,
    createdAt: 1,
    updatedAt: 2,
    source: "hook",
    agentConfig: {
      permissionMode: "dangerous_only",
      integrationMentions: [
        {
          id: "slack",
          label: "Slack",
          source: "gateway",
          providerKey: "slack",
          iconKey: "slack",
          tools: [],
          promptHint: "",
        },
        {
          id: "github",
          label: "GitHub",
          source: "mcp",
          providerKey: "github",
          iconKey: "github",
          tools: [],
          promptHint: "",
        },
        {
          id: "drive",
          label: "Drive",
          source: "mcp",
          providerKey: "drive",
          iconKey: "google-drive",
          tools: [],
          promptHint: "",
        },
        {
          id: "notion",
          label: "Notion",
          source: "mcp",
          providerKey: "notion",
          iconKey: "notion",
          tools: [],
          promptHint: "",
        },
        {
          id: "box",
          label: "Box",
          source: "mcp",
          providerKey: "box",
          iconKey: "box",
          tools: [],
          promptHint: "",
        },
      ],
    },
  };
}

describe("TaskContextBar", () => {
  it("uses the shared attention projection and exposes one primary action", () => {
    const html = renderToStaticMarkup(
      createElement(TaskContextBar, {
        task: makeTask(),
        workspace,
        attentionSignals: { pendingApprovalCount: 2 },
        primaryActionLabel: "Review approval",
        onPrimaryAction: () => {},
      }),
    );

    expect(html).toContain("task-context-primary-action state-needs_approval");
    expect(html).toContain("Review approval");
    expect(html).toContain("+1");
    expect(html.match(/task-context-primary-action/g)).toHaveLength(1);
  });

  it("hides default manual context for a completed temporary-workspace task", () => {
    const html = renderToStaticMarkup(
      createElement(TaskContextBar, {
        task: {
          ...makeTask(),
          status: "completed",
          terminalStatus: "ok",
          source: "manual",
          agentConfig: { permissionMode: "default" },
        },
        workspace: {
          ...workspace,
          id: "__temp_workspace__:session-1",
          name: "Temporary Workspace",
          isTemp: true,
        },
      }),
    );

    expect(html).toBe("");
  });

  it("keeps only meaningful context instead of default source and access labels", () => {
    const html = renderToStaticMarkup(
      createElement(TaskContextBar, {
        task: {
          ...makeTask(),
          status: "completed",
          terminalStatus: "ok",
          source: "manual",
          agentConfig: { permissionMode: "default" },
        },
        workspace,
        onChangeWorkspace: () => {},
      }),
    );

    expect(html).toContain("Launch workspace");
    expect(html).not.toContain("Manual task");
    expect(html).not.toContain("Default access");
    expect(html).not.toContain("task-context-primary-action");
  });

  it("renders an action-only bar without restoring default context chips", () => {
    const html = renderToStaticMarkup(
      createElement(TaskContextBar, {
        task: {
          ...makeTask(),
          status: "executing",
          terminalStatus: undefined,
          source: "manual",
          agentConfig: { permissionMode: "default" },
        },
        workspace: {
          ...workspace,
          id: "__temp_workspace__:session-1",
          name: "Temporary Workspace",
          isTemp: true,
        },
        primaryActionLabel: "View progress",
        onPrimaryAction: () => {},
      }),
    );

    expect(html).toContain("View progress");
    expect(html).toContain("task-context-bar is-action-only");
    expect(html).not.toContain("Temporary Workspace");
    expect(html).not.toContain("Manual task");
    expect(html).not.toContain("Default access");
  });
});
