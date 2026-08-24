import type { Task } from "../../shared/types";

export function resolveSpawnedAgentSidebarTask(
  childTasks: Task[],
  selectedTaskId: string | null,
): Task | null {
  if (childTasks.length === 0) return null;
  return (
    childTasks.find((task) => task.id === selectedTaskId) ??
    childTasks[0] ??
    null
  );
}
