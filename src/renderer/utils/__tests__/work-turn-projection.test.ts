import { describe, expect, it } from "vitest";
import type { WorkTurn } from "../../../shared/work-turn";
import type { Task, TaskEvent } from "../../../shared/types";
import { resolveCurrentWorkTurn } from "../../../shared/work-turn-projection";
import { deriveTaskWorkTiming, isTaskActivelyWorking, markTaskStopRequested } from "../task-working-state";
import { resolvePreferredTaskOutputSummary, resolveTaskOutputSummaryFromCompletionEvent } from "../task-outputs";

const turn: WorkTurn = { id: "second", taskId: "task", ordinal: 2, revision: 0, state: "running", startedAt: 3000 };
const task = { id: "task", status: "completed", createdAt: 1, completedAt: 2000, updatedAt: 2000, currentTurn: turn } as Task;
const event = (workTurn: WorkTurn) => ({ id: workTurn.id, taskId: workTurn.taskId, timestamp: 9999,
  type: "task_status", payload: { workTurnId: workTurn.id, workTurn }, schemaVersion: 2 }) as TaskEvent;
const oldOutput = { created: ["MotusAI.pptx"], outputCount: 1, primaryOutputPath: "MotusAI.pptx", folders: [] };

describe("request-scoped UI projection", () => {
  it("shows the new request while the task row still contains the previous completion", () => {
    expect(deriveTaskWorkTiming(task, [], false)).toMatchObject({ startedAt: 3000, isActive: true, completedAt: undefined });
  });
  it("cannot be stopped by a late completion of the first request", () => {
    const old = event({ ...turn, id: "first", ordinal: 1, revision: 99, state: "completed", startedAt: 1, finishedAt: 9999 });
    expect(isTaskActivelyWorking(task, [old], false)).toBe(true);
  });
  it("does not revive finished work because an old child or tool still looks active", () => {
    const done = { ...turn, revision: 1, state: "completed" as const, finishedAt: 4000 };
    expect(deriveTaskWorkTiming({ ...task, status: "executing", currentTurn: done }, [event(turn)], true))
      .toMatchObject({ isActive: false, startedAt: 3000, completedAt: 4000 });
  });
  it("preserves a newer wait projection when a historical running event is loaded", () => {
    const waiting = { ...turn, revision: 2, state: "waiting" as const };
    expect(resolveCurrentWorkTurn({ ...task, currentTurn: waiting }, [event(turn)])?.state).toBe("waiting");
    expect(resolveCurrentWorkTurn({ ...task, currentTurn: waiting }, [event({ ...turn, revision: 3 })])?.state).toBe("running");
  });
  it("allows an explicit restart of an interrupted request but never revives cancellation", () => {
    const resumed = event({ ...turn, revision: 2 });
    expect(resolveCurrentWorkTurn({ ...task, currentTurn: { ...turn, revision: 1, state: "interrupted" } }, [resumed])?.state).toBe("running");
    expect(resolveCurrentWorkTurn({ ...task, currentTurn: { ...turn, revision: 1, state: "cancelled" } }, [resumed])?.state).toBe("cancelled");
  });
  it("stops the current request immediately even when the previous task result is preserved", () => {
    expect(isTaskActivelyWorking(markTaskStopRequested(task, 4000), [event(turn)], true)).toBe(false);
  });
  it("does not select an old completion or best-known file during the second request", () => {
    const previousCompletion = { ...event({ ...turn, id: "first", ordinal: 1 }), type: "task_completed",
      payload: { outputSummary: oldOutput } } as TaskEvent;
    expect(resolvePreferredTaskOutputSummary({ task: { ...task, bestKnownOutcome: { outputSummary: oldOutput } as any },
      latestCompletionEvent: previousCompletion, fallbackEvents: [previousCompletion] })).toBeNull();
  });
  it("does not fall back to earlier files when a tracked completion delivered none", () => {
    const completion = { ...event({ ...turn, revision: 1, state: "completed", outputSummary: { created: [], outputCount: 0, folders: [] } }), type: "task_completed" } as TaskEvent;
    expect(resolveTaskOutputSummaryFromCompletionEvent(completion, [{ ...event(turn), type: "file_created", payload: { path: "MotusAI.pptx" } } as TaskEvent])).toBeNull();
  });
  it("preserves request and revision identity in a displayed delivery", () => {
    const outputSummary = { created: ["EPAI.pptx"], outputCount: 1, folders: [], turnId: turn.id, revisionIds: ["revision-2"] };
    expect(resolvePreferredTaskOutputSummary({ task: { ...task, currentTurn: { ...turn, state: "completed", outputSummary } } }))
      .toMatchObject({ created: ["EPAI.pptx"], turnId: turn.id, revisionIds: ["revision-2"] });
  });
});
