import { describe, expect, it } from "vitest";
import type { Task, TaskEvent } from "../../../shared/types";
import { getEffectiveTaskEventType } from "../task-event-compat";
import { deriveSharedTaskEventUiState } from "../task-event-derived";
import {
  getTaskStatusUpdateFromEvent,
  reconcileTaskDeliveryEvents,
} from "../task-event-stream";

describe("getTaskStatusUpdateFromEvent", () => {
  it("restores the parent status when a follow-up fails", () => {
    const event = {
      id: "follow-up-failed-1",
      eventId: "follow-up-failed-1",
      taskId: "task-1",
      timestamp: 400,
      ts: 400,
      type: "follow_up_failed",
      legacyType: "follow_up_failed",
      status: "failed",
      schemaVersion: 2,
      payload: { parentTaskStatus: "completed" },
    } as TaskEvent;

    expect(getTaskStatusUpdateFromEvent(event)).toBe("completed");
  });

  it("ignores invalid task statuses from streamed events", () => {
    const event = {
      id: "invalid-status-1",
      eventId: "invalid-status-1",
      taskId: "task-1",
      timestamp: 400,
      ts: 400,
      type: "task_status",
      legacyType: "task_status",
      status: "completed",
      schemaVersion: 2,
      payload: { status: "still-working-forever" },
    } as TaskEvent;

    expect(getTaskStatusUpdateFromEvent(event)).toBeUndefined();
  });
});

const completedTask = {
  id: "task-1",
  title: "Create report",
  prompt: "Create a PDF report",
  status: "completed",
  workspaceId: "workspace-1",
  createdAt: 100,
  updatedAt: 300,
  completedAt: 300,
  resultSummary: "PDF report is ready.",
  bestKnownOutcome: {
    capturedAt: 300,
    resultSummary: "Intermediate result",
    outputSummary: {
      created: ["report.pdf"],
      primaryOutputPath: "report.pdf",
      outputCount: 1,
      folders: ["."],
    },
  },
} as Task;

const userEvent: TaskEvent = {
  id: "user-1",
  eventId: "user-1",
  taskId: completedTask.id,
  timestamp: 100,
  ts: 100,
  type: "user_message",
  legacyType: "user_message",
  status: "completed",
  schemaVersion: 2,
  payload: { message: completedTask.prompt },
};

describe("reconcileTaskDeliveryEvents", () => {
  it("synthesizes a durable completion anchor when projected history omitted it", () => {
    const reconciled = reconcileTaskDeliveryEvents(completedTask, [userEvent]);
    const completion = reconciled.find(
      (event) => getEffectiveTaskEventType(event) === "task_completed",
    );

    expect(completion).toBeDefined();
    expect(completion?.type).toBe("task_completed");
    expect(completion?.payload).toMatchObject({
      resultSummary: "PDF report is ready.",
      deliveryRecoveredFromTask: true,
      outputSummary: {
        created: ["report.pdf"],
        primaryOutputPath: "report.pdf",
        outputCount: 1,
      },
    });

    const projection = deriveSharedTaskEventUiState({
      rawEvents: reconciled,
      task: completedTask,
      verboseSteps: false,
      projectionMode: "inspect",
    });
    expect(
      projection.baseTimelineItems.some(
        (item) =>
          item.kind === "event" &&
          getEffectiveTaskEventType(item.event) === "task_completed",
      ),
    ).toBe(true);
    expect(projection.outputSummary?.primaryOutputPath).toBe("report.pdf");
  });

  it("normalizes a timeline-v2 completion envelope with canonical task delivery data", () => {
    const wrappedCompletion: TaskEvent = {
      id: "completion-1",
      eventId: "completion-1",
      taskId: completedTask.id,
      timestamp: 290,
      ts: 290,
      seq: 42,
      type: "timeline_step_finished",
      legacyType: "task_completed",
      status: "completed",
      schemaVersion: 2,
      payload: { resultSummary: "Stale summary" },
    };

    const reconciled = reconcileTaskDeliveryEvents(completedTask, [
      userEvent,
      wrappedCompletion,
    ]);
    const completion = reconciled[1];

    expect(completion.id).toBe(wrappedCompletion.id);
    expect(completion.seq).toBe(42);
    expect(completion.type).toBe("task_completed");
    expect(completion.payload.resultSummary).toBe("PDF report is ready.");
    expect(completion.payload.outputSummary.primaryOutputPath).toBe(
      "report.pdf",
    );
  });

  it("keeps a durable artifact on its original completion instead of the latest follow-up", () => {
    const firstCompletion: TaskEvent = {
      id: "completion-with-report",
      eventId: "completion-with-report",
      taskId: completedTask.id,
      timestamp: 200,
      ts: 200,
      type: "task_completed",
      legacyType: "task_completed",
      status: "completed",
      schemaVersion: 2,
      payload: {
        outputSummary: {
          created: ["report.pdf"],
          primaryOutputPath: "report.pdf",
          outputCount: 1,
          folders: ["."],
        },
      },
    };
    const followUpUser: TaskEvent = {
      ...userEvent,
      id: "user-follow-up",
      eventId: "user-follow-up",
      timestamp: 350,
      ts: 350,
      payload: { message: "Start a new question" },
    };
    const followUpCompletion: TaskEvent = {
      id: "completion-without-output",
      eventId: "completion-without-output",
      taskId: completedTask.id,
      timestamp: 400,
      ts: 400,
      type: "task_completed",
      legacyType: "task_completed",
      status: "completed",
      schemaVersion: 2,
      payload: {
        resultSummary: "The follow-up is complete.",
        outputSummary: { created: [], outputCount: 0, folders: [] },
      },
    };

    const reconciled = reconcileTaskDeliveryEvents(completedTask, [
      userEvent,
      firstCompletion,
      followUpUser,
      followUpCompletion,
    ]);

    const original = reconciled.find(
      (event) => event.id === firstCompletion.id,
    );
    const followUp = reconciled.find(
      (event) => event.id === followUpCompletion.id,
    );
    expect(original?.payload.outputSummary.primaryOutputPath).toBe(
      "report.pdf",
    );
    expect(followUp?.payload.outputSummary).toEqual({
      created: [],
      outputCount: 0,
      folders: [],
    });
  });

  it("does not alter an active task timeline", () => {
    const activeTask = { ...completedTask, status: "executing" } as Task;
    const events = [userEvent];
    expect(reconcileTaskDeliveryEvents(activeTask, events)).toBe(events);
  });
});
