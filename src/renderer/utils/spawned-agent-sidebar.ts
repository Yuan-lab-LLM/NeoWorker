import type { Task } from "../../shared/types";

export function resolveSpawnedAgentSidebarTask(
  childTasks: Task[],
  selectedTaskId: string | null,
): Task | null {
  if (childTasks.length === 0) return null;
  // A stale selection must never silently show another expert's conversation.
  return selectedTaskId
    ? (childTasks.find((task) => task.id === selectedTaskId) ?? null)
    : childTasks[0];
}
