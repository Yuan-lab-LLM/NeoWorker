import type { Task } from "../../shared/types";
import type { CronJob, CronRunHistoryEntry } from "../../electron/cron/types";
import type { AutomationDeliveryReceipt } from "./automation-delivery";

export interface AutomationRun {
  id: string;
  task: Task;
  taskId?: string;
  receipt?: AutomationDeliveryReceipt & { deliveryError?: string };
  resultText?: string;
}

export function isUserAutomationRun(task: Task): boolean {
  return task.source === "cron" && !task.heartbeatRunId && !/^heartbeat:/i.test(task.title.trim()) &&
    Boolean(task.agentConfig?.scheduledJobId || /^scheduled:/i.test(task.title.trim()));
}

/** Run identity is job + execution time, never the reusable conversation ID. */
export function buildAutomationRuns(tasks: Task[], jobs: CronJob[]): AutomationRun[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const covered = new Set<string>();
  const rows: AutomationRun[] = [];
  for (const job of jobs) {
    if (/^heartbeat:/i.test((job.taskTitle || job.name).trim())) continue;
    const history = job.state.runHistory ?? [];
    const entries: Array<CronRunHistoryEntry & { active?: boolean }> = [...history];
    if (job.state.runningAtMs !== undefined && !history.some((run) => run.runAtMs === job.state.lastRunAtMs)) {
      entries.unshift({ runAtMs: job.state.lastRunAtMs ?? job.state.runningAtMs, durationMs: 0,
        status: "ok", taskId: job.state.lastTaskId, active: true });
    }
    for (const entry of entries) {
      if (entry.taskId) covered.add(entry.taskId);
      const original = entry.taskId ? byId.get(entry.taskId) : undefined;
      if (original?.heartbeatRunId || (original && /^heartbeat:/i.test(original.title.trim()))) continue;
      const status: Task["status"] = entry.active ? "executing" : entry.taskStillRunning
        ? original?.status === "executing" ? "executing" : "blocked"
        : entry.status === "error" || entry.status === "timeout" ? "failed"
        : entry.status === "needs_user_action" ? "blocked" : "completed";
      rows.push({
        id: `${job.id}:${entry.runAtMs}`, taskId: entry.taskId,
        task: {
          ...original, id: entry.taskId || job.id, title: job.name, prompt: job.taskPrompt,
          workspaceId: entry.workspaceId || job.workspaceId, source: "cron", status,
          createdAt: entry.runAtMs, updatedAt: entry.runAtMs, error: entry.error,
          terminalStatus: entry.taskStillRunning ? original?.terminalStatus : undefined,
        },
        receipt: job.delivery?.enabled ? { ...entry, channelType: job.delivery.channelType } : undefined,
        resultText: entry.resultText,
      });
    }
  }
  // Older tasks outside the stored history window remain available as legacy receipts.
  for (const task of tasks) {
    if (isUserAutomationRun(task) && !covered.has(task.id)) rows.push({ id: task.id, task, taskId: task.id });
  }
  return rows.sort((a, b) => b.task.updatedAt - a.task.updatedAt);
}
