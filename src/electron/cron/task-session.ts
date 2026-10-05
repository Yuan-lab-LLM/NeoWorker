import type { Task, TaskEvent } from "../../shared/types";
import { resolveTaskResultText } from "./result-text";

/** A completed earlier turn must not satisfy a newly queued scheduled run. */
export function scheduledTaskStatus(task: Task, resultSinceMs?: number) {
  const stale = resultSinceMs !== undefined && (
    task.updatedAt < resultSinceMs ||
    (task.status === "completed" && (task.completedAt ?? 0) < resultSinceMs)
  );
  return {
    status: stale ? "queued" : task.status,
    workspaceId: task.workspaceId,
    source: task.source,
    scheduledJobId: task.agentConfig?.scheduledJobId,
    error: stale ? null : task.error ?? null,
    resultSummary: stale ? null : task.resultSummary ?? null,
    terminalStatus: stale ? null : task.terminalStatus ?? null,
    failureClass: stale ? null : task.failureClass ?? null,
    budgetUsage: task.budgetUsage ?? null,
  };
}

export function scheduledTaskResult(task: Task | undefined, events: TaskEvent[], resultSinceMs?: number) {
  const current = resultSinceMs === undefined || (task?.completedAt ?? 0) >= resultSinceMs;
  return resolveTaskResultText({
    summary: current ? task?.resultSummary : undefined,
    semanticSummary: current ? task?.semanticSummary : undefined,
    verificationVerdict: current ? task?.verificationVerdict : undefined,
    verificationReport: current ? task?.verificationReport : undefined,
    events: resultSinceMs === undefined ? events : events.filter((event) => event.timestamp >= resultSinceMs),
  });
}
