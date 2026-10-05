import type { Task } from "./types";

export type AgentTaskStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "partial"
  | "needs-action"
  | "approval"
  | "resumable"
  | "running"
  | "pending";

/** UI surfaces must distinguish successful delivery from merely ending a run. */
export function getAgentTaskStatus(
  task?: Pick<Task, "status" | "terminalStatus"> | null,
): AgentTaskStatus {
  if (!task) return "pending";
  if (task.status === "cancelled") return "cancelled";
  if (task.status === "executing" || task.status === "planning") return "running";
  if (task.status === "failed" || task.terminalStatus === "failed") return "failed";
  if (task.terminalStatus === "partial_success") return "partial";
  if (task.terminalStatus === "needs_user_action") return "needs-action";
  if (task.terminalStatus === "awaiting_approval") return "approval";
  if (task.terminalStatus === "resume_available" || task.status === "interrupted")
    return "resumable";
  return task.status === "completed" ? "completed" : "pending";
}
