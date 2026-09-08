import { describe, expect, it, vi } from "vitest";
import { AgentDaemon } from "../daemon";

describe("AgentDaemon follow-up permission overrides", () => {
  it("preserves task-scoped shell access when a workspace refreshes", () => {
    const updateWorkspace = vi.fn();
    const workspace = {
      id: "workspace-1",
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: false,
      },
    } as Any;
    const task = {
      id: "task-shell-refresh",
      workspaceId: workspace.id,
      agentConfig: { shellAccess: true },
    } as Any;
    const daemonLike = {
      activeTasks: new Map([
        [
          task.id,
          {
            executor: {
              getWorkspaceId: () => workspace.id,
              updateWorkspace,
            },
            status: "active",
          },
        ],
      ]),
      workspaceRepo: { findById: vi.fn().mockReturnValue(workspace) },
      taskRepo: { findById: vi.fn().mockReturnValue(task) },
      taskAccessSnapshotByTaskId: new Map([
        [
          task.id,
          {
            shellAccess: true,
            workspaceScopes: [
              {
                workspaceId: workspace.id,
                rootPath: "/tmp/workspace",
                access: "write",
                primary: true,
              },
            ],
          },
        ],
      ]),
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    daemonLike.refreshActiveExecutorsForWorkspace(workspace.id);

    expect(updateWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: expect.objectContaining({ shell: true }),
      }),
    );
  });

  it("reorders the real deferred queue without dropping newer entries", () => {
    const daemonLike = {
      deferredUserFollowUps: new Map([
        [
          "task-1",
          [
            {
              queueId: "queue-a",
              message: "第一条",
              displayMessage: "第一条",
              queuedAt: 1,
            },
            {
              queueId: "queue-b",
              message: "第二条",
              displayMessage: "第二条",
              queuedAt: 2,
            },
            {
              queueId: "queue-c",
              message: "第三条",
              displayMessage: "第三条",
              queuedAt: 3,
              images: [{ id: "attachment-c" }],
            },
          ],
        ],
      ]),
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    const result = daemonLike.reorderQueuedFollowUps("task-1", [
      "queue-c",
      "queue-a",
    ]);

    expect(result.map((item: Any) => item.id)).toEqual([
      "queue-c",
      "queue-a",
      "queue-b",
    ]);
    expect(
      daemonLike.deferredUserFollowUps
        .get("task-1")
        .map((item: Any) => item.queueId),
    ).toEqual(["queue-c", "queue-a", "queue-b"]);
    expect(result[0].attachmentCount).toBe(1);
  });

  it("repairs stale chat metadata when a follow-up switches to execute mode", () => {
    const task = {
      id: "task-mode-switch",
      agentConfig: {
        executionMode: "execute",
        executionModeSource: "user",
        conversationMode: "chat",
        taskIntent: "chat",
        taskDomain: "auto",
      },
    } as Any;
    const daemonLike = Object.create(AgentDaemon.prototype) as Any;

    const result = (AgentDaemon.prototype as Any).applyTaskFollowUpOverrides.call(
      daemonLike,
      task,
      { executionMode: "execute", taskDomain: "research" },
    );

    expect(result.changed).toBe(true);
    expect(result.task.agentConfig).toEqual(
      expect.objectContaining({
        executionMode: "execute",
        executionModeSource: "user",
        conversationMode: "task",
        taskIntent: "execution",
        taskDomain: "research",
      }),
    );
  });

  it.each([
    ["chat", "chat", "chat"],
    ["plan", "task", "planning"],
    ["analyze", "task", "advice"],
    ["execute", "task", "execution"],
  ] as const)(
    "maps a %s follow-up to the matching backend mode metadata",
    (executionMode, conversationMode, taskIntent) => {
      const task = {
        id: `task-${executionMode}`,
        agentConfig: {
          executionMode: "chat",
          executionModeSource: "user",
          conversationMode: "chat",
          taskIntent: "chat",
        },
      } as Any;
      const daemonLike = Object.create(AgentDaemon.prototype) as Any;

      const result = (AgentDaemon.prototype as Any).applyTaskFollowUpOverrides.call(
        daemonLike,
        task,
        { executionMode },
      );

      expect(result.task.agentConfig).toEqual(
        expect.objectContaining({
          executionMode,
          executionModeSource: "user",
          conversationMode,
          taskIntent,
        }),
      );
    },
  );

  it("persists a skill selected for the next turn without changing the saved mode", () => {
    const task = {
      id: "task-skill-follow-up",
      agentConfig: {
        executionMode: "chat",
        conversationMode: "chat",
        taskIntent: "chat",
        requestedSkillId: "old-skill",
      },
    } as Any;
    const daemonLike = Object.create(AgentDaemon.prototype) as Any;

    const result = (AgentDaemon.prototype as Any).applyTaskFollowUpOverrides.call(
      daemonLike,
      task,
      { requestedSkillId: "web-research" },
    );

    expect(result.changed).toBe(true);
    expect(result.task.agentConfig).toEqual(
      expect.objectContaining({
        executionMode: "chat",
        conversationMode: "chat",
        taskIntent: "chat",
        requestedSkillId: "web-research",
      }),
    );
  });

  it("runs a deferred user message as a separate turn after the active turn finishes", async () => {
    const executor = {
      drainAllPendingFollowUps: vi.fn().mockReturnValue([]),
      suppressNextUserMessageEvent: vi.fn(),
    };
    const daemonLike = {
      taskRepo: {
        findById: vi.fn().mockReturnValue({ status: "completed" }),
      },
      deferredUserFollowUps: new Map([
        [
          "task-1",
          [
            {
              message: "上海的天气呢？",
              agentConfigOverride: { allowUserInput: false },
            },
          ],
        ],
      ]),
      deferredUserFollowUpDrains: new Map(),
      deferredUserFollowUpDispatches: new Set(),
      sendMessage: vi.fn().mockResolvedValue({ queued: false }),
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    (AgentDaemon.prototype as Any).processOrphanedFollowUps.call(daemonLike, "task-1", executor);
    await Promise.resolve();
    await Promise.resolve();

    expect(daemonLike.deferredUserFollowUps.has("task-1")).toBe(false);
    expect(executor.suppressNextUserMessageEvent).not.toHaveBeenCalled();
    expect(daemonLike.sendMessage).toHaveBeenCalledWith(
      "task-1",
      "上海的天气呢？",
      undefined,
      undefined,
      { agentConfigOverride: { allowUserInput: false } },
    );
  });

  it("drains multiple deferred user turns strictly in send order", async () => {
    let releaseFirstTurn: (() => void) | undefined;
    const firstTurn = new Promise<void>((resolve) => {
      releaseFirstTurn = resolve;
    });
    const executor = {
      drainAllPendingFollowUps: vi.fn().mockReturnValue([]),
      suppressNextUserMessageEvent: vi.fn(),
    };
    const sendMessage = vi
      .fn()
      .mockImplementationOnce(async () => {
        await firstTurn;
        return { queued: false };
      })
      .mockResolvedValueOnce({ queued: false });
    const daemonLike = {
      taskRepo: {
        findById: vi.fn().mockReturnValue({ status: "completed" }),
      },
      deferredUserFollowUps: new Map([
        [
          "task-1",
          [
            { message: "第一条排队消息" },
            { message: "第二条排队消息" },
          ],
        ],
      ]),
      deferredUserFollowUpDrains: new Map(),
      deferredUserFollowUpDispatches: new Set(),
      sendMessage,
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    (AgentDaemon.prototype as Any).processOrphanedFollowUps.call(daemonLike, "task-1", executor);
    await Promise.resolve();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(daemonLike.deferredUserFollowUps.get("task-1")).toEqual([
      { message: "第二条排队消息" },
    ]);
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      "task-1",
      "第一条排队消息",
      undefined,
      undefined,
      {},
    );

    releaseFirstTurn?.();
    await firstTurn;
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      "task-1",
      "第二条排队消息",
      undefined,
      undefined,
      {},
    );
  });

  it("preserves queued turn context when draining without an app restart", async () => {
    const executor = {
      isRunning: false,
      drainAllPendingFollowUps: vi.fn().mockReturnValue([]),
      suppressNextUserMessageEvent: vi.fn(),
    };
    const followUp = {
      queueId: "queue-context",
      displayMessage: "继续修改当前文档",
      message: "## Active Artifact Context\n\n继续修改当前文档",
      queuedAt: 1,
      activeArtifactContext: { kind: "document", path: "/tmp/report.docx" },
      executionMode: "execute",
      taskDomain: "documents",
      requestedSkillId: "officecli",
      permissionMode: "bypass_permissions",
      shellAccess: true,
      integrationMentions: [{ integrationId: "drive", label: "Drive" }],
      agentConfigOverride: { allowUserInput: false },
      userMessageAlreadyEmitted: true,
      effectiveMessageAlreadyBuilt: true,
    } as Any;
    const sendMessage = vi.fn().mockResolvedValue({ queued: false });
    const daemonLike = {
      taskRepo: {
        findById: vi.fn().mockReturnValue({ status: "completed" }),
      },
      deferredUserFollowUps: new Map([["task-1", [followUp]]]),
      deferredUserFollowUpDrains: new Map(),
      deferredUserFollowUpDispatches: new Set(),
      deferredUserFollowUpRetryTimers: new Map(),
      sendMessage,
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    (AgentDaemon.prototype as Any).processOrphanedFollowUps.call(
      daemonLike,
      "task-1",
      executor,
    );
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));

    expect(sendMessage).toHaveBeenCalledWith(
      "task-1",
      followUp.message,
      undefined,
      undefined,
      expect.objectContaining({
        activeArtifactContext: followUp.activeArtifactContext,
        executionMode: "execute",
        taskDomain: "documents",
        requestedSkillId: "officecli",
        permissionMode: "bypass_permissions",
        shellAccess: true,
        integrationMentions: followUp.integrationMentions,
        agentConfigOverride: followUp.agentConfigOverride,
        userMessageAlreadyEmitted: true,
        effectiveMessageAlreadyBuilt: true,
        deferredQueueDispatch: true,
      }),
    );
  });

  it("keeps the queue intact until the previous run has reached a settled state", async () => {
    vi.useFakeTimers();
    const executor = {
      isRunning: false,
      drainAllPendingFollowUps: vi.fn().mockReturnValue([]),
      suppressNextUserMessageEvent: vi.fn(),
    };
    const sendMessage = vi.fn().mockResolvedValue({ queued: false });
    const queued = [{ message: "不要打断上一轮" }];
    const daemonLike = {
      taskRepo: {
        findById: vi.fn().mockReturnValue({ status: "executing" }),
      },
      deferredUserFollowUps: new Map([["task-1", queued]]),
      deferredUserFollowUpDrains: new Map(),
      deferredUserFollowUpDispatches: new Set(),
      deferredUserFollowUpRetryTimers: new Map(),
      sendMessage,
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    (AgentDaemon.prototype as Any).processOrphanedFollowUps.call(
      daemonLike,
      "task-1",
      executor,
    );
    await Promise.resolve();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(daemonLike.deferredUserFollowUps.get("task-1")).toEqual(queued);
    expect(daemonLike.deferredUserFollowUpDrains.size).toBe(0);
    expect(daemonLike.deferredUserFollowUpRetryTimers.size).toBe(1);

    daemonLike.taskRepo.findById.mockReturnValue({ status: "completed" });
    await vi.advanceTimersByTimeAsync(250);
    await Promise.resolve();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(daemonLike.deferredUserFollowUpRetryTimers.size).toBe(0);
    vi.useRealTimers();
  });

  it("requeues a follow-up when dispatch fails instead of dropping the message", async () => {
    vi.useFakeTimers();
    const executor = {
      isRunning: false,
      drainAllPendingFollowUps: vi.fn().mockReturnValue([]),
      suppressNextUserMessageEvent: vi.fn(),
    };
    const queued = {
      queueId: "queue-failed-dispatch",
      message: "请继续处理",
      displayMessage: "请继续处理",
      queuedAt: 1,
    };
    const daemonLike = {
      taskRepo: {
        findById: vi.fn().mockReturnValue({ status: "completed" }),
      },
      deferredUserFollowUps: new Map([["task-1", [queued]]]),
      deferredUserFollowUpDrains: new Map(),
      deferredUserFollowUpDispatches: new Set(),
      deferredUserFollowUpRetryTimers: new Map(),
      sendMessage: vi.fn().mockRejectedValue(new Error("temporary dispatch failure")),
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    (AgentDaemon.prototype as Any).processOrphanedFollowUps.call(
      daemonLike,
      "task-1",
      executor,
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(daemonLike.deferredUserFollowUps.get("task-1")).toEqual([queued]);
    expect(daemonLike.deferredUserFollowUpRetryTimers.size).toBe(1);

    vi.useRealTimers();
  });

  it("applies full-access follow-up overrides before deferring a separate turn on an active executor", async () => {
    const task = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      title: "Existing task",
      workspaceId: "workspace-1",
      agentConfig: {
        permissionMode: "default",
      },
    };
    const workspace = {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace",
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: false,
      },
      createdAt: Date.now(),
    };
    const executor = {
      isRunning: true,
      drainAllPendingFollowUps: vi.fn().mockReturnValue([]),
      updateTaskAgentConfig: vi.fn(),
      updateWorkspace: vi.fn(),
    };
    let accessPolicy = {
      taskId: task.id,
      revision: 1,
      connectorIds: [],
      workspaceScopes: [
        {
          workspaceId: workspace.id,
          rootPath: workspace.path,
          access: "write",
          primary: true,
        },
      ],
      permissionMode: "default",
      shellAccess: false,
      effectiveFromTurn: 1,
      updatedAt: Date.now(),
    };
    const accessPolicyUpdate = vi.fn((_taskId, _revision, patch) => {
      accessPolicy = {
        ...accessPolicy,
        ...patch,
        revision: accessPolicy.revision + 1,
        updatedAt: Date.now(),
      };
      return accessPolicy;
    });
    const daemonLike = {
      activeTasks: new Map([
        [
          task.id,
          {
            executor,
            lastAccessed: 0,
            status: "active",
          },
        ],
      ]),
      taskRepo: {
        findById: vi.fn().mockReturnValue(task),
        update: vi.fn(),
        touch: vi.fn(),
      },
      workspaceRepo: {
        findById: vi.fn().mockReturnValue(workspace),
      },
      annotationRepo: {
        listOpenByTask: vi.fn().mockReturnValue([]),
      },
      taskAccessPolicyRepo: {
        get: vi.fn(() => accessPolicy),
        update: accessPolicyUpdate,
      },
      taskAccessSnapshotByTaskId: new Map(),
      deferredUserFollowUps: new Map(),
      logEvent: vi.fn(),
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    const result = await AgentDaemon.prototype.sendMessage.call(
      daemonLike,
      task.id,
      "Continue with full access",
      undefined,
      undefined,
      { permissionMode: "bypass_permissions", shellAccess: true },
    );

    expect(result).toEqual({
      queued: true,
      queueItem: expect.objectContaining({
        taskId: task.id,
        message: "Continue with full access",
      }),
    });
    expect(daemonLike.taskRepo.update).toHaveBeenCalledWith(task.id, {
      agentConfig: {
        permissionMode: "bypass_permissions",
        shellAccess: true,
      },
    });
    expect(accessPolicyUpdate).toHaveBeenCalledWith(
      task.id,
      1,
      expect.objectContaining({
        permissionMode: "bypass_permissions",
        shellAccess: true,
      }),
    );
    expect(daemonLike.taskAccessSnapshotByTaskId.get(task.id)).toEqual(
      expect.objectContaining({
        revision: 2,
        permissionMode: "bypass_permissions",
        shellAccess: true,
      }),
    );
    expect(executor.updateTaskAgentConfig).toHaveBeenCalledWith({
      permissionMode: "bypass_permissions",
      shellAccess: true,
    });
    expect(executor.updateWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        permissions: expect.objectContaining({
          shell: true,
        }),
      }),
    );
    expect(daemonLike.deferredUserFollowUps.get(task.id)).toEqual([
      expect.objectContaining({
        displayMessage: "Continue with full access",
        message: "Continue with full access",
        images: undefined,
        quotedAssistantMessage: undefined,
      }),
    ]);
    expect(daemonLike.logEvent).toHaveBeenCalledWith(
      task.id,
      "user_message",
      expect.objectContaining({
        message: "Continue with full access",
        followUp: true,
        queued: true,
      }),
    );
  });

  it("applies automation agent config overrides without persisting them to the task", async () => {
    const task = {
      id: "650e8400-e29b-41d4-a716-446655440000",
      title: "Existing task",
      workspaceId: "workspace-1",
      agentConfig: {
        permissionMode: "default",
      },
    };
    const workspace = {
      id: "workspace-1",
      name: "Workspace",
      path: "/tmp/workspace",
      permissions: {
        read: true,
        write: true,
        delete: false,
        network: true,
        shell: false,
      },
      createdAt: Date.now(),
    };
    const executor = {
      isRunning: true,
      drainAllPendingFollowUps: vi.fn().mockReturnValue([]),
      updateTaskAgentConfig: vi.fn(),
      updateWorkspace: vi.fn(),
    };
    const daemonLike = {
      activeTasks: new Map([
        [
          task.id,
          {
            executor,
            lastAccessed: 0,
            status: "active",
          },
        ],
      ]),
      taskRepo: {
        findById: vi.fn().mockReturnValue(task),
        update: vi.fn(),
        touch: vi.fn(),
      },
      workspaceRepo: {
        findById: vi.fn().mockReturnValue(workspace),
      },
      annotationRepo: {
        listOpenByTask: vi.fn().mockReturnValue([]),
      },
      taskAccessSnapshotByTaskId: new Map(),
      deferredUserFollowUps: new Map(),
      logEvent: vi.fn(),
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    const agentConfigOverride = {
      toolRestrictions: ["run_command"],
      allowUserInput: false,
    };
    const result = await AgentDaemon.prototype.sendMessage.call(
      daemonLike,
      task.id,
      "Scheduled wake",
      undefined,
      undefined,
      { agentConfigOverride },
    );

    expect(result).toEqual({
      queued: true,
      queueItem: expect.objectContaining({
        taskId: task.id,
        message: "Scheduled wake",
      }),
    });
    expect(daemonLike.taskRepo.update).not.toHaveBeenCalled();
    expect(executor.updateTaskAgentConfig).toHaveBeenCalledWith({
      permissionMode: "default",
      toolRestrictions: ["run_command"],
      allowUserInput: false,
    });
    expect(daemonLike.deferredUserFollowUps.get(task.id)).toEqual([
      expect.objectContaining({
        displayMessage: "Scheduled wake",
        message: "Scheduled wake",
        images: undefined,
        quotedAssistantMessage: undefined,
        agentConfigOverride,
      }),
    ]);
  });

  it("rehydrates a queued follow-up from durable timeline markers after restart", () => {
    const task = {
      id: "task-rehydrate-follow-up",
      status: "executing",
      completedAt: undefined,
      terminalStatus: undefined,
    } as Any;
    const daemonLike = {
      taskRepo: {
        findByStatus: vi.fn().mockReturnValue([task]),
      },
      eventRepo: {
        findByTaskIdAndTypes: vi.fn().mockReturnValue([
          {
            id: "event-user-1",
            taskId: task.id,
            timestamp: 100,
            type: "user_message",
            payload: {
              message: "重启后继续",
              effectiveMessage: "重启后继续",
              followUp: true,
              queued: true,
              queueId: "queue-1",
              queuedAt: 100,
              attachmentCount: 1,
            },
          },
          {
            id: "event-update-1",
            taskId: task.id,
            timestamp: 110,
            type: "follow_up_queue_updated",
            payload: {
              queueId: "queue-1",
              message: "重启后继续（已修改）",
              effectiveMessage: "重启后继续（已修改）",
            },
          },
        ]),
      },
      deferredUserFollowUps: new Map(),
      restoredDeferredFollowUpTaskIds: new Set(),
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    const terminalTasks =
      (AgentDaemon.prototype as Any).restorePersistedDeferredUserFollowUps.call(
        daemonLike,
      );

    expect(terminalTasks).toEqual([]);
    expect(daemonLike.deferredUserFollowUps.get(task.id)).toEqual([
      expect.objectContaining({
        queueId: "queue-1",
        displayMessage: "重启后继续（已修改）",
        message: "重启后继续（已修改）",
        attachmentCount: 1,
        userMessageAlreadyEmitted: true,
      }),
    ]);
  });

  it("schedules durable queued follow-ups on terminal tasks for replay", () => {
    const task = {
      id: "task-terminal-follow-up",
      status: "completed",
      completedAt: 200,
      terminalStatus: "completed",
    } as Any;
    const daemonLike = {
      taskRepo: {
        findByStatus: vi.fn().mockReturnValue([task]),
      },
      eventRepo: {
        findByTaskIdAndTypes: vi.fn().mockReturnValue([
          {
            id: "event-user-2",
            taskId: task.id,
            timestamp: 100,
            type: "user_message",
            payload: {
              message: "终态任务也不能丢",
              followUp: true,
              queued: true,
              queueId: "queue-2",
              queuedAt: 100,
            },
          },
        ]),
      },
      deferredUserFollowUps: new Map(),
      restoredDeferredFollowUpTaskIds: new Set(),
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    const terminalTasks =
      (AgentDaemon.prototype as Any).restorePersistedDeferredUserFollowUps.call(
        daemonLike,
      );

    expect(terminalTasks).toEqual([task.id]);
    expect(daemonLike.deferredUserFollowUps.get(task.id)).toEqual([
      expect.objectContaining({
        displayMessage: "终态任务也不能丢",
        userMessageAlreadyEmitted: true,
      }),
    ]);
  });

  it("replays the durable effective message and turn options on terminal tasks", async () => {
    const task = {
      id: "task-terminal-replay-options",
      status: "completed",
      completedAt: 200,
      terminalStatus: "completed",
    } as Any;
    const followUp = {
      queueId: "queue-replay-options",
      displayMessage: "请继续修改",
      message: "## Active Artifact Context\n\n请继续修改",
      queuedAt: 100,
      activeArtifactContext: { kind: "document", path: "/tmp/report.docx" },
      executionMode: "execute",
      taskDomain: "documents",
      requestedSkillId: "officecli",
      permissionMode: "bypass_permissions",
      shellAccess: true,
      integrationMentions: [{ integrationId: "drive", label: "Drive" }],
      agentConfigOverride: { allowUserInput: false },
      userMessageAlreadyEmitted: true,
      effectiveMessageAlreadyBuilt: true,
    } as Any;
    const sendMessage = vi.fn().mockResolvedValue({ queued: false });
    const daemonLike = {
      taskRepo: { findById: vi.fn().mockReturnValue(task) },
      activeTasks: new Map(),
      deferredUserFollowUps: new Map([[task.id, [followUp]]]),
      restoredDeferredFollowUpRetryTimers: new Map(),
      sendMessage,
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    await (AgentDaemon.prototype as Any).dispatchRestoredDeferredFollowUps.call(
      daemonLike,
      task.id,
    );

    expect(sendMessage).toHaveBeenCalledWith(
      task.id,
      followUp.message,
      undefined,
      undefined,
      expect.objectContaining({
        activeArtifactContext: followUp.activeArtifactContext,
        executionMode: "execute",
        taskDomain: "documents",
        requestedSkillId: "officecli",
        permissionMode: "bypass_permissions",
        shellAccess: true,
        integrationMentions: followUp.integrationMentions,
        agentConfigOverride: followUp.agentConfigOverride,
        userMessageAlreadyEmitted: true,
        effectiveMessageAlreadyBuilt: true,
        deferredQueueDispatch: true,
      }),
    );
    expect(daemonLike.deferredUserFollowUps.has(task.id)).toBe(false);
  });

  it("requeues and schedules a retry when terminal replay fails", async () => {
    vi.useFakeTimers();
    const task = {
      id: "task-terminal-replay-retry",
      status: "completed",
      completedAt: 200,
      terminalStatus: "completed",
    } as Any;
    const followUp = {
      queueId: "queue-replay-retry",
      displayMessage: "重试这条",
      message: "重试这条",
      queuedAt: 100,
      userMessageAlreadyEmitted: true,
      effectiveMessageAlreadyBuilt: true,
    } as Any;
    const daemonLike = {
      taskRepo: { findById: vi.fn().mockReturnValue(task) },
      activeTasks: new Map(),
      deferredUserFollowUps: new Map([[task.id, [followUp]]]),
      restoredDeferredFollowUpRetryTimers: new Map(),
      sendMessage: vi.fn().mockRejectedValue(new Error("temporary")),
    } as Any;
    Object.setPrototypeOf(daemonLike, AgentDaemon.prototype);

    await (AgentDaemon.prototype as Any).dispatchRestoredDeferredFollowUps.call(
      daemonLike,
      task.id,
    );

    expect(daemonLike.deferredUserFollowUps.get(task.id)).toEqual([followUp]);
    expect(daemonLike.restoredDeferredFollowUpRetryTimers.size).toBe(1);
    vi.clearAllTimers();
    vi.useRealTimers();
  });
});
