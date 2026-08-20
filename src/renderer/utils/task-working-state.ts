import type { EventType, Task, TaskEvent } from "../../shared/types";
import { getEffectiveTaskEventType } from "./task-event-compat";

const ACTIVE_WORK_SIGNAL_WINDOW_MS = 30_000;

const ACTIVE_WORK_EVENT_TYPES: EventType[] = [
  "executing",
  "step_started",
  "step_completed",
  "progress_update",
  "tool_call",
  "tool_result",
  "verification_started",
  "retry_started",
  "llm_streaming",
];

const TERMINAL_WORK_EVENT_TYPES = new Set<
  EventType | "task_paused" | "task_cancelled" | "follow_up_failed"
>([
  "task_paused",
  "approval_requested",
  "task_completed",
  "task_cancelled",
  "follow_up_completed",
  "follow_up_failed",
]);

function isActiveWorkSignal(event: TaskEvent, effectiveType: string): boolean {
  const isActiveProgressSignal =
    effectiveType === "progress_update" &&
    (event.payload?.phase === "tool_execution" ||
      event.payload?.state === "active" ||
      event.payload?.heartbeat === true);
  const isTimelineActiveLifecycle =
    event.type === "timeline_group_started" ||
    event.type === "timeline_step_started" ||
    event.type === "timeline_step_updated";
  return (
    isTimelineActiveLifecycle ||
    ACTIVE_WORK_EVENT_TYPES.includes(effectiveType as EventType) ||
    isActiveProgressSignal
  );
}

export function isTaskActivelyWorking(
  task: Task | null | undefined,
  events: TaskEvent[],
  hasActiveChildren: boolean,
  now = Date.now(),
): boolean {
  if (!task) return false;

  if (task.status === "pending" && task.branchFromTaskId) {
    return false;
  }

  if (task.status === "executing" || task.status === "planning") {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (event.taskId !== task.id) continue;
      const effectiveType = getEffectiveTaskEventType(event);
      if (
        TERMINAL_WORK_EVENT_TYPES.has(
          effectiveType as
            | EventType
            | "task_paused"
            | "task_cancelled"
            | "follow_up_failed",
        )
      ) {
        return false;
      }
      if (isActiveWorkSignal(event, effectiveType)) {
        return true;
      }
    }
    return true;
  }

  if (task.status === "completed" && hasActiveChildren) {
    return true;
  }
  if (task.status === "interrupted") return true;
  if (
    task.status === "completed" ||
    task.status === "paused" ||
    task.status === "blocked" ||
    task.status === "failed" ||
    task.status === "cancelled"
  ) {
    return false;
  }

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.taskId !== task.id) continue;
    const effectiveType = getEffectiveTaskEventType(event);

    if (
      TERMINAL_WORK_EVENT_TYPES.has(
        effectiveType as
          | EventType
          | "task_paused"
          | "task_cancelled"
          | "follow_up_failed",
      )
    ) {
      return false;
    }
    if (isActiveWorkSignal(event, effectiveType)) {
      return now - event.timestamp <= ACTIVE_WORK_SIGNAL_WINDOW_MS;
    }
  }

  return false;
}
