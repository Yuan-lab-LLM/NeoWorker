import { describe, expect, it } from "vitest";
import type { Task, TaskEvent } from "../../../shared/types";
import { normalizeEventsForTimelineUi } from "../timeline-projection";
import {
  deriveTaskWorkTiming,
  markTaskStopRequested,
  isTerminalWorkEvent,
  shouldEndOptimisticFollowUp,
  shouldEndOptimisticFollowUpFromTask,
} from "../task-working-state";

const task = {
  id: "task",
  status: "completed",
  createdAt: 1000,
  completedAt: 2000,
  updatedAt: 2000,
} as Task;
const event = (type: string, timestamp: number, payload = {}) =>
  ({
    id: `${type}:${timestamp}`,
    taskId: task.id,
    type,
    timestamp,
    payload,
  }) as TaskEvent;

describe("current turn timing", () => {
  it("does not resurrect stopped work from an earlier user message", () => {
    const stopped = markTaskStopRequested({ ...task, status: "executing", completedAt: undefined }, 4000);
    expect(deriveTaskWorkTiming(stopped, [event("user_message", 3000)], false).isActive).toBe(false);
  });
  it.each(["log", "assistant_message", "hermes_runtime_transport"])("does not resurrect finished work from a canonical %s envelope", (legacyType) => {
    const stream = [event("user_message", 3000), event("task_completed", 4000),
      event("timeline_step_updated", 5000, { legacyType })];
    expect(deriveTaskWorkTiming({ ...task, status: "executing", completedAt: undefined }, stream, false))
      .toMatchObject({ isActive: false, completedAt: 4000 });
  });
  it.each([false, true])("keeps the follow-up clock through automatic approval (projected=%s)", (projected) => {
    const stream = [
      event("task_completed", 2000),
      event("task_resumed", 3000, { newRunStarted: true }),
      event("executing", 3250),
      event("user_message", 3280),
      event("approval_requested", 3309, { autoApproved: true }),
      event("approval_granted", 3327, { autoApproved: true }),
      event("hermes_runtime_transport", 3335, { phase: "request_started" }),
    ];
    const events = projected ? normalizeEventsForTimelineUi(stream) : stream;
    const runningTask = { ...task, status: "executing" as const, completedAt: undefined, updatedAt: 3327 };
    let optimisticStart: number | null = 2900;
    for (const received of events) {
      if (optimisticStart !== null && shouldEndOptimisticFollowUp(received, optimisticStart)) {
        optimisticStart = null;
      }
    }
    expect(optimisticStart).toBe(2900);
    for (const now of [3335, 4335, 23335, 63335]) {
      expect(deriveTaskWorkTiming(runningTask, events, false, optimisticStart, now))
        .toMatchObject({ startedAt: 2900, isActive: true, completedAt: undefined });
      // History reloads have no local send marker, but must still be active.
      expect(deriveTaskWorkTiming(runningTask, events, false, null, now))
        .toMatchObject({ startedAt: 3280, isActive: true, completedAt: undefined });
    }
  });
  it("does not classify automatic approval as a terminal event", () => {
    expect(isTerminalWorkEvent(event("approval_requested", 3309, { autoApproved: true }))).toBe(false);
    expect(isTerminalWorkEvent(event("approval_requested", 3309))).toBe(true);
  });
  it.each(["approval_granted", "task_resumed", "follow_up_started"])(
    "resumes the clock on %s without waiting for model or tool output",
    (type) => {
      const runningTask = { ...task, status: "executing" as const, completedAt: undefined };
      const events = [event("user_message", 3000), event("approval_requested", 4000)];
      expect(deriveTaskWorkTiming(runningTask, events, false, null, 5000).isActive).toBe(false);
      events.push(event(type, 6000));
      expect(deriveTaskWorkTiming(runningTask, events, false, null, 66000))
        .toMatchObject({ startedAt: 3000, isActive: true, completedAt: undefined });
    },
  );
  it.each(["task_completed", "follow_up_failed", "task_cancelled", "task_paused"])(
    "does not keep running after %s follows automatic approval",
    (type) => {
      const events = [
        event("user_message", 3000),
        event("approval_requested", 3309, { autoApproved: true }),
        event("approval_granted", 3327, { autoApproved: true }),
        event(type, 8000),
      ];
      expect(deriveTaskWorkTiming({ ...task, status: "executing", completedAt: undefined }, events, false, 2900, 60000))
        .toMatchObject({ startedAt: 3000, isActive: false, completedAt: 8000 });
    },
  );
  it("ends a normalized follow-up failure while the task row still says executing", () => {
    const stream = normalizeEventsForTimelineUi([
      event("user_message",3000),
      event("follow_up_failed",8000,{message:"Execution failed"}),
    ]);
    expect(deriveTaskWorkTiming({...task,status:"executing"},stream,false,2900))
      .toMatchObject({startedAt:3000,completedAt:8000,isActive:false});
    expect(shouldEndOptimisticFollowUp(stream[1],2900)).toBe(true);
  });
  it.each([
    {terminal:true},
    {terminalFailure:true},
    {terminalStatus:"failed"},
    {terminal_failure_fingerprint:"runtime-exit"},
  ])("stops on an explicit terminal error %j", payload => {
    expect(deriveTaskWorkTiming({...task,status:"executing"},[
      event("user_message",3000), event("timeline_error",8000,payload),
    ],false)).toMatchObject({completedAt:8000,isActive:false});
  });
  it("does not stop on a recoverable tool error", () => {
    expect(deriveTaskWorkTiming({...task,status:"executing"},normalizeEventsForTimelineUi([
      event("user_message",3000),event("tool_call",4000),event("tool_error",5000,{message:"Retrying"}),
    ]),false)).toMatchObject({startedAt:3000,isActive:true});
  });
  it("starts the second turn despite the first turn's completion timestamp", () => {
    expect(
      deriveTaskWorkTiming(task, [event("user_message", 3000)], false),
    ).toMatchObject({
      startedAt: 3000,
      isActive: true,
      completedAt: undefined,
    });
  });
  it.each(["follow_up_failed", "follow_up_completed", "task_status"])(
    "ends on %s even when the task row and optimistic marker still say running",
    (type) => {
      expect(
        deriveTaskWorkTiming(
          { ...task, status: "executing" },
          [
            event("user_message", 3000),
            event("executing", 3001),
            event(type, 8000, { status: "completed" }),
          ],
          false,
          2900,
        ),
      ).toMatchObject({ startedAt: 3000, isActive: false, completedAt: 8000 });
    },
  );
  it("uses the updated terminal row if failure events are not loaded", () => {
    expect(
      deriveTaskWorkTiming(
        { ...task, updatedAt: 8000 },
        [event("user_message", 3000)],
        false,
        2900,
      ),
    ).toMatchObject({ startedAt: 3000, completedAt: 8000, isActive: false });
  });
  it("starts a third turn after failure without reusing the previous end", () => {
    expect(
      deriveTaskWorkTiming(
        task,
        [
          event("user_message", 3000),
          event("follow_up_failed", 8000),
          event("user_message", 10000),
        ],
        false,
      ),
    ).toMatchObject({
      startedAt: 10000,
      isActive: true,
      completedAt: undefined,
    });
  });
  it("ignores events belonging to other sessions", () => {
    expect(
      deriveTaskWorkTiming(
        task,
        [{ ...event("user_message", 9000), taskId: "other" }],
        false,
      ),
    ).toMatchObject({ startedAt: 1000, completedAt: 2000, isActive: false });
  });
  it("ticks optimistically before the backend acknowledges a follow-up", () => {
    expect(deriveTaskWorkTiming(task, [], false, 3000)).toMatchObject({
      startedAt: 3000,
      isActive: true,
      completedAt: undefined,
    });
  });
  it("keeps ticking when the optimistic start and task update share a timestamp", () => {
    expect(
      deriveTaskWorkTiming({ ...task, updatedAt: 3000 }, [], false, 3000),
    ).toMatchObject({
      startedAt: 3000,
      isActive: true,
      completedAt: undefined,
    });
  });
  it("recognizes the persisted user message when it shares the task update timestamp", () => {
    expect(
      deriveTaskWorkTiming(
        { ...task, updatedAt: 3000 },
        [event("user_message", 3000)],
        false,
      ),
    ).toMatchObject({
      startedAt: 3000,
      isActive: true,
      completedAt: undefined,
    });
  });
  it("starts the third turn when its user message shares the latest task timestamp", () => {
    expect(
      deriveTaskWorkTiming(
        { ...task, updatedAt: 10000 },
        [
          event("user_message", 3000),
          event("follow_up_failed", 8000),
          event("user_message", 10000),
        ],
        false,
      ),
    ).toMatchObject({
      startedAt: 10000,
      isActive: true,
      completedAt: undefined,
    });
  });
  it("ends an optimistic turn only for a non-stale terminal event", () => {
    expect(
      shouldEndOptimisticFollowUp(event("task_completed", 2999), 3000),
    ).toBe(false);
    expect(
      shouldEndOptimisticFollowUp(event("follow_up_completed", 3000), 3000),
    ).toBe(true);
    expect(
      shouldEndOptimisticFollowUp(event("input_request_created", 4000), 3000),
    ).toBe(true);
  });
  it("does not mistake the send-time task update for a completed follow-up", () => {
    expect(
      shouldEndOptimisticFollowUpFromTask({ ...task, updatedAt: 3000 }, 3000),
    ).toBe(false);
    expect(
      shouldEndOptimisticFollowUpFromTask({ ...task, updatedAt: 3001 }, 3000),
    ).toBe(true);
    expect(
      shouldEndOptimisticFollowUpFromTask(
        {
          ...task,
          status: "executing",
          completedAt: undefined,
          updatedAt: 4000,
        },
        3000,
      ),
    ).toBe(false);
  });
});
