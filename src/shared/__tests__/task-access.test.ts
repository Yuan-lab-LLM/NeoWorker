import { describe, expect, it } from "vitest";
import { deriveTaskAccessSummary, deriveTaskAccessUsage } from "../task-access";
import type { Task, TaskAccessPolicy, TaskEvent, Workspace } from "../types";

const task = {
  id: "task-1",
  title: "Test",
  prompt: "Test",
  status: "completed",
  workspaceId: "workspace-1",
  createdAt: 1,
  updatedAt: 2,
  agentConfig: {
    integrationMentions: [
      {
        id: "github",
        label: "GitHub",
        source: "mcp",
        providerKey: "github",
        iconKey: "github",
        tools: ["mcp_github_search"],
        promptHint: "",
      },
    ],
    allowedTools: ["mcp_github_search", "read_file"],
    toolRestrictions: ["mcp_slack_post"],
    permissionMode: "default",
  },
} as Task;

const workspace = {
  id: "workspace-1",
  name: "Work",
  path: "/work",
  createdAt: 1,
  permissions: { read: true, write: true, delete: false, network: true, shell: false },
} as Workspace;

const events = [
  {
    id: "event-1",
    taskId: "task-1",
    timestamp: 1,
    type: "timeline_tool_started",
    legacyType: "tool_call",
    payload: { tool: "mcp_github_search", input: {} },
    schemaVersion: 2,
  },
  {
    id: "event-2",
    taskId: "task-1",
    timestamp: 2,
    type: "timeline_tool_started",
    legacyType: "tool_call",
    payload: { tool: "read_file", input: { path: "/work/README.md" } },
    schemaVersion: 2,
  },
] as TaskEvent[];

describe("task access projection", () => {
  it("extracts bounded used tools and referenced files", () => {
    expect(deriveTaskAccessUsage(events, task)).toEqual({
      usedSkillIds: [],
      usedToolNames: ["mcp_github_search", "read_file"],
      referencedFiles: ["/work/README.md"],
    });
  });

  it("distinguishes used, blocked, and available connectors", () => {
    const summary = deriveTaskAccessSummary({
      task,
      workspace,
      events,
      connectors: [
        {
          id: "github",
          name: "GitHub",
          icon: "github",
          status: "connected",
          tools: ["mcp_github_search"],
        },
        {
          id: "slack",
          name: "Slack",
          icon: "slack",
          status: "connected",
          tools: ["mcp_slack_post"],
        },
        {
          id: "notion",
          name: "Notion",
          icon: "notion",
          status: "connected",
          tools: ["mcp_notion_search"],
        },
        {
          id: "calendar",
          name: "Calendar",
          icon: "calendar",
          status: "connected",
          tools: [],
        },
      ],
    });

    expect(summary.connectors.map(({ id, state }) => ({ id, state }))).toEqual([
      { id: "github", state: "used" },
      { id: "slack", state: "blocked" },
      { id: "notion", state: "blocked" },
      { id: "calendar", state: "available" },
    ]);
    expect(summary.policy.workspaceScopes[0]?.access).toBe("write");
    expect(summary.policy.shellAccess).toBe(false);
  });

  it("treats a persisted policy as authoritative over legacy task mentions", () => {
    const policy = {
      taskId: task.id,
      revision: 2,
      connectorIds: [],
      workspaceScopes: [],
      shellAccess: false,
      updatedAt: 10,
    } as TaskAccessPolicy;
    const summary = deriveTaskAccessSummary({
      task,
      workspace,
      events: [],
      policy,
      connectors: [
        {
          id: "github",
          name: "GitHub",
          icon: "github",
          status: "connected",
          tools: ["mcp_github_search"],
        },
      ],
    });

    expect(summary.connectors[0]?.state).toBe("available");
    expect(summary.policy.connectorIds).toEqual([]);
  });
});
