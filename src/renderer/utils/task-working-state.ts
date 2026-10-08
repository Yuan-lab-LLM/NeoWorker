import { resolveCurrentWorkTurn } from "../../shared/work-turn-projection";
import type { Task, TaskEvent } from "../../shared/types";
import { deriveCanonicalTaskStatus } from "../../shared/task-status";
import { getEffectiveTaskEventType } from "./task-event-compat";

const ACTIVE_WORK_SIGNAL_WINDOW_MS = 30_000;

export function markTaskStopRequested(task: Task, now = Date.now()): Task {
  const terminal = task.currentTurn
    ? !["running", "queued", "waiting"].includes(task.currentTurn.state)
    : ["completed", "failed", "cancelled"].includes(task.status);
  return {
    ...task,
    ...(task.currentTurn && !terminal ? { currentTurn: { ...task.currentTurn, state: "cancelled" as const, finishedAt: now } } : {}),
    status: terminal ? task.status : "cancelled",
    updatedAt: now,
    completedAt: terminal ? task.completedAt : now,
  };
}

const ACTIVE_WORK_EVENT_TYPES: string[] = [
  "executing",
  "task_resumed",
  "follow_up_started",
  "approval_granted",
  "step_started",
  "step_completed",
  "progress_update",
  "tool_call",
  "tool_result",
  "verification_started",
  "retry_started",
  "llm_streaming",
];

const TERMINAL_WORK_EVENT_TYPES = new Set<string>([
  "task_paused",
  "approval_requested",
  "task_completed",
  "task_cancelled",
  "task_failed",
  "follow_up_completed",
  "follow_up_failed",
]);

export function isTerminalWorkEvent(event: TaskEvent): boolean {
  const type = getEffectiveTaskEventType(event);
  const payload = event.payload || {};
  // Automatic approval never pauses execution. Treating its request as a
  // terminal marker hides the timer throughout runtime initialization.
  if (type === "approval_requested" && payload.autoApproved === true) {
    return false;
  }
  const legacyType = event.legacyType || payload.legacyType;
  // Error rows deliberately keep their presentation type. Recover only an
  // explicit terminal signal here; ordinary tool errors must not stop time.
  const terminalError = type === "timeline_error" && (
    legacyType === "follow_up_failed" ||
    legacyType === "task_failed" ||
    payload.terminal === true ||
    payload.terminalFailure === true ||
    payload.terminalStatus === "failed" ||
    (typeof payload.terminal_failure_fingerprint === "string" &&
      payload.terminal_failure_fingerprint.trim().length > 0)
  );
  return (
    terminalError ||
    TERMINAL_WORK_EVENT_TYPES.has(type) ||
    (type === "task_status" &&
      ["completed", "failed", "cancelled", "paused", "blocked"].includes(
        String(event.payload?.status),
      ))
  );
}

export function shouldEndOptimisticFollowUp(
  event: TaskEvent,
  startedAt: number,
): boolean {
  if (!Number.isFinite(event.timestamp) || event.timestamp < startedAt) {
    return false;
  }
  const type = getEffectiveTaskEventType(event);
  return (
    isTerminalWorkEvent(event) ||
    type === "input_request_created" ||
    type === "task_interrupted" ||
    (type === "task_status" && event.payload?.status === "interrupted")
  );
}

export function shouldEndOptimisticFollowUpFromTask(
  task: Task,
  startedAt: number,
): boolean {
  const status = deriveCanonicalTaskStatus(task);
  if (
    !["completed", "failed", "cancelled", "paused", "blocked"].includes(status)
  ) {
    return false;
  }

  // Sending a follow-up updates task.updatedAt to startedAt before the daemon
  // changes the persisted status. Only a later terminal-row update can be a
  // fallback end signal when the explicit terminal event was missed.
  return Math.max(task.completedAt ?? 0, task.updatedAt ?? 0) > startedAt;
}

/** Timing belongs to the current turn, not the parent task's first result. */
export function deriveTaskWorkTiming(
  task: Task | null | undefined,
  events: TaskEvent[],
  hasActiveChildren: boolean,
  optimisticStartedAt: number | null = null,
  now = Date.now(),
): { startedAt: number; completedAt?: number; isActive: boolean } {
  if (!task) return { startedAt: now, isActive: false };
  const turn = resolveCurrentWorkTurn(task, events);
  if (turn) {
    const optimistic = optimisticStartedAt !== null && optimisticStartedAt > turn.startedAt &&
      optimisticStartedAt >= (turn.finishedAt ?? Number.POSITIVE_INFINITY);
    return { startedAt: optimistic ? optimisticStartedAt! : turn.startedAt,
      completedAt: optimistic || turn.state === "running" ? undefined : turn.finishedAt,
      isActive: optimistic || turn.state === "running" };
  }

  let latestUserAt: number | undefined;
  let latestTerminalAt: number | undefined;
  for (const event of events) {
    if (event.taskId !== task.id || !Number.isFinite(event.timestamp)) continue;
    if (getEffectiveTaskEventType(event) === "user_message") {
      latestUserAt = Math.max(latestUserAt ?? 0, event.timestamp);
    }
    if (isTerminalWorkEvent(event)) {
      latestTerminalAt = Math.max(latestTerminalAt ?? 0, event.timestamp);
    }
  }
  const status = deriveCanonicalTaskStatus(task);
  const terminalRowAt = [
    "completed",
    "failed",
    "cancelled",
    "paused",
    "blocked",
  ].includes(status)
    ? Math.max(task.completedAt ?? 0, task.updatedAt ?? 0)
    : 0;
  // handleSendMessage intentionally updates task.updatedAt at the same instant
  // that it creates the optimistic marker. Equality therefore identifies the
  // new turn; only a later terminal row (or an explicit terminal event) may
  // close it.
  const optimisticActive =
    optimisticStartedAt !== null &&
    optimisticStartedAt >= Math.max(latestTerminalAt ?? 0, terminalRowAt);
  const startedAt =
    (optimisticActive ? optimisticStartedAt : latestUserAt) ?? task.createdAt;
  const isActive =
    optimisticActive ||
    isTaskActivelyWorking(task, events, hasActiveChildren, now);
  // Prefer this turn's explicit end event. Failed follow-ups intentionally
  // preserve the parent's completedAt, which can be earlier than startedAt.
  const endAt =
    latestTerminalAt !== undefined && latestTerminalAt >= startedAt
      ? latestTerminalAt
      : task.completedAt !== undefined && task.completedAt >= startedAt
        ? task.completedAt
        : terminalRowAt >= startedAt
          ? terminalRowAt
          : undefined;
  return {
    startedAt,
    completedAt: isActive ? undefined : endAt,
    isActive,
  };
}

