import type Database from "better-sqlite3";
import type { AgentDaemon } from "../agent/daemon";
import { ControlPlaneCoreService } from "./ControlPlaneCoreService";

export function attachControlPlaneTaskLifecycleSync(options: {
  agentDaemon: AgentDaemon;
  db: Database.Database;
  log?: (...args: unknown[]) => void;
}): () => void {
  const core = new ControlPlaneCoreService(options.db);
  const sync = (event: { taskId?: string }) => {
    if (!event?.taskId) return;
    try {
      core.syncTaskLifecycle(event.taskId);
    } catch (error) {
      options.log?.("[ControlPlaneTaskSync] Failed to sync task lifecycle", event.taskId, error);
    }
  };

  const syncStatus = (event: { taskId?: string; payload?: { status?: string } }) => {
    const status = event?.payload?.status;
    if (
      status === "completed" ||
      status === "failed" ||
      status === "cancelled" ||
      status === "interrupted"
    ) {
      sync(event);
    }
  };

  options.agentDaemon.on("task_completed", sync);
  options.agentDaemon.on("task_cancelled", sync);
  options.agentDaemon.on("task_status", syncStatus);

  return () => {
    options.agentDaemon.off("task_completed", sync);
    options.agentDaemon.off("task_cancelled", sync);
    options.agentDaemon.off("task_status", syncStatus);
  };
}
