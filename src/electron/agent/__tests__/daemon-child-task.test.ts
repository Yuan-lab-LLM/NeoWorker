import { describe, expect, it, vi } from "vitest";

import { AgentDaemon } from "../daemon";

describe("AgentDaemon.createChildTask", () => {
  it("inherits project lineage from the parent task", async () => {
    const taskRepo = {
      findById: vi.fn().mockReturnValue({
        id: "parent-1",
        sessionId: "session-1",
        companyId: "company-1",
        goalId: "goal-1",
        projectId: "project-1",
      }),
      update: vi.fn(),
      create: vi.fn((task: Any) => ({
        id: "child-task-1",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...task,
      })),
    };
    const daemonLike = {
      taskRepo,
      startTask: vi.fn(),
      ensureCollaborativeRunForParentTask: vi.fn(),
    } as Any;

    const child = await AgentDaemon.prototype.createChildTask.call(daemonLike, {
      title: "Project child",
      prompt: "Continue the project work.",
      workspaceId: "ws-1",
      parentTaskId: "parent-1",
      agentType: "sub",
    });

    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        goalId: "goal-1",
        projectId: "project-1",
      }),
    );
    expect(child).toMatchObject({ projectId: "project-1", sessionId: "session-1" });
  });

  it("persists the original child prompt as rawPrompt", async () => {
    const taskRepo = {
      findById: vi.fn().mockReturnValue(undefined),
      update: vi.fn(),
      create: vi.fn((task: Any) => ({
        id: "child-task-1",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...task,
      })),
    };
    const daemonLike = {
      taskRepo,
      startTask: vi.fn(),
      ensureCollaborativeRunForParentTask: vi.fn(),
    } as Any;

    const child = await AgentDaemon.prototype.createChildTask.call(daemonLike, {
      title: "Architect",
      prompt: "Build the public portal and constitution.",
      workspaceId: "ws-1",
      parentTaskId: "parent-1",
      agentType: "sub",
    });

    expect(taskRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Build the public portal and constitution.",
        rawPrompt: "Build the public portal and constitution.",
      }),
    );
    expect(child.rawPrompt).toBe("Build the public portal and constitution.");
    expect(daemonLike.ensureCollaborativeRunForParentTask).toHaveBeenCalledWith("parent-1");
  });

  it("does not materialize an ad-hoc team run for orchestrator-owned team children", async () => {
    const taskRepo = {
      findById: vi.fn().mockReturnValue(undefined),
      update: vi.fn(),
      create: vi.fn((task: Any) => ({
        id: "child-task-1",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...task,
      })),
    };
    const daemonLike = {
      taskRepo,
      startTask: vi.fn(),
      ensureCollaborativeRunForParentTask: vi.fn(),
    } as Any;

    await AgentDaemon.prototype.createChildTask.call(daemonLike, {
      title: "Reviewer",
      prompt: "Review the patch.",
      workspaceId: "ws-1",
      parentTaskId: "parent-1",
      agentType: "sub",
      teamRunId: "team-run-1",
      teamItemId: "team-item-1",
    });

    expect(daemonLike.ensureCollaborativeRunForParentTask).not.toHaveBeenCalled();
  });

  it("keeps read-only worker roles shell-capable while denying file mutation", async () => {
    const taskRepo = {
      findById: vi.fn().mockReturnValue(undefined),
      update: vi.fn(),
      create: vi.fn((task: Any) => ({
        id: "child-task-1",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...task,
      })),
    };
    const daemonLike = {
      taskRepo,
      startTask: vi.fn(),
      ensureCollaborativeRunForParentTask: vi.fn(),
    } as Any;

    const child = await AgentDaemon.prototype.createChildTask.call(daemonLike, {
      title: "Researcher",
      prompt: "Inventory untracked files.",
      workspaceId: "ws-1",
      parentTaskId: "parent-1",
      agentType: "sub",
      workerRole: "researcher",
    });

    expect(child.agentConfig?.toolRestrictions).toContain("delete_file");
    expect(child.agentConfig?.toolRestrictions).toContain("group:write");
    expect(child.agentConfig?.toolRestrictions).not.toContain("group:destructive");
  });

  it("inherits full-access shell permission for child tasks", async () => {
    const taskRepo = {
      findById: vi.fn().mockReturnValue({
        id: "parent-1",
        agentConfig: {
          permissionMode: "bypass_permissions",
          shellAccess: true,
        },
      }),
      update: vi.fn(),
      create: vi.fn((task: Any) => ({
        id: "child-task-1",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...task,
      })),
    };
    const daemonLike = {
      taskRepo,
      startTask: vi.fn(),
      ensureCollaborativeRunForParentTask: vi.fn(),
    } as Any;

    const child = await AgentDaemon.prototype.createChildTask.call(daemonLike, {
      title: "Worker",
      prompt: "Run the delegated implementation.",
      workspaceId: "ws-1",
      parentTaskId: "parent-1",
      agentType: "sub",
      agentConfig: {
        maxTurns: 20,
      },
    });

    expect(child.agentConfig).toEqual(
      expect.objectContaining({
        permissionMode: "bypass_permissions",
        shellAccess: true,
      }),
    );
  });

  it("maps inherited full access to approve-all for external runtime child tasks", async () => {
    const taskRepo = {
      findById: vi.fn().mockReturnValue({
        id: "parent-1",
        agentConfig: {
          permissionMode: "bypass_permissions",
          shellAccess: true,
        },
      }),
      update: vi.fn(),
      create: vi.fn((task: Any) => ({
        id: "child-task-1",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...task,
      })),
    };
    const daemonLike = {
      taskRepo,
      startTask: vi.fn(),
      ensureCollaborativeRunForParentTask: vi.fn(),
    } as Any;

    const child = await AgentDaemon.prototype.createChildTask.call(daemonLike, {
      title: "Codex CLI Agent",
      prompt: "Run the delegated implementation.",
      workspaceId: "ws-1",
      parentTaskId: "parent-1",
      agentType: "sub",
      agentConfig: {
        externalRuntime: {
          kind: "acpx",
          agent: "codex",
          sessionMode: "persistent",
          outputMode: "json",
          permissionMode: "approve-reads",
        },
      },
    });

    expect(child.agentConfig?.externalRuntime?.permissionMode).toBe("approve-all");
  });

  it("normalizes legacy read-only system role restrictions so shell permission can carry to subagents", () => {
    const daemonLike = {
      agentRoleRepo: {
        findById: vi.fn().mockReturnValue({
          id: "role-reviewer",
          name: "reviewer",
          displayName: "Code Reviewer",
          isSystem: true,
          toolRestrictions: { deniedTools: ["group:write", "group:destructive"] },
        }),
      },
    } as Any;

    const result = (
      AgentDaemon.prototype as Any
    ).applyAgentRoleOverrides.call(daemonLike, {
      id: "task-1",
      assignedAgentRoleId: "role-reviewer",
      agentConfig: { toolRestrictions: ["group:destructive"] },
    });

    expect(result.changed).toBe(true);
    expect(result.task.agentConfig.toolRestrictions).toContain("group:write");
    expect(result.task.agentConfig.toolRestrictions).toContain("delete_file");
    expect(result.task.agentConfig.toolRestrictions).not.toContain("group:destructive");
  });

  it("keeps read-only helper child tasks shell-capable", async () => {
    const createChildTask = vi.fn().mockResolvedValue({ id: "child-task-1" });
    const daemonLike = {
      createChildTask,
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          id: "child-task-1",
          status: "completed",
          resultSummary: "done",
        }),
      },
    } as Any;

    const result = await (
      AgentDaemon.prototype as Any
    ).runReadOnlyChildTaskAndWait.call(daemonLike, {
      parentTask: { id: "parent-1", workspaceId: "ws-1", depth: 0 },
      title: "Read-only check",
      prompt: "Check git state.",
      timeoutMs: 10,
    });

    expect(result.status).toBe("completed");
    expect(createChildTask).toHaveBeenCalledWith(
      expect.objectContaining({
        agentConfig: expect.objectContaining({
          toolRestrictions: ["group:write", "delete_file", "group:image"],
        }),
      }),
    );
  });
});
