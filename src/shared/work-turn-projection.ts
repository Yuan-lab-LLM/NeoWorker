import type { Task, TaskEvent } from "./types";
import { isWorkTurnTerminal, type WorkTurn } from "./work-turn";

/** Same durable projection for live events, paginated history, and task reloads. */
export function resolveCurrentWorkTurn(
  task: Pick<Task, "id" | "currentTurn"> | null | undefined,
  events: TaskEvent[] = [],
): WorkTurn | undefined {
  let current = task?.currentTurn;
  for (const event of events) {
    if (task && event.taskId !== task.id) continue;
    const next = event.payload?.workTurn as WorkTurn | undefined;
    if (!next || next.taskId !== event.taskId || next.id !== event.payload?.workTurnId) continue;
    if (!current || next.ordinal > current.ordinal ||
      (next.id === current.id && next.revision > current.revision &&
        (!isWorkTurnTerminal(current.state) || current.state === "interrupted"))) current = next;
  }
  return current;
}
