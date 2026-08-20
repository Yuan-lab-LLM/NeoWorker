import { describe, expect, it } from "vitest";

import type { Task, TaskEvent } from "../../../shared/types";
import {
  buildTaskTraceMetrics,
  buildTaskTraceRunSummaries,
  buildTaskTraceSiblingRuns,
  getTaskTraceSessionId,
} from "../task-trace-projection";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "task-1",
    title: overrides.title ?? "Trace task",
    prompt: overrides.prompt ?? "Inspect the repository state",
    status: overrides.status ?? "executing",
    workspaceId: overrides.workspaceId ?? "workspace-1",
    createdAt: overrides.createdAt ?? 1_000,
    updatedAt: overrides.updatedAt ?? 2_000,
    ...overrides,
  } as Task;
}

function makeEvent(overrides: Partial<TaskEvent> = {}): TaskEvent {
  return {
    id: overrides.id ?? "evt-1",
    taskId: overrides.taskId ?? "task-1",
    timestamp: overrides.timestamp ?? 1_500,
    type: overrides.type ?? "tool_call",
    payload: overrides.payload ?? {},
    schemaVersion: 2,
    ...overrides,
  } as TaskEvent;
}

describe("task-trace-projection", () => {
  it("uses sessionId when present and falls back to task id otherwise", () => {
    expect(getTaskTraceSessionId(makeTask({ id: "task-a", sessionId: "sess-1" }))).toBe("sess-1");
    expect(getTaskTraceSessionId(makeTask({ id: "task-b", sessionId: undefined }))).toBe("task-b");
  });

  it("groups runs by session and orders sibling runs by continuation window", () => {
    const siblings = buildTaskTraceSiblingRuns([
      makeTask({
        id: "task-3",
        sessionId: "sess-1",
        title: "Third run",
        continuationWindow: 3,
        createdAt: 3_000,
        updatedAt: 3_500,
      }),
      makeTask({
        id: "task-1",
        sessionId: "sess-1",
        title: "First run",
        continuationWindow: 1,
        createdAt: 1_000,
        updatedAt: 1_500,
      }),
      makeTask({
        id: "task-2",
        sessionId: "sess-1",
        title: "Second run",
        continuationWindow: 2,
        createdAt: 2_000,
        updatedAt: 2_500,
      }),
    ]);

    expect(siblings.map((run) => run.taskId)).toEqual(["task-1", "task-2", "task-3"]);
  });

  it("returns one run summary per session sorted by latest update", () => {
    const summaries = buildTaskTraceRunSummaries([
      makeTask({
        id: "task-a1",
        sessionId: "sess-a",
        title: "Session A",
        updatedAt: 4_000,
      }),
      makeTask({
        id: "task-a2",
        sessionId: "sess-a",
        title: "Session A follow-up",
        updatedAt: 5_000,
        continuationWindow: 2,
      }),
      makeTask({
        id: "task-b1",
        sessionId: "sess-b",
        title: "Session B",
        updatedAt: 6_000,
      }),
      makeTask({
        id: "task-c1",
        title: "Standalone run",
        updatedAt: 3_000,
      }),
    ]);

    expect(summaries).toHaveLength(3);
    expect(summaries.map((summary) => summary.sessionId)).toEqual(["sess-b", "sess-a", "task-c1"]);
    expect(summaries.find((summary) => summary.sessionId === "sess-a")).toMatchObject({
      taskId: "task-a2",
      runCount: 2,
    });
  });

  it("filters sessions by workspace, status, and query across sibling tasks", () => {
    const tasks = [
      makeTask({
        id: "task-a1",
        sessionId: "sess-a",
        title: "Initial research",
        branchLabel: "main",
        workspaceId: "workspace-1",
        status: "completed",
        updatedAt: 2_000,
      }),
      makeTask({
        id: "task-a2",
        sessionId: "sess-a",
        title: "Follow-up patch",
        branchLabel: "fix/perf",
        workspaceId: "workspace-1",
        status: "failed",
        updatedAt: 3_000,
      }),
      makeTask({
        id: "task-b1",
        sessionId: "sess-b",
        title: "Other workspace",
        workspaceId: "workspace-2",
        status: "completed",
        updatedAt: 4_000,
      }),
    ];

    const workspaceFiltered = buildTaskTraceRunSummaries(
      tasks.filter((task) => task.workspaceId === "workspace-1"),
      { status: "failed", query: "fix/perf" },
    );

    expect(workspaceFiltered).toHaveLength(1);
    expect(workspaceFiltered[0]).toMatchObject({
      sessionId: "sess-a",
      taskId: "task-a2",
    });
  });

  it("derives runtime, token totals, cached totals, and tool counts from raw events", () => {
    const task = makeTask({
      id: "task-metrics",
      createdAt: 10_000,
      updatedAt: 18_000,
      completedAt: 22_000,
    });
    const metrics = buildTaskTraceMetrics(task, [
      makeEvent({
        id: "evt-tool-1",
        taskId: task.id,
        timestamp: 11_000,
        type: "tool_call",
        payload: { tool: "read_file" },
      }),
      makeEvent({
        id: "evt-tool-2",
        taskId: task.id,
        timestamp: 12_000,
        type: "tool_call",
        payload: { tool: "run_command" },
      }),
      makeEvent({
        id: "evt-usage",
        taskId: task.id,
        timestamp: 20_000,
        type: "llm_usage",
        payload: {
          totals: {
            inputTokens: 1200,
            outputTokens: 340,
            cachedTokens: 90,
          },
        },
      }),
    ]);

    expect(metrics).toMatchObject({
      runtimeMs: 12_000,
      inputTokens: 1200,
      outputTokens: 340,
      cachedTokens: 90,
      toolCallCount: 2,
      eventCount: 3,
    });
  });
});