function isActiveWorkSignal(event: TaskEvent, effectiveType: string): boolean {
  const isActiveProgressSignal =
    effectiveType === "progress_update" &&
    (event.payload?.phase === "tool_execution" ||
      event.payload?.state === "active" ||
      event.payload?.heartbeat === true);
  // A canonical envelope can also carry logs or a final answer. Only its
  // semantic event may reactivate work after a terminal marker.
  const isTimelineActiveLifecycle =
    effectiveType === "timeline_group_started" ||
    effectiveType === "timeline_step_started" ||
    effectiveType === "timeline_step_updated";
  return (
    isTimelineActiveLifecycle ||
    ACTIVE_WORK_EVENT_TYPES.includes(effectiveType) ||
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
  const turn = resolveCurrentWorkTurn(task, events);
  if (turn) return turn.state === "running";


  // The persisted status can briefly lag the terminal marker while the
  // renderer receives the final event. Always make lifecycle decisions from
  // the canonical status so an old `executing` value cannot keep the Stop
  // button alive after a completed/failed follow-up.
  const canonicalStatus = deriveCanonicalTaskStatus(task);

  if (canonicalStatus === "pending" && task.branchFromTaskId) {
    return false;
  }

  // A follow-up is recorded as a user_message before the daemon publishes the
  // new executing status. During that short window the task object can still
  // say "completed" (and retain the previous completedAt), which used to make
  // the header timer stop at 0s until a refresh. Treat a user message newer
  // than the previous terminal marker as the start of a new active turn.
  let latestUserMessageTimestamp: number | null = null;
  let latestTerminalTimestamp: number | null = null;
  for (const event of events) {
    if (event.taskId !== task.id) continue;
    const effectiveType = getEffectiveTaskEventType(event);
    if (effectiveType === "user_message") {
      latestUserMessageTimestamp = Math.max(
        latestUserMessageTimestamp ?? event.timestamp,
        event.timestamp,
      );
    }
    if (isTerminalWorkEvent(event)) {
      latestTerminalTimestamp = Math.max(
        latestTerminalTimestamp ?? event.timestamp,
        event.timestamp,
      );
    }
  }
  // Follow-up failures intentionally preserve the prior run's completedAt so
  // the original result remains anchored in history. For activity detection,
  // a terminal task's updatedAt is the newer terminal marker and must also
  // close the follow-up turn when the terminal event itself was not loaded.
  const terminalTaskMarker =
    canonicalStatus === "completed" ||
    canonicalStatus === "failed" ||
    canonicalStatus === "cancelled"
      ? Math.max(
          task.completedAt ?? Number.NEGATIVE_INFINITY,
          task.updatedAt ?? Number.NEGATIVE_INFINITY,
        )
      : (task.completedAt ?? Number.NEGATIVE_INFINITY);
  // The renderer can stamp the optimistic task-row update and the persisted
  // user_message in the same millisecond. Treat equality with the task row as
  // a new turn, while still requiring the message to follow any explicit
  // terminal event from the timeline.
  const hasNewerFollowUp =
    latestUserMessageTimestamp !== null &&
    latestUserMessageTimestamp >= terminalTaskMarker &&
    latestUserMessageTimestamp >
      (latestTerminalTimestamp ?? Number.NEGATIVE_INFINITY);
  if (hasNewerFollowUp) return true;

  if (canonicalStatus === "executing" || canonicalStatus === "planning") {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const event = events[i];
      if (event.taskId !== task.id) continue;
      const effectiveType = getEffectiveTaskEventType(event);
      if (isTerminalWorkEvent(event)) {
        return false;
      }
      if (isActiveWorkSignal(event, effectiveType)) {
        return true;
      }
    }
    return true;
  }

  if (canonicalStatus === "completed" && hasActiveChildren) {
    return true;
  }
  if (canonicalStatus === "interrupted") return true;
  if (
    canonicalStatus === "completed" ||
    canonicalStatus === "paused" ||
    canonicalStatus === "blocked" ||
    canonicalStatus === "failed" ||
    canonicalStatus === "cancelled"
  ) {
    return false;
  }

  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.taskId !== task.id) continue;
    const effectiveType = getEffectiveTaskEventType(event);

    if (isTerminalWorkEvent(event)) {
      return false;
    }
    if (isActiveWorkSignal(event, effectiveType)) {
      return now - event.timestamp <= ACTIVE_WORK_SIGNAL_WINDOW_MS;
    }
  }

  return false;
}
