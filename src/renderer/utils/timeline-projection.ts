import type { TaskEvent } from "../../shared/types";
import { normalizeTaskEventToTimelineV2 } from "../../shared/timeline-v2";

/**
 * Build a canonical timeline v2 stream for renderer surfaces.
 * Accepts mixed legacy/v2 records and normalizes them deterministically.
 */
export function normalizeEventsForTimelineUi(events: TaskEvent[]): TaskEvent[] {
  const seqByTask = new Map<string, number>();

  return events.map((event, index) => {
    const taskId =
      typeof event.taskId === "string" && event.taskId.trim().length > 0
        ? event.taskId
        : "unknown-task";
    const currentSeq = seqByTask.get(taskId) || 0;
    const requestedSeq =
      typeof event.seq === "number" &&
      Number.isFinite(event.seq) &&
      event.seq > 0
        ? Math.floor(event.seq)
        : undefined;
    const seq =
      typeof requestedSeq === "number" && requestedSeq > currentSeq
        ? requestedSeq
        : currentSeq + 1;
    seqByTask.set(taskId, seq);

    const eventId =
      typeof event.eventId === "string" && event.eventId.trim().length > 0
        ? event.eventId
        : typeof event.id === "string" && event.id.trim().length > 0
          ? event.id
          : `${taskId}:event:${index + 1}`;

    const normalized = normalizeTaskEventToTimelineV2({
      taskId,
      type: event.type,
      payload: event.payload,
      timestamp:
        typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
          ? event.timestamp
          : Date.now(),
      eventId,
      seq,
      defaultStepId: event.stepId,
      explicitGroupId: event.groupId,
    });

    return {
      ...normalized,
      id:
        typeof event.id === "string" && event.id.trim().length > 0
          ? event.id
          : normalized.id,
    } as TaskEvent;
  });
}
