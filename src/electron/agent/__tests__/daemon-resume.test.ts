import { describe, expect, it, vi } from "vitest";

import { AgentDaemon } from "../daemon";

function createDaemonLike(overrides?: Partial<Any>) {
  return {
    activeTasks: new Map([
      [
        "task-1",
        {
          lastAccessed: 0,
          status: "idle",
          executor: {
            resume: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    ]),
    taskRepo: {
      findById: vi.fn().mockReturnValue({
        id: "task-1",
        status: "paused",
        completedAt: null,
        terminalStatus: null,
      }),
    },
    updateTaskStatus: vi.fn(),
    logEvent: vi.fn(),
    ...overrides,
  } as Any;
}

describe("AgentDaemon.resumeTask", () => {
  it("does not reopen a task that is already terminal", async () => {
    const daemonLike = createDaemonLike({
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          id: "task-1",
          status: "executing",
          completedAt: Date.now(),
          terminalStatus: "ok",
        }),
      },
    });

    const resumed = await AgentDaemon.prototype.resumeTask.call(daemonLike, "task-1");

    expect(resumed).toBe(false);
    expect(daemonLike.updateTaskStatus).not.toHaveBeenCalled();
    expect(daemonLike.logEvent).not.toHaveBeenCalled();
    expect(daemonLike.activeTasks.get("task-1")?.executor.resume).not.toHaveBeenCalled();
  });

  it("skips duplicate executing writes when the task is already executing", async () => {
    const daemonLike = createDaemonLike({
      taskRepo: {
        findById: vi.fn().mockReturnValue({
          id: "task-1",
          status: "executing",
          completedAt: null,
          terminalStatus: null,
        }),
      },
    });

    const resumed = await AgentDaemon.prototype.resumeTask.call(daemonLike, "task-1");

    expect(resumed).toBe(true);
    expect(daemonLike.updateTaskStatus).not.toHaveBeenCalled();
    expect(daemonLike.logEvent).not.toHaveBeenCalled();
    expect(daemonLike.activeTasks.get("task-1")?.executor.resume).toHaveBeenCalledTimes(1);
  });

  it("resumes a paused task and marks it executing once", async () => {
    const daemonLike = createDaemonLike();

    const resumed = await AgentDaemon.prototype.resumeTask.call(daemonLike, "task-1");

    expect(resumed).toBe(true);
    expect(daemonLike.updateTaskStatus).toHaveBeenCalledWith("task-1", "executing");
    expect(daemonLike.logEvent).toHaveBeenCalledWith("task-1", "task_resumed", {
      message: "Task resumed",
    });
    expect(daemonLike.activeTasks.get("task-1")?.executor.resume).toHaveBeenCalledTimes(1);
  });
});
