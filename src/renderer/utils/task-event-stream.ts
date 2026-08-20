import type {
  Task,
  TaskEvent,
  TaskTimelinePageRequest,
  TaskTimelinePageResult,
} from "../../shared/types";
import { TASK_EVENT_STATUS_MAP } from "../../shared/task-event-status-map";
import { getEffectiveTaskEventType } from "./task-event-compat";
import { sanitizeTaskOutputSummary } from "./task-outputs";

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

const TASK_STATUSES = new Set<Task["status"]>([
  "pending",
  "queued",
  "planning",
  "executing",
  "paused",
  "blocked",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);

function asTaskStatus(value: unknown): Task["status"] | undefined {
  return typeof value === "string" &&
    TASK_STATUSES.has(value as Task["status"])
    ? (value as Task["status"])
    : undefined;
}

/**
 * Resolve the lifecycle status represented by a streamed task event.
 *
 * Timeline-v2 errors are intentionally not all terminal: an LLM request may
 * fail and then be retried. The executor's final failure record carries an
 * explicit terminal fingerprint (or terminalStatus), so only that record may
 * transition the task to failed. This keeps transient 503s visible without
 * leaving the selected task stuck on a spinner after retries are exhausted.
 */
export function getTaskStatusUpdateFromEvent(
  event: TaskEvent,
): Task["status"] | undefined {
  if (event.type === "task_status") {
    return asTaskStatus(event.payload?.status);
  }

  const effectiveType = getEffectiveTaskEventType(event);
  if (effectiveType === "follow_up_failed") {
    return asTaskStatus(asObject(event.payload).parentTaskStatus);
  }
  const mappedStatus = TASK_EVENT_STATUS_MAP[effectiveType];
  if (mappedStatus) return mappedStatus;

  if (event.type !== "timeline_error" || event.status !== "failed") {
    return undefined;
  }

  const payload = asObject(event.payload);
  const terminalStatus =
    typeof payload.terminalStatus === "string" ? payload.terminalStatus : "";
  const hasTerminalFailureFingerprint =
    typeof payload.terminal_failure_fingerprint === "string" &&
    payload.terminal_failure_fingerprint.trim().length > 0;
  const isExplicitTerminalFailure =
    payload.terminal === true ||
    payload.terminalFailure === true ||
    terminalStatus === "failed" ||
    hasTerminalFailureFingerprint;

  return isExplicitTerminalFailure ? "failed" : undefined;
}

export interface LoadedTaskTimeline {
  events: TaskEvent[];
  timelinePage: TaskTimelinePageResult | null;
  source: "page" | "legacy";
}

function getCanonicalTaskResultSummary(task: Task): string {
  const resultSummary =
    typeof task.resultSummary === "string" ? task.resultSummary.trim() : "";
  if (resultSummary) return resultSummary;
  return typeof task.bestKnownOutcome?.resultSummary === "string"
    ? task.bestKnownOutcome.resultSummary.trim()
    : "";
}

function getOutputSummaryIdentityKeys(value: unknown): Set<string> {
  const summary = sanitizeTaskOutputSummary(value);
  if (!summary) return new Set();
  const paths = [
    summary.primaryOutputPath,
    ...summary.created,
    ...(summary.modifiedFallback || []),
  ];
  const keys = new Set<string>();
  for (const rawPath of paths) {
    if (typeof rawPath !== "string" || !rawPath.trim()) continue;
    const normalized = rawPath.trim().replace(/\\/g, "/").toLowerCase();
    keys.add(`path:${normalized}`);
    const fileName = normalized.split("/").filter(Boolean).pop();
    if (fileName) keys.add(`file:${fileName}`);
  }
  return keys;
}

function outputSummariesShareArtifact(left: unknown, right: unknown): boolean {
  const leftKeys = getOutputSummaryIdentityKeys(left);
  if (leftKeys.size === 0) return false;
  for (const key of getOutputSummaryIdentityKeys(right)) {
    if (leftKeys.has(key)) return true;
  }
  return false;
}

function hasAuthoritativeOutputSummary(event: TaskEvent): boolean {
  const value = asObject(event.payload).outputSummary;
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Restore the user-facing delivery anchor from the canonical task row.
 *
 * Timeline history is deliberately paged and large payloads are truncated. A
 * completed task must not lose its final answer or output card merely because
 * its persisted task_completed envelope fell outside that projection (or was
 * written by an older timeline-v2 build). The task row is the durable terminal
 * record, so normalize the completion event that actually delivered the
 * canonical output, or synthesize one when history has no compatible anchor.
 * A task can contain multiple follow-up turns; attaching task-scoped output to
 * the latest completion would incorrectly move an older artifact below the
 * newest user message.
 */
export function reconcileTaskDeliveryEvents(
  task: Task | null | undefined,
  events: TaskEvent[],
): TaskEvent[] {
  if (!task || task.status !== "completed") return events;

  const resultSummary = getCanonicalTaskResultSummary(task);
  const outputSummary = task.bestKnownOutcome?.outputSummary;
  if (!resultSummary && !outputSummary?.outputCount) return events;

  const completionIndices: number[] = [];
  for (let index = 0; index < events.length; index += 1) {
    if (
      events[index].taskId === task.id &&
      getEffectiveTaskEventType(events[index]) === "task_completed"
    ) {
      completionIndices.push(index);
    }
  }

  let completionIndex = -1;
  if (outputSummary?.outputCount) {
    for (let offset = completionIndices.length - 1; offset >= 0; offset -= 1) {
      const index = completionIndices[offset];
      if (
        outputSummariesShareArtifact(
          outputSummary,
          asObject(events[index].payload).outputSummary,
        )
      ) {
        completionIndex = index;
        break;
      }
    }

    // Older builds may omit outputSummary from the completion envelope. Only
    // adopt such an unclaimed anchor near the durable capture timestamp. Never
    // overwrite a newer completion that explicitly says it produced no file.
    if (completionIndex < 0) {
      const capturedAt = task.bestKnownOutcome?.capturedAt;
      const unclaimed = completionIndices.filter(
        (index) => !hasAuthoritativeOutputSummary(events[index]),
      );
      const eligible =
        typeof capturedAt === "number"
          ? unclaimed.filter((index) => events[index].timestamp <= capturedAt)
          : unclaimed;
      completionIndex = eligible[eligible.length - 1] ?? -1;
    }
  } else {
    completionIndex = completionIndices[completionIndices.length - 1] ?? -1;
  }

  const existing = completionIndex >= 0 ? events[completionIndex] : undefined;
  const timestamp =
    existing?.timestamp ??
    task.bestKnownOutcome?.capturedAt ??
    task.completedAt ??
    task.updatedAt ??
    Date.now();
  const eventId =
    existing?.id ||
    `task-delivery-recovery:${task.id}:${timestamp}`;
  const payload = {
    ...(existing?.payload && typeof existing.payload === "object"
      ? existing.payload
      : {}),
    ...(resultSummary ? { resultSummary } : {}),
    ...(task.semanticSummary ? { semanticSummary: task.semanticSummary } : {}),
    ...(outputSummary ? { outputSummary } : {}),
    ...(task.bestKnownOutcome
      ? { bestKnownOutcome: task.bestKnownOutcome }
      : {}),
    ...(task.terminalStatus ? { terminalStatus: task.terminalStatus } : {}),
    ...(task.verificationVerdict
      ? { verificationVerdict: task.verificationVerdict }
      : {}),
    ...(task.verificationReport
      ? { verificationReport: task.verificationReport }
      : {}),
    deliveryRecoveredFromTask: true,
  };
  const canonicalCompletion: TaskEvent = {
    ...(existing || {}),
    id: eventId,
    eventId: existing?.eventId || eventId,
    taskId: task.id,
    timestamp,
    ts: existing?.ts ?? timestamp,
    type: "task_completed",
    legacyType: "task_completed",
    status: "completed",
    schemaVersion: 2,
    payload,
  };

  if (completionIndex >= 0) {
    const next = [...events];
    next[completionIndex] = canonicalCompletion;
    return next;
  }

  return mergeTaskEventsByIdentity(events, [canonicalCompletion]);
}

/**
 * Load the selected task's initial timeline while tolerating renderer/main
 * process version skew. During development or a staged desktop update the
 * preload may expose the page API before the main process has registered its
 * handler. An empty projected page can also come from an older repository
 * implementation even though the legacy endpoint still has the full history.
 */
export async function loadTaskTimelineWithLegacyFallback(params: {
  request: TaskTimelinePageRequest;
  getTaskTimelinePage?: (
    request: TaskTimelinePageRequest,
  ) => Promise<TaskTimelinePageResult>;
  getTaskEvents?: (taskId: string) => Promise<TaskEvent[]>;
}): Promise<LoadedTaskTimeline> {
  const { request, getTaskTimelinePage, getTaskEvents } = params;
  let timelinePage: TaskTimelinePageResult | null = null;
  let timelinePageError: unknown;

  if (getTaskTimelinePage) {
    try {
      timelinePage = await getTaskTimelinePage(request);
      if (timelinePage.events.length > 0 || !getTaskEvents) {
        return { events: timelinePage.events, timelinePage, source: "page" };
      }
    } catch (error) {
      timelinePageError = error;
    }
  }

  if (getTaskEvents) {
    try {
      const legacyEvents = await getTaskEvents(request.taskId);
      if (legacyEvents.length > 0 || !timelinePage) {
        return { events: legacyEvents, timelinePage: null, source: "legacy" };
      }
    } catch (legacyError) {
      if (!timelinePage) {
        throw timelinePageError ?? legacyError;
      }
    }
  }

  if (timelinePage) {
    return { events: timelinePage.events, timelinePage, source: "page" };
  }

  throw (
    timelinePageError ?? new Error("No task timeline history API is available.")
  );
}

function getNumericOrderValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getTaskEventIdentity(event: Partial<TaskEvent>): string {
  if (typeof event.eventId === "string" && event.eventId.trim().length > 0) {
    return `event:${event.eventId.trim()}`;
  }
  if (typeof event.id === "string" && event.id.trim().length > 0) {
    return `id:${event.id.trim()}`;
  }

  const taskId =
    typeof event.taskId === "string" ? event.taskId : "unknown-task";
  const type = typeof event.type === "string" ? event.type : "unknown-type";
  const seq = getNumericOrderValue(event.seq) ?? -1;
  const timestamp = getNumericOrderValue(event.timestamp) ?? -1;
  const stepId = typeof event.stepId === "string" ? event.stepId : "";
  const groupId = typeof event.groupId === "string" ? event.groupId : "";
  return `fallback:${taskId}:${type}:${seq}:${timestamp}:${stepId}:${groupId}`;
}

export function compareTaskEventOrder(
  left: Partial<TaskEvent>,
  right: Partial<TaskEvent>,
): number {
  const leftSeq = getNumericOrderValue(left.seq);
  const rightSeq = getNumericOrderValue(right.seq);
  if (leftSeq !== null && rightSeq !== null && leftSeq !== rightSeq) {
    return leftSeq - rightSeq;
  }

  const leftTimestamp = getNumericOrderValue(left.timestamp) ?? 0;
  const rightTimestamp = getNumericOrderValue(right.timestamp) ?? 0;
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  return getTaskEventIdentity(left).localeCompare(getTaskEventIdentity(right));
}

export function mergeTaskEventsByIdentity(
  existing: TaskEvent[],
  incoming: TaskEvent[],
): TaskEvent[] {
  if (incoming.length === 0) return existing;
  if (existing.length === 0) return [...incoming].sort(compareTaskEventOrder);

  // Fast path: single-event insert (common for streaming updates)
  if (incoming.length === 1) {
    const incomingEvent = incoming[0];
    const incomingIdentity = getTaskEventIdentity(incomingEvent);
    const existingIndex = existing.findIndex(
      (event) => getTaskEventIdentity(event) === incomingIdentity,
    );

    if (existingIndex >= 0) {
      const next = [...existing];
      next[existingIndex] = incomingEvent;
      // Skip sort if replacement maintains order relative to neighbors
      const prevOk =
        existingIndex === 0 ||
        compareTaskEventOrder(next[existingIndex - 1], incomingEvent) <= 0;
      const nextOk =
        existingIndex === next.length - 1 ||
        compareTaskEventOrder(incomingEvent, next[existingIndex + 1]) <= 0;
      if (prevOk && nextOk) return next;
      return next.sort(compareTaskEventOrder);
    }

    const lastEvent = existing[existing.length - 1];
    if (!lastEvent || compareTaskEventOrder(lastEvent, incomingEvent) <= 0) {
      return [...existing, incomingEvent];
    }
  }

  const merged = new Map<string, TaskEvent>();
  for (const event of existing) {
    merged.set(getTaskEventIdentity(event), event);
  }
  for (const event of incoming) {
    merged.set(getTaskEventIdentity(event), event);
  }

  return Array.from(merged.values()).sort(compareTaskEventOrder);
}

export function hydrateSelectedTaskEvents(
  selectedTaskId: string,
  existing: TaskEvent[],
  historical: TaskEvent[],
): TaskEvent[] {
  const currentTaskEvents = existing.filter(
    (event) => event.taskId === selectedTaskId,
  );
  return mergeTaskEventsByIdentity(currentTaskEvents, historical);
}

const CHILD_OUTPUT_EVENT_TYPES = new Set([
  "file_created",
  "file_modified",
  "file_deleted",
  "artifact_created",
]);

export function shouldIncludeTaskEventInSelectedSession(params: {
  selectedTaskId: string | null;
  event: TaskEvent;
  tasks: Task[];
}): boolean {
  const { selectedTaskId, event, tasks } = params;
  if (!selectedTaskId) return false;
  if (event.taskId === selectedTaskId) return true;
  if (!CHILD_OUTPUT_EVENT_TYPES.has(event.type)) return false;

  const childTask = tasks.find((task) => task.id === event.taskId);
  if (!childTask?.parentTaskId || childTask.parentTaskId !== selectedTaskId)
    return false;

  const parentTask = tasks.find((task) => task.id === selectedTaskId);
  return Boolean(
    parentTask?.agentConfig?.collaborativeMode ||
    parentTask?.agentConfig?.multiLlmMode,
  );
}

export function shouldRefreshCanonicalEventsForTerminalUpdate(params: {
  selectedTaskId: string | null;
  event: TaskEvent;
  nextStatus?: Task["status"];
}): boolean {
  if (!params.selectedTaskId || params.event.taskId !== params.selectedTaskId) {
    return false;
  }

  return (
    params.nextStatus === "completed" ||
    params.nextStatus === "failed" ||
    params.nextStatus === "cancelled"
  );
}
