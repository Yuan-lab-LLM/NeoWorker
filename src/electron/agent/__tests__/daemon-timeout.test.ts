import { describe, expect, it, vi } from "vitest";

import { AgentDaemon } from "../daemon";

describe("AgentDaemon.handleTaskTimeout", () => {
  it("uses failTask so timeout terminal state is persisted consistently", async () => {
    const executor = {
      cancel: vi.fn().mockResolvedValue(undefined),
    };
    const activeTasks = new Map([
      [
        "task-timeout",
        {
          executor,
        },
      ],
    ]);

    const daemonLike = {
      activeTasks,
      failTask: vi.fn(),
      pendingTaskImages: new Map([["task-timeout", []]]),
      logEvent: vi.fn(),
    } as Any;

    await AgentDaemon.prototype.handleTaskTimeout.call(daemonLike, "task-timeout");

    expect(executor.cancel).toHaveBeenCalledWith("timeout");
    expect(activeTasks.has("task-timeout")).toBe(false);
    expect(daemonLike.failTask).toHaveBeenCalledWith(
      "task-timeout",
      "Task timed out - exceeded maximum allowed execution time",
    );
    expect(daemonLike.pendingTaskImages.has("task-timeout")).toBe(false);
    expect(daemonLike.logEvent).toHaveBeenCalledWith("task-timeout", "step_timeout", {
      message: "Task exceeded maximum execution time and was automatically cancelled",
    });
  });
});
