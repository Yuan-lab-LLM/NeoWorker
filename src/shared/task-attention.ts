import type { Task } from "./types";

export type TaskAttentionState =
  | "idle"
  | "working"
  | "waiting"
  | "needs_approval"
  | "needs_attention"
  | "done"
  | "failed";

export interface TaskAttentionSignals {
  pendingApprovalCount?: number;
  pendingInputCount?: number;
  recoverableActionCount?: number;
  hasActiveRuntime?: boolean;
}

/**
 * Single priority-ordered projection used by every task status surface.
 * Callers may add live signals, while list views can safely derive from the
 * persisted task summary without issuing per-task queries.
 */
export function deriveTaskAttentionState(
  task: Pick<Task, "status" | "terminalStatus">,
  signals: TaskAttentionSignals = {},
): TaskAttentionState {
  if ((signals.pendingApprovalCount || 0) > 0 || task.terminalStatus === "awaiting_approval") {
    return "needs_approval";
  }

  if (
    (signals.pendingInputCount || 0) > 0 ||
    (signals.recoverableActionCount || 0) > 0 ||
    task.terminalStatus === "needs_user_action" ||
    task.terminalStatus === "resume_available" ||
    task.status === "blocked" ||
    task.status === "interrupted"
  ) {
    return "needs_attention";
  }

  if (task.status === "failed" || task.status === "cancelled" || task.terminalStatus === "failed") {
    return "failed";
  }

  if (
    signals.hasActiveRuntime === true ||
    task.status === "planning" ||
    task.status === "executing"
  ) {
    return "working";
  }

  if (task.status === "queued" || task.status === "paused") {
    return "waiting";
  }

  if (task.status === "completed") {
    return "done";
  }

  return "idle";
}

export function getTaskAttentionCount(
  state: TaskAttentionState,
  signals: TaskAttentionSignals = {},
): number {
  if (state === "needs_approval") return Math.max(1, signals.pendingApprovalCount || 0);
  if (state === "needs_attention") {
    return Math.max(1, (signals.pendingInputCount || 0) + (signals.recoverableActionCount || 0));
  }
  return 0;
}
