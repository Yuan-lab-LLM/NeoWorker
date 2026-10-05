import { describe, it, expect } from "vitest";
import type { Task, TaskEvent } from "../../../shared/types";
import { scheduledTaskResult, scheduledTaskStatus } from "../task-session";

const task: Task = { id: "session", title: "Quote", prompt: "Price", source: "cron", workspaceId: "ws",
  status: "completed", createdAt: 1, updatedAt: 100, completedAt: 100, resultSummary: "Old price",
  agentConfig: { scheduledJobId: "job" } };

describe("scheduled conversation turns", () => {
  it("does not deliver the previous completed turn while the next one is queued", () => {
    expect(scheduledTaskStatus(task, 200)).toMatchObject({ status: "queued", resultSummary: null });
    expect(scheduledTaskResult(task, [], 200)).toBeUndefined();
  });
  it("selects this run's output even when an earlier answer is much longer", () => {
    const event = (timestamp: number, message: string) => ({ id: String(timestamp), taskId: "session", timestamp,
      type: "assistant_message", payload: { message } }) as TaskEvent;
    const current = { ...task, completedAt: 300, updatedAt: 300, resultSummary: "New price" };
    expect(scheduledTaskStatus(current, 200).status).toBe("completed");
    expect(scheduledTaskResult(current, [event(90, "Previous price. ".repeat(100)), event(290, "New price")], 200)).toBe("New price");
  });
});
