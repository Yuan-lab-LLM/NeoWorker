import { describe, expect, it, vi } from "vitest";

import { TaskExecutor } from "../executor";

function createExecutorFixture() {
  const executor = Object.create(TaskExecutor.prototype) as Any;
  const tools = [
    { name: "read_file", description: "Read file" },
    { name: "run_command", description: "Run command" },
  ];
  const workspace = {
    permissions: {
      shell: true,
    },
  };
  let catalogVersion = "catalog:v1";

  executor.workspace = workspace;
  executor.task = {
    agentConfig: {},
    title: "Task",
    prompt: "Prompt",
  };
  executor.currentStepId = null;
  executor.plan = undefined;
  executor.toolUsageCounts = new Map();
  executor.recoveryRequestActive = false;
  executor.lastAssistantOutput = null;
  executor.webSearchMode = "live";
  executor.availableToolsCacheKey = null;
  executor.availableToolsCache = null;
  executor.toolFailureTracker = {
    getDisabledTools: vi.fn(() => []),
  };
  executor.toolRegistry = {
    getToolCatalogVersion: vi.fn(() => catalogVersion),
    getTools: vi.fn(() => tools),
  };
  executor.getTaskToolRestrictions = vi.fn(() => new Set<string>());
  executor.hasTaskToolAllowlistConfigured = vi.fn(() => false);
  executor.getTaskToolAllowlist = vi.fn(() => new Set<string>());
  executor.isVisualCanvasTask = vi.fn(() => false);
  executor.isCanvasTool = vi.fn(() => false);
  executor.applyWebSearchModeFilter = vi.fn((entries: Any[]) => entries);
  executor.applyAgentPolicyToolFilter = vi.fn((entries: Any[]) => entries);
  executor.applyAdaptiveToolAvailabilityFilter = vi.fn((entries: Any[]) => entries);
  executor.applyStepScopedToolPolicy = vi.fn((entries: Any[]) => entries);
  executor.applyIntentFilter = vi.fn((entries: Any[]) => entries);
  executor.getEffectiveExecutionMode = vi.fn(() => "execute");
  executor.getEffectiveTaskDomain = vi.fn(() => "general");

  return {
    executor,
    tools,
    workspace,
    setCatalogVersion: (nextVersion: string) => {
      catalogVersion = nextVersion;
    },
  };
}

describe("TaskExecutor available-tools cache", () => {
  it("reuses the cached tool list while the shared catalog version is stable", () => {
    const { executor } = createExecutorFixture();

    const first = (executor as Any).getAvailableTools();
    const second = (executor as Any).getAvailableTools();

    expect(first.map((tool: Any) => tool.name)).toEqual(["read_file", "run_command"]);
    expect(second.map((tool: Any) => tool.name)).toEqual(["read_file", "run_command"]);
    expect((executor as Any).toolRegistry.getTools).toHaveBeenCalledTimes(1);
  });

  it("invalidates the cached tool list when the shared catalog version changes", () => {
    const { executor, setCatalogVersion } = createExecutorFixture();

    (executor as Any).getAvailableTools();
    setCatalogVersion("catalog:v2");
    (executor as Any).getAvailableTools();

    expect((executor as Any).toolRegistry.getTools).toHaveBeenCalledTimes(2);
  });

  it("invalidates the cached tool list when workspace shell permission flips mid-task", () => {
    const { executor, workspace } = createExecutorFixture();
    (executor as Any).toolRegistry.getToolCatalogVersion = vi.fn(() =>
      workspace.permissions.shell ? "catalog:shell:on" : "catalog:shell:off",
    );

    (executor as Any).getAvailableTools();
    workspace.permissions.shell = false;
    (executor as Any).getAvailableTools();

    expect((executor as Any).toolRegistry.getTools).toHaveBeenCalledTimes(2);
  });
});
