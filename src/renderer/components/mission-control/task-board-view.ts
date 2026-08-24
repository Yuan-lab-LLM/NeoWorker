import type { Task } from "../../../shared/types";
import { isAutomatedTaskLike } from "../../../shared/automated-task-detection";

export type TaskBoardView = "active" | "attention" | "history";

const RUN_CENTER_ACTIVE_STATUSES = new Set<string>([
  "pending",
  "queued",
  "planning",
  "executing",
  "running",
  "paused",
  "blocked",
]);

const MIN_LONG_FAILED_RUN_MS = 60_000;
const MIN_LONG_RUNNING_TASK_MS = 5 * 60_000;

/**
 * Mission Control is an operational surface, not a second copy of the chat
 * history. Keep live work visible while it runs, then retain only work that
 * was automated, explicitly managed, or failed after a meaningful run.
 */
export function shouldShowTaskInRunCenter(
  task: Task,
  now = Date.now(),
): boolean {
  if (
    task.parentTaskId ||
    task.source === "managed_agent_panel" ||
    task.source === "side_chat"
  ) {
    return false;
  }

  if (
    task.terminalStatus === "awaiting_approval" ||
    task.terminalStatus === "needs_user_action" ||
    task.terminalStatus === "resume_available" ||
    task.awaitingUserInputReasonCode
  ) {
    return true;
  }

  const automated = isAutomatedTaskLike(task);
  const explicitlyManaged = Boolean(
    automated ||
    (task.boardColumn && task.boardColumn !== "backlog") ||
    task.dueDate ||
    (task.priority ?? 0) > 0 ||
    task.labels?.length ||
    task.issueId ||
    task.goalId ||
    task.projectId ||
    task.companyId ||
    task.heartbeatRunId ||
    task.targetNodeId,
  );

  if (RUN_CENTER_ACTIVE_STATUSES.has(task.status)) {
    const runningLongEnough = now - task.createdAt >= MIN_LONG_RUNNING_TASK_MS;
    return explicitlyManaged || runningLongEnough;
  }

  if (explicitlyManaged) return true;

  return (
    (task.status === "failed" || task.status === "interrupted") &&
    (task.lastRunDurationMs ?? 0) >= MIN_LONG_FAILED_RUN_MS
  );
}

/**
 * Keep the three primary task destinations mutually exclusive. Actionable
 * failures and interruptions belong in "需要处理" until the user resolves
 * them; only non-actionable terminal work belongs in history.
 */
export function getTaskBoardView(
  task: Task,
  isTaskTerminal: (task: Task) => boolean,
  isTaskAttentionRequired: (task: Task) => boolean,
): TaskBoardView {
  if (isTaskAttentionRequired(task)) {
    return "attention";
  }
  return isTaskTerminal(task) ? "history" : "active";
}
