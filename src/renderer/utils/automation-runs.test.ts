import { describe, it, expect } from "vitest";
import type { Task } from "../../shared/types";
import type { CronJob } from "../../electron/cron/types";
import { buildAutomationRuns } from "./automation-runs";

describe("automation run history", () => {
  it("keeps results, states and delivery receipts separate when runs share a session", () => {
    const task: Task = { id: "shared", title: "Scheduled: Quote", prompt: "Price", status: "completed", source: "cron",
      workspaceId: "ws", createdAt: 1, updatedAt: 300, agentConfig: { scheduledJobId: "job" } };
    const job: CronJob = { id: "job", name: "Quote", enabled: false, createdAtMs: 1, updatedAtMs: 300,
      workspaceId: "ws", taskPrompt: "Price", schedule: { kind: "every", everyMs: 60_000 },
      delivery: { enabled: true, channelType: "weixin", channelId: "receiver" },
      state: { runHistory: [
        { runAtMs: 300, durationMs: 1, status: "ok", taskId: "shared", resultText: "new", deliverableStatus: "queued" },
        { runAtMs: 100, durationMs: 1, status: "ok", taskId: "shared", resultText: "old", deliverableStatus: "sent" },
      ] } };
    const runs = buildAutomationRuns([task], [job]);
    expect(runs.map(r => r.id)).toEqual(["job:300", "job:100"]);
    expect(runs.map(r => r.taskId)).toEqual(["shared", "shared"]);
    expect(runs.map(r => r.resultText)).toEqual(["new", "old"]);
    expect(runs.map(r => r.receipt?.deliverableStatus)).toEqual(["queued", "sent"]);
    expect(buildAutomationRuns([], [job])).toHaveLength(2);
    expect(buildAutomationRuns([{ ...task, heartbeatRunId: "maintenance" }], [job])).toHaveLength(0);
    expect(buildAutomationRuns([], [{ ...job, taskTitle: "Heartbeat: maintenance" }])).toHaveLength(0);
  });
});
