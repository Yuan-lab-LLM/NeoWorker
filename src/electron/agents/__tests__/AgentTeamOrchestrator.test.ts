import { afterEach, describe, it, expect, vi } from "vitest";
import type {
  AgentTeam,
  AgentTeamItem,
  AgentTeamRun,
  LLMSettings,
  Task,
  UpdateAgentTeamItemRequest,
} from "../../../shared/types";
import { LLMProviderFactory } from "../../agent/llm/provider-factory";

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

// Avoid loading the native module in test environment.
vi.mock("better-sqlite3", () => ({
  default: class FakeDatabase {},
}));

function makeRepos(seed: { team: AgentTeam; run: AgentTeamRun; items: AgentTeamItem[] }): {
  teamRepo: { findById: (id: string) => AgentTeam | undefined };
  runRepo: {
    findById: (id: string) => AgentTeamRun | undefined;
    update: (id: string, updates: Any) => AgentTeamRun | undefined;
  };
  itemRepo: {
    listByRun: (runId: string) => AgentTeamItem[];
    listBySourceTaskId: (taskId: string) => AgentTeamItem[];
    update: (req: UpdateAgentTeamItemRequest) => AgentTeamItem | undefined;
    create: (req: Any) => AgentTeamItem;
  };
} {
  const teams = new Map<string, AgentTeam>([[seed.team.id, seed.team]]);
  const runs = new Map<string, AgentTeamRun>([[seed.run.id, seed.run]]);
  const items = new Map<string, AgentTeamItem>(seed.items.map((i) => [i.id, i]));

  return {
    teamRepo: {
      findById: (id) => teams.get(id),
    },
    runRepo: {
      findById: (id) => runs.get(id),
      update: (id, updates) => {
        const existing = runs.get(id);
        if (!existing) return undefined;
        const next: AgentTeamRun = {
          ...existing,
          ...(updates.status !== undefined ? { status: updates.status } : {}),
          ...(updates.error !== undefined ? { error: updates.error ?? undefined } : {}),
          ...(updates.summary !== undefined ? { summary: updates.summary ?? undefined } : {}),
          ...(updates.completedAt !== undefined
            ? { completedAt: updates.completedAt ?? undefined }
            : {}),
          ...(updates.phase !== undefined ? { phase: updates.phase ?? undefined } : {}),
        };
        runs.set(id, next);
        return next;
      },
    },
    itemRepo: {
      listByRun: (runId) => Array.from(items.values()).filter((i) => i.teamRunId === runId),
      listBySourceTaskId: (taskId) =>
        Array.from(items.values()).filter((i) => i.sourceTaskId === taskId),
      update: (req) => {
        const existing = items.get(req.id);
        if (!existing) return undefined;
        const next: AgentTeamItem = {
          ...existing,
          ...(req.parentItemId !== undefined
            ? { parentItemId: (req.parentItemId as Any) ?? undefined }
            : {}),
          ...(req.title !== undefined ? { title: req.title } : {}),
          ...(req.description !== undefined
            ? { description: (req.description as Any) ?? undefined }
            : {}),
          ...(req.ownerAgentRoleId !== undefined
            ? { ownerAgentRoleId: (req.ownerAgentRoleId as Any) ?? undefined }
            : {}),
          ...(req.sourceTaskId !== undefined
            ? { sourceTaskId: (req.sourceTaskId as Any) ?? undefined }
            : {}),
          ...(req.status !== undefined ? { status: req.status as Any } : {}),
          ...(req.resultSummary !== undefined
            ? { resultSummary: (req.resultSummary as Any) ?? undefined }
            : {}),
          ...(req.sortOrder !== undefined ? { sortOrder: req.sortOrder as Any } : {}),
          updatedAt: Date.now(),
        };
        items.set(req.id, next);
        return next;
      },
      create: (req) => {
        const created: AgentTeamItem = {
          id: req.id || `item-${Math.random().toString(16).slice(2)}`,
          teamRunId: req.teamRunId,
          parentItemId: req.parentItemId ?? undefined,
          title: req.title,
          description: req.description ?? undefined,
          ownerAgentRoleId: req.ownerAgentRoleId ?? undefined,
          sourceTaskId: req.sourceTaskId ?? undefined,
          status: req.status,
          resultSummary: req.resultSummary ?? undefined,
          sortOrder: req.sortOrder,
          createdAt: req.createdAt ?? Date.now(),
          updatedAt: req.updatedAt ?? Date.now(),
        };
        items.set(created.id, created);
        return created;
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

function mockProfileRouting(
  profileRoutingEnabled: boolean,
  providerType: LLMSettings["providerType"] = "openai",
): void {
  const settings: LLMSettings = {
    providerType,
    modelKey: "gpt-4o-mini",
    openai: {
      model: "gpt-4o-mini",
      profileRoutingEnabled,
      strongModelKey: "gpt-5.4",
      cheapModelKey: "gpt-5.4-mini",
    },
  };
  vi.spyOn(LLMProviderFactory, "loadSettings").mockReturnValue(settings);
}

describe("AgentTeamOrchestrator", () => {
  it("spawns with team defaults and sets bypassQueue=false", async () => {
    mockProfileRouting(false);

    const now = Date.now();

    const team: AgentTeam = {
      id: "team-1",
      workspaceId: "ws-1",
      name: "Team A",
      description: undefined,
      leadAgentRoleId: "role-lead",
      maxParallelAgents: 2,
      defaultModelPreference: "cheaper",
      defaultPersonality: "technical",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const run: AgentTeamRun = {
      id: "run-1",
      teamId: team.id,
      rootTaskId: "task-root",
      status: "running",
      startedAt: now,
      completedAt: undefined,
      error: undefined,
      summary: undefined,
    };

    const item: AgentTeamItem = {
      id: "item-1",
      teamRunId: run.id,
      parentItemId: undefined,
      title: "Item 1",
      description: "Detail",
      ownerAgentRoleId: "role-owner",
      sourceTaskId: undefined,
      status: "todo",
      resultSummary: undefined,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const rootTask: Task = {
      id: run.rootTaskId,
      title: "Root",
      prompt: "Do the thing",
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      agentType: "main",
      depth: 0,
    };

    const tasksById = new Map<string, Task>([[rootTask.id, rootTask]]);

    const createChildTask = vi.fn(async (params: Any) => {
      const child: Task = {
        id: `task-child-${Math.random().toString(16).slice(2)}`,
        title: params.title,
        prompt: params.prompt,
        status: "pending",
        workspaceId: params.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parentTaskId: params.parentTaskId,
        agentType: params.agentType,
        agentConfig: params.agentConfig,
        depth: params.depth,
        assignedAgentRoleId: params.assignedAgentRoleId,
      };
      tasksById.set(child.id, child);
      return child;
    });

    const { teamRepo, runRepo, itemRepo } = makeRepos({ team, run, items: [item] });

    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const orch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (taskId: string) => tasksById.get(taskId),
        createChildTask,
        cancelTask: async () => {},
      },
      { teamRepo, runRepo, itemRepo },
    );

    await orch.tickRun(run.id, "test");

    expect(createChildTask).toHaveBeenCalledTimes(1);
    const call = createChildTask.mock.calls[0][0];
    expect(call.assignedAgentRoleId).toBe(item.ownerAgentRoleId);
    expect(call.agentConfig).toMatchObject({
      retainMemory: false,
      bypassQueue: false,
      llmProfile: "cheap",
      modelKey: "haiku-4-5",
      personalityId: "technical",
    });

    const updated = itemRepo.listByRun(run.id)[0];
    expect(updated.status).toBe("in_progress");
    expect(typeof updated.sourceTaskId).toBe("string");
    expect((updated.sourceTaskId || "").length).toBeGreaterThan(0);
  });

  it("does not override model/personality when defaults inherit", async () => {
    mockProfileRouting(false);

    const now = Date.now();

    const team: AgentTeam = {
      id: "team-2",
      workspaceId: "ws-2",
      name: "Team B",
      description: undefined,
      leadAgentRoleId: "role-lead-2",
      maxParallelAgents: 1,
      defaultModelPreference: "same",
      defaultPersonality: "same",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const run: AgentTeamRun = {
      id: "run-2",
      teamId: team.id,
      rootTaskId: "task-root-2",
      status: "running",
      startedAt: now,
      completedAt: undefined,
      error: undefined,
      summary: undefined,
    };

    const item: AgentTeamItem = {
      id: "item-2",
      teamRunId: run.id,
      parentItemId: undefined,
      title: "Item",
      description: undefined,
      ownerAgentRoleId: undefined,
      sourceTaskId: undefined,
      status: "todo",
      resultSummary: undefined,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const rootTask: Task = {
      id: run.rootTaskId,
      title: "Root 2",
      prompt: "Do the other thing",
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      agentType: "main",
      depth: 0,
    };

    const tasksById = new Map<string, Task>([[rootTask.id, rootTask]]);

    const createChildTask = vi.fn(async (params: Any) => {
      const child: Task = {
        id: `task-child-${Math.random().toString(16).slice(2)}`,
        title: params.title,
        prompt: params.prompt,
        status: "pending",
        workspaceId: params.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parentTaskId: params.parentTaskId,
        agentType: params.agentType,
        agentConfig: params.agentConfig,
        depth: params.depth,
        assignedAgentRoleId: params.assignedAgentRoleId,
      };
      tasksById.set(child.id, child);
      return child;
    });

    const { teamRepo, runRepo, itemRepo } = makeRepos({ team, run, items: [item] });

    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const orch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (taskId: string) => tasksById.get(taskId),
        createChildTask,
        cancelTask: async () => {},
      },
      { teamRepo, runRepo, itemRepo },
    );

    await orch.tickRun(run.id, "test");

    const call = createChildTask.mock.calls[0][0];
    expect(call.agentConfig).toMatchObject({
      retainMemory: false,
      bypassQueue: false,
      llmProfile: "cheap",
    });
    expect(call.agentConfig.modelKey).toBeUndefined();
    expect(call.agentConfig.personalityId).toBeUndefined();
  });

  it("routes validator-style checklist items to strong profile", async () => {
    mockProfileRouting(false);

    const now = Date.now();

    const team: AgentTeam = {
      id: "team-3",
      workspaceId: "ws-3",
      name: "Team C",
      description: undefined,
      leadAgentRoleId: "role-lead-3",
      maxParallelAgents: 1,
      defaultModelPreference: "same",
      defaultPersonality: "same",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const run: AgentTeamRun = {
      id: "run-3",
      teamId: team.id,
      rootTaskId: "task-root-3",
      status: "running",
      startedAt: now,
      completedAt: undefined,
      error: undefined,
      summary: undefined,
    };

    const item: AgentTeamItem = {
      id: "item-3",
      teamRunId: run.id,
      parentItemId: undefined,
      title: "Validation pass",
      description: "Verify quality and correctness",
      ownerAgentRoleId: undefined,
      sourceTaskId: undefined,
      status: "todo",
      resultSummary: undefined,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const rootTask: Task = {
      id: run.rootTaskId,
      title: "Root 3",
      prompt: "Ship the change",
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      agentType: "main",
      depth: 0,
    };

    const tasksById = new Map<string, Task>([[rootTask.id, rootTask]]);

    const createChildTask = vi.fn(async (params: Any) => {
      const child: Task = {
        id: `task-child-${Math.random().toString(16).slice(2)}`,
        title: params.title,
        prompt: params.prompt,
        status: "pending",
        workspaceId: params.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parentTaskId: params.parentTaskId,
        agentType: params.agentType,
        agentConfig: params.agentConfig,
        depth: params.depth,
        assignedAgentRoleId: params.assignedAgentRoleId,
      };
      tasksById.set(child.id, child);
      return child;
    });

    const { teamRepo, runRepo, itemRepo } = makeRepos({ team, run, items: [item] });
    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const orch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (taskId: string) => tasksById.get(taskId),
        createChildTask,
        cancelTask: async () => {},
      },
      { teamRepo, runRepo, itemRepo },
    );

    vi.spyOn((orch as Any).thoughtRepo, "listByRun").mockReturnValue([]);
    await (orch as Any).transitionToSynthesizePhase(run, team, rootTask, [item]);

    const call = createChildTask.mock.calls[0][0];
    expect(call.agentConfig.llmProfile).toBe("strong");
  });

  it("omits explicit team model override for collab subagents when profile routing is enabled", async () => {
    mockProfileRouting(true);

    const now = Date.now();

    const team: AgentTeam = {
      id: "team-4",
      workspaceId: "ws-4",
      name: "Team D",
      description: undefined,
      leadAgentRoleId: "role-lead-4",
      maxParallelAgents: 1,
      defaultModelPreference: "cheaper",
      defaultPersonality: "technical",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const run: AgentTeamRun = {
      id: "run-4",
      teamId: team.id,
      rootTaskId: "task-root-4",
      status: "running",
      startedAt: now,
      collaborativeMode: true,
    };

    const item: AgentTeamItem = {
      id: "item-4",
      teamRunId: run.id,
      parentItemId: undefined,
      title: "Implement feature",
      description: "Make the requested code change",
      ownerAgentRoleId: undefined,
      sourceTaskId: undefined,
      status: "todo",
      resultSummary: undefined,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const rootTask: Task = {
      id: run.rootTaskId,
      title: "Root 4",
      rawPrompt: "Implement the feature with collaborators",
      prompt: [
        "Implement the feature with collaborators",
        "",
        "[AGENT_STRATEGY_CONTEXT_V1]",
        "checklist_contract:",
        "- Mark checklist progress immediately when work starts or completes.",
        "relationship_memory:",
        "- Do not infer the active workspace, company, industry, topic, or any missing task parameter from this memory.",
        "[/AGENT_STRATEGY_CONTEXT_V1]",
      ].join("\n"),
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      agentType: "main",
      depth: 0,
    };

    const tasksById = new Map<string, Task>([[rootTask.id, rootTask]]);
    const createChildTask = vi.fn(async (params: Any) => {
      const child: Task = {
        id: `task-child-${Math.random().toString(16).slice(2)}`,
        title: params.title,
        prompt: params.prompt,
        status: "pending",
        workspaceId: params.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parentTaskId: params.parentTaskId,
        agentType: params.agentType,
        agentConfig: params.agentConfig,
        depth: params.depth,
        assignedAgentRoleId: params.assignedAgentRoleId,
      };
      tasksById.set(child.id, child);
      return child;
    });

    const { teamRepo, runRepo, itemRepo } = makeRepos({ team, run, items: [item] });
    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const orch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (taskId: string) => tasksById.get(taskId),
        createChildTask,
        cancelTask: async () => {},
      },
      { teamRepo, runRepo, itemRepo },
    );

    await orch.tickRun(run.id, "test");

    const call = createChildTask.mock.calls[0][0];
    expect(call.agentConfig).toMatchObject({
      retainMemory: false,
      bypassQueue: false,
      llmProfile: "cheap",
      personalityId: "technical",
    });
    expect(call.agentConfig.modelKey).toBeUndefined();
    expect(call.prompt).toContain("Implement the feature with collaborators");
    expect(call.prompt).not.toContain("AGENT_STRATEGY_CONTEXT_V1");
    expect(call.prompt).not.toContain("checklist_contract");
    expect(call.prompt).not.toContain("Do not infer the active workspace");
  });

  it("includes lane-specific instructions for multitask collaborative subagents", async () => {
    mockProfileRouting(true);

    const now = Date.now();
    const team: AgentTeam = {
      id: "team-mt",
      workspaceId: "ws-mt",
      name: "Multitask Team",
      description: undefined,
      leadAgentRoleId: "role-lead-mt",
      maxParallelAgents: 2,
      defaultModelPreference: "same",
      defaultPersonality: "same",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const run: AgentTeamRun = {
      id: "run-mt",
      teamId: team.id,
      rootTaskId: "task-root-mt",
      status: "running",
      startedAt: now,
      collaborativeMode: true,
    };
    const item: AgentTeamItem = {
      id: "item-mt",
      teamRunId: run.id,
      parentItemId: undefined,
      title: "Verification",
      description: "Verify the flow and report regressions.",
      ownerAgentRoleId: undefined,
      sourceTaskId: undefined,
      status: "todo",
      resultSummary: undefined,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    const rootTask: Task = {
      id: run.rootTaskId,
      title: "Fix onboarding",
      prompt: "Fix the onboarding bugs",
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      agentType: "main",
      depth: 0,
      agentConfig: {
        collaborativeMode: true,
        multitaskMode: true,
        multitaskLaneCount: 2,
        multitaskAssignmentMode: "auto_split",
      },
    };

    const tasksById = new Map<string, Task>([[rootTask.id, rootTask]]);
    const createChildTask = vi.fn(async (params: Any) => {
      const child: Task = {
        id: "task-child-mt",
        title: params.title,
        prompt: params.prompt,
        status: "pending",
        workspaceId: params.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parentTaskId: params.parentTaskId,
        agentType: params.agentType,
        agentConfig: params.agentConfig,
        depth: params.depth,
      };
      tasksById.set(child.id, child);
      return child;
    });

    const { teamRepo, runRepo, itemRepo } = makeRepos({ team, run, items: [item] });
    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const orch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (taskId: string) => tasksById.get(taskId),
        createChildTask,
        cancelTask: async () => {},
      },
      { teamRepo, runRepo, itemRepo },
    );

    await orch.tickRun(run.id, "test");

    const call = createChildTask.mock.calls[0][0];
    expect(call.prompt).toContain("YOUR MULTITASK LANE:");
    expect(call.prompt).toContain("Verification");
    expect(call.prompt).toContain("Verify the flow and report regressions.");
    expect(call.prompt).toContain("Work only on this lane.");
  });

  it("keeps explicit team model override for collab subagents when profile routing is disabled", async () => {
    mockProfileRouting(false);

    const now = Date.now();

    const team: AgentTeam = {
      id: "team-5",
      workspaceId: "ws-5",
      name: "Team E",
      description: undefined,
      leadAgentRoleId: "role-lead-5",
      maxParallelAgents: 1,
      defaultModelPreference: "cheaper",
      defaultPersonality: "same",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const run: AgentTeamRun = {
      id: "run-5",
      teamId: team.id,
      rootTaskId: "task-root-5",
      status: "running",
      startedAt: now,
      collaborativeMode: true,
    };

    const item: AgentTeamItem = {
      id: "item-5",
      teamRunId: run.id,
      parentItemId: undefined,
      title: "Implement feature",
      description: undefined,
      ownerAgentRoleId: undefined,
      sourceTaskId: undefined,
      status: "todo",
      resultSummary: undefined,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const rootTask: Task = {
      id: run.rootTaskId,
      title: "Root 5",
      prompt: "Implement the feature with collaborators",
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      agentType: "main",
      depth: 0,
    };

    const tasksById = new Map<string, Task>([[rootTask.id, rootTask]]);
    const createChildTask = vi.fn(async (params: Any) => {
      const child: Task = {
        id: `task-child-${Math.random().toString(16).slice(2)}`,
        title: params.title,
        prompt: params.prompt,
        status: "pending",
        workspaceId: params.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parentTaskId: params.parentTaskId,
        agentType: params.agentType,
        agentConfig: params.agentConfig,
        depth: params.depth,
        assignedAgentRoleId: params.assignedAgentRoleId,
      };
      tasksById.set(child.id, child);
      return child;
    });

    const { teamRepo, runRepo, itemRepo } = makeRepos({ team, run, items: [item] });
    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const orch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (taskId: string) => tasksById.get(taskId),
        createChildTask,
        cancelTask: async () => {},
      },
      { teamRepo, runRepo, itemRepo },
    );

    await orch.tickRun(run.id, "test");

    const call = createChildTask.mock.calls[0][0];
    expect(call.agentConfig.llmProfile).toBe("cheap");
    expect(call.agentConfig.modelKey).toBe("haiku-4-5");
  });

  it.each(["Coordinate and summarize", "分析 EPAI 并生成 PPT"])("scopes synthesis to the requested deliverable: %s", async (request) => {
    mockProfileRouting(true);

    const now = Date.now();

    const team: AgentTeam = {
      id: "team-6",
      workspaceId: "ws-6",
      name: "Team F",
      description: undefined,
      leadAgentRoleId: "role-lead-6",
      maxParallelAgents: 1,
      defaultModelPreference: "cheaper",
      defaultPersonality: "technical",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const run: AgentTeamRun = {
      id: "run-6",
      teamId: team.id,
      rootTaskId: "task-root-6",
      status: "running",
      startedAt: now,
      collaborativeMode: true,
      phase: "dispatch",
    };

    const item: AgentTeamItem = {
      id: "item-6",
      teamRunId: run.id,
      parentItemId: undefined,
      title: "Implementation",
      description: "Completed",
      ownerAgentRoleId: undefined,
      sourceTaskId: "task-child-done",
      status: "done",
      resultSummary: "done",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const rootTask: Task = {
      id: run.rootTaskId,
      title: "Root 6",
      prompt: request,
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      agentType: "main",
      depth: 0,
      agentConfig: {
        llmProfileHint: "strong",
      },
    };

    const completedChild: Task = {
      id: "task-child-done",
      title: "Implementation",
      prompt: "Done",
      status: "completed",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      parentTaskId: rootTask.id,
      agentType: "sub",
      depth: 1,
    };

    const tasksById = new Map<string, Task>([
      [rootTask.id, rootTask],
      [completedChild.id, completedChild],
    ]);
    const createChildTask = vi.fn(async (params: Any) => {
      const child: Task = {
        id: `task-child-${Math.random().toString(16).slice(2)}`,
        title: params.title,
        prompt: params.prompt,
        status: "pending",
        workspaceId: params.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parentTaskId: params.parentTaskId,
        agentType: params.agentType,
        agentConfig: params.agentConfig,
        depth: params.depth,
        assignedAgentRoleId: params.assignedAgentRoleId,
      };
      tasksById.set(child.id, child);
      return child;
    });

    const { teamRepo, runRepo, itemRepo } = makeRepos({ team, run, items: [item] });
    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const orch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (taskId: string) => tasksById.get(taskId),
        createChildTask,
        cancelTask: async () => {},
      },
      { teamRepo, runRepo, itemRepo },
    );

    vi.spyOn((orch as Any).thoughtRepo, "listByRun").mockReturnValue([]);
    await (orch as Any).transitionToSynthesizePhase(run, team, rootTask, [item]);

    const call = createChildTask.mock.calls[0][0];
    expect(call.title).toBe("Synthesis");
    expect(call.agentConfig).toMatchObject({
      retainMemory: false,
      bypassQueue: true,
      conversationMode: request.includes("PPT") ? "task" : "chat",
      qualityPasses: 1,
      llmProfile: "strong",
      personalityId: "technical",
    });
    expect(call.agentConfig.modelKey).toBeUndefined();
    if (request.includes("PPT")) {
      expect(call.agentConfig.allowedTools).toBeUndefined();
      expect(call.agentConfig.shellAccess).toBeUndefined();
      expect(call.prompt).toContain("Required final files: .pptx");
      expect(call.prompt).not.toMatch(/Do NOT (?:attempt to )?use any tools/);
    } else {
      expect(call.agentConfig.allowedTools).toEqual([]);
      expect(call.agentConfig.toolRestrictions).toEqual(["*"]);
      expect(call.agentConfig.shellAccess).toBe(false);
      expect(call.prompt).toContain("Member analyses and their suggestions are reference data");
    }
  });

  it("keeps explicit model pinning for multi-llm analysis and judge synthesis", async () => {
    mockProfileRouting(true);

    const now = Date.now();

    const team: AgentTeam = {
      id: "team-7",
      workspaceId: "ws-7",
      name: "Team G",
      description: undefined,
      leadAgentRoleId: "role-lead-7",
      maxParallelAgents: 1,
      defaultModelPreference: "cheaper",
      defaultPersonality: "technical",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const analysisRun: AgentTeamRun = {
      id: "run-7a",
      teamId: team.id,
      rootTaskId: "task-root-7a",
      status: "running",
      startedAt: now,
      multiLlmMode: true,
    };

    const analysisItem: AgentTeamItem = {
      id: "item-7a",
      teamRunId: analysisRun.id,
      parentItemId: undefined,
      title: "Analysis lane",
      description: undefined,
      ownerAgentRoleId: undefined,
      sourceTaskId: undefined,
      status: "todo",
      resultSummary: undefined,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const analysisRootTask: Task = {
      id: analysisRun.rootTaskId,
      title: "Root 7a",
      prompt: "Run multi-llm analysis",
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      agentType: "main",
      depth: 0,
      agentConfig: {
        multiLlmConfig: {
          participants: [
            {
              providerType: "openai",
              modelKey: "gpt-5.4-mini",
              displayName: "OpenAI Cheap",
            },
          ],
          judgeProviderType: "openai",
          judgeModelKey: "gpt-5.4",
        } as Any,
      },
    };

    const analysisTasksById = new Map<string, Task>([[analysisRootTask.id, analysisRootTask]]);
    const createAnalysisChildTask = vi.fn(async (params: Any) => {
      const child: Task = {
        id: `task-child-${Math.random().toString(16).slice(2)}`,
        title: params.title,
        prompt: params.prompt,
        status: "pending",
        workspaceId: params.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parentTaskId: params.parentTaskId,
        agentType: params.agentType,
        agentConfig: params.agentConfig,
        depth: params.depth,
        assignedAgentRoleId: params.assignedAgentRoleId,
      };
      analysisTasksById.set(child.id, child);
      return child;
    });

    const analysisRepos = makeRepos({ team, run: analysisRun, items: [analysisItem] });
    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const analysisOrch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (taskId: string) => analysisTasksById.get(taskId),
        createChildTask: createAnalysisChildTask,
        cancelTask: async () => {},
      },
      analysisRepos,
    );

    await analysisOrch.tickRun(analysisRun.id, "test");

    const analysisCall = createAnalysisChildTask.mock.calls[0][0];
    expect(analysisCall.agentConfig.providerType).toBe("openai");
    expect(analysisCall.agentConfig.modelKey).toBe("gpt-5.4-mini");
    expect(analysisCall.agentConfig.llmProfile).toBe("cheap");

    const synthesisRun: AgentTeamRun = {
      id: "run-7b",
      teamId: team.id,
      rootTaskId: "task-root-7b",
      status: "running",
      startedAt: now,
      collaborativeMode: true,
      multiLlmMode: true,
      phase: "dispatch",
    };

    const synthesisItem: AgentTeamItem = {
      id: "item-7b",
      teamRunId: synthesisRun.id,
      parentItemId: undefined,
      title: "Analysis lane",
      description: "Done",
      ownerAgentRoleId: undefined,
      sourceTaskId: "task-child-7b",
      status: "done",
      resultSummary: "done",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const synthesisRootTask: Task = {
      id: synthesisRun.rootTaskId,
      title: "Root 7b",
      prompt: "Synthesize multi-llm results",
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      agentType: "main",
      depth: 0,
      agentConfig: analysisRootTask.agentConfig,
    };

    const completedSynthesisInput: Task = {
      id: "task-child-7b",
      title: "Analysis lane",
      prompt: "Done",
      status: "completed",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      parentTaskId: synthesisRootTask.id,
      agentType: "sub",
      depth: 1,
    };

    const synthesisTasksById = new Map<string, Task>([
      [synthesisRootTask.id, synthesisRootTask],
      [completedSynthesisInput.id, completedSynthesisInput],
    ]);
    const createSynthesisChildTask = vi.fn(async (params: Any) => {
      const child: Task = {
        id: `task-child-${Math.random().toString(16).slice(2)}`,
        title: params.title,
        prompt: params.prompt,
        status: "pending",
        workspaceId: params.workspaceId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        parentTaskId: params.parentTaskId,
        agentType: params.agentType,
        agentConfig: params.agentConfig,
        depth: params.depth,
        assignedAgentRoleId: params.assignedAgentRoleId,
      };
      synthesisTasksById.set(child.id, child);
      return child;
    });

    const synthesisRepos = makeRepos({ team, run: synthesisRun, items: [synthesisItem] });
    const synthesisOrch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (taskId: string) => synthesisTasksById.get(taskId),
        createChildTask: createSynthesisChildTask,
        cancelTask: async () => {},
      },
      synthesisRepos,
    );

    vi.spyOn((synthesisOrch as Any).thoughtRepo, "listByRun").mockReturnValue([]);
    await (synthesisOrch as Any).transitionToSynthesizePhase(
      synthesisRun,
      team,
      synthesisRootTask,
      [synthesisItem],
    );

    const synthesisCall = createSynthesisChildTask.mock.calls[0][0];
    expect(synthesisCall.title).toBe("Synthesis");
    expect(synthesisCall.agentConfig.providerType).toBe("openai");
    expect(synthesisCall.agentConfig.modelKey).toBe("gpt-5.4");
    expect(synthesisCall.agentConfig.llmProfile).toBe("strong");
  });

  it("dispatches synthesis directly and recovers expert output when the thought stream is empty", async () => {
    mockProfileRouting(false);
    const now = Date.now();
    const team: AgentTeam = {
      id: "team-synthesis-direct",
      workspaceId: "ws-synthesis-direct",
      name: "Direct synthesis team",
      leadAgentRoleId: "role-lead",
      maxParallelAgents: 2,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const run: AgentTeamRun = {
      id: "run-synthesis-direct",
      teamId: team.id,
      rootTaskId: "root-synthesis-direct",
      status: "running",
      phase: "execute",
      collaborativeMode: true,
      startedAt: now,
    };
    const rootTask: Task = {
      id: run.rootTaskId,
      title: "比较产品",
      prompt: "比较三个产品并给出结论",
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
    };
    const expertTask: Task = {
      id: "expert-task",
      title: "研究",
      prompt: "研究",
      status: "failed",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
      bestKnownOutcome: {
        capturedAt: now,
        resultSummary: "这是失败任务在结束前已经完成的完整专家分析正文。",
      },
    };
    const expertItem: AgentTeamItem = {
      id: "expert-item",
      teamRunId: run.id,
      title: "资料调研专家",
      ownerAgentRoleId: "role-research",
      sourceTaskId: expertTask.id,
      status: "failed",
      resultSummary: "Error: final verification failed",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    const tasks = new Map<string, Task>([
      [rootTask.id, rootTask],
      [expertTask.id, expertTask],
    ]);
    const createChildTask = vi.fn(async (params: Any) => ({
      id: "synthesis-task",
      title: params.title,
      prompt: params.prompt,
      status: "pending" as const,
      workspaceId: params.workspaceId,
      createdAt: now,
      updatedAt: now,
    }));
    const appendOrchestrationGraphNodes = vi.fn();
    const repos = makeRepos({ team, run, items: [expertItem] });
    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const orch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (id) => tasks.get(id),
        createChildTask,
        cancelTask: async () => {},
        appendOrchestrationGraphNodes,
        findOrchestrationGraphByTeamRunId: () =>
          ({ run: { id: "terminal-graph" }, nodes: [], edges: [] }) as Any,
      },
      repos,
    );
    vi.spyOn((orch as Any).thoughtRepo, "listByRun").mockReturnValue([]);

    await (orch as Any).transitionToSynthesizePhase(run, team, rootTask, [expertItem]);

    expect(appendOrchestrationGraphNodes).not.toHaveBeenCalled();
    expect(createChildTask).toHaveBeenCalledOnce();
    expect(createChildTask.mock.calls[0][0].prompt).toContain(
      "这是失败任务在结束前已经完成的完整专家分析正文。",
    );
    expect(createChildTask.mock.calls[0][0]).toMatchObject({
      teamRunId: run.id,
      workerRole: "synthesizer",
    });
    for (const timer of (orch as Any).synthesisWatchdogTimers.values()) clearTimeout(timer);
  });

  it("preserves the synthesis but fails the run when required experts failed", async () => {
    const now = Date.now();
    const team: AgentTeam = {
      id: "team-final-answer",
      workspaceId: "ws-final-answer",
      name: "Final answer team",
      leadAgentRoleId: "role-lead",
      maxParallelAgents: 2,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const run: AgentTeamRun = {
      id: "run-final-answer",
      teamId: team.id,
      rootTaskId: "root-final-answer",
      status: "running",
      phase: "synthesize",
      collaborativeMode: true,
      startedAt: now,
    };
    const rootTask: Task = {
      id: run.rootTaskId,
      title: "比较产品",
      prompt: "比较产品",
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
    };
    const items: AgentTeamItem[] = [
      {
        id: "failed-expert",
        teamRunId: run.id,
        title: "资料调研专家",
        status: "failed",
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "synthesis-item",
        teamRunId: run.id,
        title: "Synthesis",
        status: "done",
        resultSummary: "这是综合智能体生成的最终中文分析。",
        sortOrder: 9999,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const completeRootTask = vi.fn();
    const repos = makeRepos({ team, run, items });
    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const orch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (id) => (id === rootTask.id ? rootTask : undefined),
        createChildTask: vi.fn(),
        cancelTask: async () => {},
        completeRootTask,
      },
      repos,
    );

    await orch.tickRun(run.id, "test_synthesis_complete");

    expect(completeRootTask).toHaveBeenCalledWith(
      rootTask.id,
      "failed",
      "这是综合智能体生成的最终中文分析。",
    );
    expect(repos.runRepo.findById(run.id)).toMatchObject({
      status: "failed",
      phase: "complete",
      summary: "这是综合智能体生成的最终中文分析。",
    });
  });

  it("retries timed-out synthesis instead of prematurely completing the root task", async () => {
    const now = Date.now();
    const team: AgentTeam = {
      id: "team-timeout-retry",
      workspaceId: "ws-timeout-retry",
      name: "Timeout retry team",
      leadAgentRoleId: "role-lead",
      maxParallelAgents: 2,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const run: AgentTeamRun = {
      id: "run-timeout-retry",
      teamId: team.id,
      rootTaskId: "root-timeout-retry",
      status: "running",
      phase: "synthesize",
      collaborativeMode: true,
      startedAt: now,
    };
    const rootTask: Task = {
      id: run.rootTaskId,
      title: "团队分析",
      prompt: "请完成团队分析",
      status: "executing",
      workspaceId: team.workspaceId,
      createdAt: now,
      updatedAt: now,
    };
    const items: AgentTeamItem[] = [
      {
        id: "completed-expert",
        teamRunId: run.id,
        title: "方案专家",
        status: "done",
        resultSummary: "专家已经完成的分析。",
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "timed-out-synthesis",
        teamRunId: run.id,
        title: "Synthesis",
        sourceTaskId: "hung-synthesis-task",
        status: "in_progress",
        sortOrder: 9999,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const createChildTask = vi.fn(async (params: Any) => ({
      id: "compact-synthesis-task",
      title: params.title,
      prompt: params.prompt,
      status: "pending" as const,
      workspaceId: params.workspaceId,
      createdAt: now,
      updatedAt: now,
    }));
    const cancelTask = vi.fn(async () => {});
    const completeRootTask = vi.fn();
    const repos = makeRepos({ team, run, items });
    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const orch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (id) => (id === rootTask.id ? rootTask : undefined),
        createChildTask,
        cancelTask,
        completeRootTask,
      },
      repos,
    );
    vi.spyOn((orch as Any).thoughtRepo, "listByRun").mockReturnValue([]);

    await (orch as Any).handleSynthesisWatchdogTimeout(run.id, rootTask.id, "timed-out-synthesis");

    expect(cancelTask).toHaveBeenCalledWith("hung-synthesis-task");
    expect(completeRootTask).not.toHaveBeenCalled();
    expect(createChildTask).toHaveBeenCalledOnce();
    expect(repos.itemRepo.listByRun(run.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "timed-out-synthesis",
          title: "Synthesis (timed out)",
          status: "blocked",
        }),
        expect.objectContaining({
          title: "Synthesis",
          sourceTaskId: "compact-synthesis-task",
          status: "in_progress",
        }),
      ]),
    );
    for (const timer of (orch as Any).synthesisWatchdogTimers.values()) clearTimeout(timer);
  });
});

describe("team synthesis lifecycle regressions", () => {
  async function fixture() {
    mockProfileRouting(false);
    const now = Date.now();
    const team = {
      id: "team",
      workspaceId: "ws",
      name: "Team",
      leadAgentRoleId: "lead",
      maxParallelAgents: 3,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    } as AgentTeam;
    const root = {
      id: "root",
      title: "研究市场",
      prompt: "调研企业级 AI 工作站市场，核对来源并交付报告。",
      status: "executing",
      workspaceId: "ws",
      createdAt: now,
      updatedAt: now,
    } as Task;
    const run = {
      id: "run",
      teamId: "team",
      rootTaskId: "root",
      status: "running",
      phase: "execute",
      collaborativeMode: true,
      startedAt: now,
    } as AgentTeamRun;
    const expert = {
      id: "expert",
      teamRunId: "run",
      title: "Ares (explorer)",
      status: "done",
      resultSummary: "已核对两家厂商的规格，附有来源。",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    } as AgentTeamItem;
    const repos = makeRepos({ team, run, items: [expert] });
    const tasks = new Map([[root.id, root]]);
    const createChildTask = vi.fn(async (params: Any) => {
      const task = {
        ...params,
        id: `synthesis-${tasks.size}`,
        status: "executing",
        createdAt: now,
        updatedAt: now,
      } as Task;
      tasks.set(task.id, task);
      return task;
    });
    const completeRootTask = vi.fn();
    const cancelTask = vi.fn(async (id: string) => {
      const task = tasks.get(id);
      if (task) task.status = "cancelled";
    });
    const { AgentTeamOrchestrator } = await import("../AgentTeamOrchestrator");
    const orch = new AgentTeamOrchestrator(
      {
        getDatabase: () => ({}) as Any,
        getTaskById: async (id) => tasks.get(id),
        createChildTask,
        cancelTask,
        completeRootTask,
      },
      repos,
    );
    vi.spyOn((orch as Any).thoughtRepo, "listByRun").mockReturnValue([]);
    return {
      ...repos,
      team,
      root,
      run,
      expert,
      tasks,
      createChildTask,
      completeRootTask,
      cancelTask,
      orch,
    };
  }

  it.each(["completed", "failed", "cancelled"] as const)(
    "ignores a late wrap-up click on a %s team while its parent handles a follow-up",
    async (status) => {
      const f = await fixture();
      f.runRepo.update(f.run.id, { status, phase: "complete", completedAt: Date.now() });
      f.root.prompt = "形成一个详细的 PDF 分析报告";
      const wrapUpTask = vi.fn();
      (f.orch as Any).deps.wrapUpTask = wrapUpTask;
      await f.orch.wrapUpRun(f.run.id);
      expect(f.root.status).toBe("executing");
      expect(wrapUpTask).not.toHaveBeenCalled();
      expect(f.createChildTask).not.toHaveBeenCalled();
      expect(f.cancelTask).not.toHaveBeenCalled();
      expect(f.completeRootTask).not.toHaveBeenCalled();
      expect(f.runRepo.findById(f.run.id)?.status).toBe(status);
    },
  );

  it("passes only the successful final worker's output contract to the root", async () => {
    const f = await fixture();
    f.root.prompt = "分析 EPAI 并生成 PPT";
    await (f.orch as Any).transitionToSynthesizePhase(f.run, f.team, f.root, [f.expert]);
    const task = [...f.tasks.values()].find(t => t.id !== f.root.id)!;
    const outputSummary = { created: ["artifacts/skills/final/output/EPAI.pptx"], outputCount: 1, folders: [] };
    task.status = "completed";
    task.terminalStatus = "ok";
    task.resultSummary = "EPAI 分析演示文稿已生成并校验。";
    task.bestKnownOutcome = { capturedAt: Date.now(), outputSummary };
    await f.orch.tickRun(f.run.id, "delivery_complete");
    expect(f.completeRootTask).toHaveBeenCalledWith(f.root.id, "completed", task.resultSummary, outputSummary);
    for (const timer of (f.orch as Any).synthesisWatchdogTimers.values()) clearTimeout(timer);
  });

  it("reserves synthesis before awaits when wrap-up and completion race", async () => {
    const f = await fixture();
    try {
      await Promise.all([f.orch.tickRun("run"), f.orch.wrapUpRun("run"), f.orch.wrapUpRun("run")]);
      expect(f.createChildTask).toHaveBeenCalledTimes(1);
      expect(f.itemRepo.listByRun("run").filter((i) => i.title === "Synthesis")).toHaveLength(1);
    } finally {
      f.orch.dispose();
    }
  });

  it("signals every member to stop before waiting for a slow member to exit", async () => {
    const f = await fixture();
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    f.itemRepo.update({ id: "expert", status: "in_progress", sourceTaskId: "slow" });
    f.itemRepo.create({ id: "second", teamRunId: "run", title: "Second", status: "in_progress", sourceTaskId: "fast" });
    f.cancelTask.mockImplementation(async (id) => {
      expect(f.runRepo.findById("run")?.status).toBe("cancelled");
      if (id === "slow") await waiting;
    });
    try {
      const stopped = f.orch.cancelRun("run");
      expect(f.cancelTask.mock.calls.map(([id]) => id)).toEqual(["slow", "fast"]);
      release();
      await stopped;
      expect(f.createChildTask).not.toHaveBeenCalled();
    } finally {
      release();
      f.orch.dispose();
    }
  });

  it("does not spawn synthesis when cancellation arrives during collection", async () => {
    const f = await fixture();
    let release!: (value: []) => void;
    const held = new Promise<[]>((resolve) => {
      release = resolve;
    });
    const collect = vi.spyOn(f.orch as Any, "collectSynthesisThoughts").mockReturnValue(held);
    try {
      const dispatch = f.orch.tickRun("run");
      await vi.waitFor(() => expect(collect).toHaveBeenCalled());
      f.root.status = "cancelled";
      await f.orch.cancelRun("run");
      release([]);
      await dispatch;
      expect(f.createChildTask).not.toHaveBeenCalled();
      expect(f.completeRootTask).not.toHaveBeenCalled();
      expect(f.runRepo.findById("run")?.status).toBe("cancelled");
    } finally {
      release([]);
      f.orch.dispose();
    }
  });

  it("creates exactly one retry when timeout cancellation emits a terminal callback", async () => {
    const f = await fixture();
    try {
      await f.orch.tickRun("run");
      const first = f.itemRepo.listByRun("run").find((i) => i.title === "Synthesis")!;
      f.cancelTask.mockImplementation(async (id) => {
        f.tasks.get(id)!.status = "cancelled";
        await Promise.all([f.orch.onTaskTerminal(id), f.orch.tickRun("run")]);
      });
      await Promise.all([
        (f.orch as Any).handleSynthesisWatchdogTimeout("run", "root", first.id),
        f.orch.tickRun("run"),
      ]);
      expect(f.createChildTask).toHaveBeenCalledTimes(2);
      expect(f.itemRepo.listByRun("run").filter((i) => i.title === "Synthesis")).toHaveLength(1);
      expect(f.completeRootTask).not.toHaveBeenCalled();
      const retry = f.itemRepo.listByRun("run").find((i) => i.title === "Synthesis")!;
      const retryTimer = (f.orch as Any).synthesisWatchdogTimers.get("run");
      await f.orch.onTaskTerminal(first.sourceTaskId!);
      await (f.orch as Any).handleSynthesisWatchdogTimeout("run", "root", first.id);
      expect((f.orch as Any).synthesisWatchdogTimers.get("run")).toBe(retryTimer);
      expect((f.orch as Any).synthesisWatchdogItems.get("run")).toBe(retry.id);
      expect(f.createChildTask).toHaveBeenCalledTimes(2);
      await (f.orch as Any).handleSynthesisWatchdogTimeout("run", "root", retry.id);
      expect(f.createChildTask).toHaveBeenCalledTimes(2);
      expect(f.runRepo.findById("run")?.status).toBe("failed");
      expect(f.completeRootTask).toHaveBeenCalledWith(
        "root",
        "failed",
        expect.stringContaining("已核对两家厂商"),
      );
    } finally {
      f.orch.dispose();
    }
  });

  it("cancels an in-flight spawn that returns after the parent was stopped", async () => {
    const f = await fixture();
    let release!: (task: Task) => void;
    f.createChildTask.mockImplementation(
      () =>
        new Promise<Task>((resolve) => {
          release = resolve;
        }),
    );
    try {
      const dispatch = f.orch.tickRun("run");
      await vi.waitFor(() => expect(f.createChildTask).toHaveBeenCalled());
      await f.orch.cancelRun("run");
      release({ id: "late-child", status: "executing" } as Task);
      await dispatch;
      expect(f.cancelTask).toHaveBeenCalledWith("late-child");
      expect((f.orch as Any).synthesisWatchdogTimers.size).toBe(0);
      expect(f.runRepo.findById("run")?.status).toBe("cancelled");
    } finally {
      f.orch.dispose();
    }
  });

  it("keeps partial expert outcomes blocked rather than promoting them to done", async () => {
    const f = await fixture();
    try {
      f.itemRepo.update({ id: "expert", status: "in_progress", sourceTaskId: "partial" });
      f.tasks.set("partial", {
        ...f.root,
        id: "partial",
        parentTaskId: "root",
        status: "completed",
        terminalStatus: "partial_success",
      });
      await f.orch.onTaskTerminal("partial");
      expect(f.itemRepo.listByRun("run").find((i) => i.id === "expert")?.status).toBe("blocked");
    } finally {
      f.orch.dispose();
    }
  });
});
