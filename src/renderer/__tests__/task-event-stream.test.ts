import { describe, expect, it } from "vitest";
import type { TaskEvent } from "../../shared/types";
import {
  hydrateSelectedTaskEvents,
  getTaskStatusUpdateFromEvent,
  loadTaskTimelineWithLegacyFallback,
  mergeTaskEventsByIdentity,
  shouldIncludeTaskEventInSelectedSession,
  shouldRefreshCanonicalEventsForTerminalUpdate,
} from "../utils/task-event-stream";

function makeTimelinePage(events: TaskEvent[]) {
  return {
    taskId: "task-1",
    events,
    hasMoreHistory: false,
    nextCursor: null,
    summary: {
      eventCount: events.length,
      payloadBytes: 0,
      truncatedEventCount: 0,
      largestEventPayloadBytes: 0,
    },
  };
}

function makeEvent(
  overrides: Partial<TaskEvent> &
    Pick<TaskEvent, "taskId" | "type" | "timestamp">,
): TaskEvent {
  return {
    id:
      overrides.id ??
      `${overrides.taskId}:${overrides.type}:${overrides.timestamp}`,
    taskId: overrides.taskId,
    type: overrides.type,
    timestamp: overrides.timestamp,
    payload: overrides.payload ?? {},
    schemaVersion: overrides.schemaVersion ?? 2,
    ...(overrides.eventId ? { eventId: overrides.eventId } : {}),
    ...(typeof overrides.seq === "number" ? { seq: overrides.seq } : {}),
    ...(overrides.stepId ? { stepId: overrides.stepId } : {}),
    ...(overrides.groupId ? { groupId: overrides.groupId } : {}),
    ...(overrides.status ? { status: overrides.status } : {}),
    ...(overrides.legacyType ? { legacyType: overrides.legacyType } : {}),
  };
}

describe("mergeTaskEventsByIdentity", () => {
  it("preserves live events that arrive before historical loading finishes", () => {
    const live = makeEvent({
      taskId: "task-1",
      type: "timeline_step_finished",
      timestamp: 200,
      eventId: "evt-2",
      seq: 2,
      payload: { step: { id: "2" } },
    });
    const historical = makeEvent({
      taskId: "task-1",
      type: "timeline_step_started",
      timestamp: 100,
      eventId: "evt-1",
      seq: 1,
      payload: { step: { id: "1" } },
    });

    const merged = mergeTaskEventsByIdentity([live], [historical]);

    expect(merged.map((event) => event.eventId)).toEqual(["evt-1", "evt-2"]);
  });

  it("uses the persisted copy when it matches a streamed event by eventId", () => {
    const streamed = makeEvent({
      taskId: "task-1",
      type: "timeline_step_finished",
      timestamp: 200,
      eventId: "evt-2",
      seq: 2,
      payload: { message: "streamed" },
    });
    const persisted = makeEvent({
      id: "db-row-2",
      taskId: "task-1",
      type: "timeline_step_finished",
      timestamp: 200,
      eventId: "evt-2",
      seq: 2,
      payload: { message: "persisted" },
    });

    const merged = mergeTaskEventsByIdentity([streamed], [persisted]);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("db-row-2");
    expect(merged[0].payload).toEqual({ message: "persisted" });
  });
});

describe("hydrateSelectedTaskEvents", () => {
  it("drops stale events from a previously selected task", () => {
    const stale = makeEvent({
      taskId: "task-1",
      type: "assistant_message",
      timestamp: 50,
      eventId: "evt-stale",
      seq: 1,
    });
    const historical = makeEvent({
      taskId: "task-2",
      type: "assistant_message",
      timestamp: 100,
      eventId: "evt-current",
      seq: 1,
    });

    const hydrated = hydrateSelectedTaskEvents("task-2", [stale], [historical]);

    expect(hydrated.map((event) => event.taskId)).toEqual(["task-2"]);
    expect(hydrated.map((event) => event.eventId)).toEqual(["evt-current"]);
  });

  it("preserves same-task live events while historical events are loading", () => {
    const live = makeEvent({
      taskId: "task-2",
      type: "timeline_step_finished",
      timestamp: 200,
      eventId: "evt-live",
      seq: 2,
    });
    const historical = makeEvent({
      taskId: "task-2",
      type: "timeline_step_started",
      timestamp: 100,
      eventId: "evt-history",
      seq: 1,
    });

    const hydrated = hydrateSelectedTaskEvents("task-2", [live], [historical]);

    expect(hydrated.map((event) => event.eventId)).toEqual([
      "evt-history",
      "evt-live",
    ]);
  });
});

describe("loadTaskTimelineWithLegacyFallback", () => {
  it("falls back when the projected timeline handler is unavailable", async () => {
    const event = makeEvent({
      taskId: "task-1",
      type: "timeline_step_started",
      timestamp: 100,
    });

    const result = await loadTaskTimelineWithLegacyFallback({
      request: { taskId: "task-1" },
      getTaskTimelinePage: async () => {
        throw new Error("No handler registered for task:timelinePage");
      },
      getTaskEvents: async () => [event],
    });

    expect(result.source).toBe("legacy");
    expect(result.timelinePage).toBeNull();
    expect(result.events).toEqual([event]);
  });

  it("recovers legacy events when a projected page is unexpectedly empty", async () => {
    const event = makeEvent({
      taskId: "task-1",
      type: "timeline_step_started",
      timestamp: 100,
    });

    const result = await loadTaskTimelineWithLegacyFallback({
      request: { taskId: "task-1" },
      getTaskTimelinePage: async () => makeTimelinePage([]),
      getTaskEvents: async () => [event],
    });

    expect(result.source).toBe("legacy");
    expect(result.events).toEqual([event]);
  });

  it("keeps a non-empty projected timeline without calling the legacy API", async () => {
    const event = makeEvent({
      taskId: "task-1",
      type: "timeline_step_started",
      timestamp: 100,
    });
    let legacyCalls = 0;

    const result = await loadTaskTimelineWithLegacyFallback({
      request: { taskId: "task-1" },
      getTaskTimelinePage: async () => makeTimelinePage([event]),
      getTaskEvents: async () => {
        legacyCalls += 1;
        return [];
      },
    });

    expect(result.source).toBe("page");
    expect(result.events).toEqual([event]);
    expect(legacyCalls).toBe(0);
  });
});

describe("shouldIncludeTaskEventInSelectedSession", () => {
  it("rejects events from a previously selected task", () => {
    const event = makeEvent({
      taskId: "task-1",
      type: "assistant_message",
      timestamp: 100,
    });

    expect(
      shouldIncludeTaskEventInSelectedSession({
        selectedTaskId: "task-2",
        event,
        tasks: [],
      }),
    ).toBe(false);
  });

  it("includes file output events from collaborative child tasks", () => {
    const event = makeEvent({
      taskId: "child-1",
      type: "file_created",
      timestamp: 100,
    });

    expect(
      shouldIncludeTaskEventInSelectedSession({
        selectedTaskId: "parent-1",
        event,
        tasks: [
          {
            id: "parent-1",
            title: "Parent",
            prompt: "Parent",
            workspaceId: "ws-1",
            status: "executing",
            createdAt: 1,
            updatedAt: 1,
            agentConfig: { collaborativeMode: true },
          },
          {
            id: "child-1",
            title: "Child",
            prompt: "Child",
            workspaceId: "ws-1",
            status: "executing",
            createdAt: 2,
            updatedAt: 2,
            parentTaskId: "parent-1",
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects non-output child events even for collaborative parents", () => {
    const event = makeEvent({
      taskId: "child-1",
      type: "assistant_message",
      timestamp: 100,
    });

    expect(
      shouldIncludeTaskEventInSelectedSession({
        selectedTaskId: "parent-1",
        event,
        tasks: [
          {
            id: "parent-1",
            title: "Parent",
            prompt: "Parent",
            workspaceId: "ws-1",
            status: "executing",
            createdAt: 1,
            updatedAt: 1,
            agentConfig: { collaborativeMode: true },
          },
          {
            id: "child-1",
            title: "Child",
            prompt: "Child",
            workspaceId: "ws-1",
            status: "executing",
            createdAt: 2,
            updatedAt: 2,
            parentTaskId: "parent-1",
          },
        ],
      }),
    ).toBe(false);
  });
});

describe("shouldRefreshCanonicalEventsForTerminalUpdate", () => {
  it("refreshes the selected task when it completes", () => {
    const event = makeEvent({
      taskId: "task-1",
      type: "task_completed",
      timestamp: 100,
    });

    expect(
      shouldRefreshCanonicalEventsForTerminalUpdate({
        selectedTaskId: "task-1",
        event,
        nextStatus: "completed",
      }),
    ).toBe(true);
  });

  it("does not refresh for non-terminal updates or other tasks", () => {
    const event = makeEvent({
      taskId: "task-2",
      type: "progress_update",
      timestamp: 100,
    });

    expect(
      shouldRefreshCanonicalEventsForTerminalUpdate({
        selectedTaskId: "task-1",
        event,
        nextStatus: "executing",
      }),
    ).toBe(false);
  });
});

describe("getTaskStatusUpdateFromEvent", () => {
  it("does not fail a task for a retryable timeline error", () => {
    const event = makeEvent({
      taskId: "task-1",
      type: "timeline_error",
      status: "failed",
      timestamp: 100,
      payload: {
        legacyType: "llm_error",
        message: "LLM API error: provider busy",
      },
    });

    expect(getTaskStatusUpdateFromEvent(event)).toBeUndefined();
  });

  it("fails a task when the terminal timeline error arrives", () => {
    const event = makeEvent({
      taskId: "task-1",
      type: "timeline_error",
      status: "failed",
      timestamp: 100,
      payload: {
        legacyType: "error",
        message: "Provider retries exhausted",
        terminal_failure_fingerprint: "provider busy|unknown|",
      },
    });

    expect(getTaskStatusUpdateFromEvent(event)).toBe("failed");
  });
});
