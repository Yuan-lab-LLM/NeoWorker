import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { AgentDaemon } from "../daemon";
import { TaskEventRepository } from "../../database/repositories";
import { WorkTurnRepository, initializeWorkTurnSchema } from "../../database/WorkTurnRepository";
import { WorkTurnService } from "../../sessions/WorkTurnService";
import type { TaskEvent } from "../../../shared/types";

let db: Database.Database;
let repo: WorkTurnRepository;
let service: WorkTurnService;
let daemon: any;
beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY); INSERT INTO tasks VALUES ('task');
    CREATE TABLE task_events (id TEXT PRIMARY KEY, task_id TEXT, timestamp INTEGER, type TEXT, payload TEXT,
      schema_version INTEGER, event_id TEXT, seq INTEGER, ts INTEGER, status TEXT, step_id TEXT, group_id TEXT,
      actor TEXT, legacy_type TEXT);`);
  initializeWorkTurnSchema(db);
  repo = new WorkTurnRepository(db);
  service = new WorkTurnService(repo);
  daemon = Object.assign(Object.create(AgentDaemon.prototype), {
    workTurns: service,
    taskRepo: { findById: vi.fn(() => ({ id: "task", workspaceId: "workspace", currentTurn: repo.current("task") })), update: vi.fn() },
    workspaceRepo: { findById: vi.fn() },
    eventRepo: new TaskEventRepository(db),
    maybeMaterializeMailComposeInlineFrame: vi.fn(),
    logActivityForEvent: vi.fn(),
    emitTaskEvent: vi.fn(),
    finishQueueSlot: vi.fn(),
    captureToMemory: vi.fn(async () => undefined),
  });
});
afterEach(() => db.close());

function persist(type: string, payload: Record<string, unknown> = {}) {
  service.stamp("task", payload);
  const event = { id: "event", taskId: "task", timestamp: Date.now(), type, payload, schemaVersion: 2 } as TaskEvent;
  daemon.persistTimelineEvent(event);
}

describe("daemon request lifecycle integration", () => {
  it("does not revive a cancelled request from a delayed queue callback", async () => {
    service.begin("task", undefined, false, true);
    service.cancel("task");
    daemon.cancelTaskRecord = vi.fn();
    daemon.finishQueueSlot = vi.fn();
    await daemon.startTaskImmediate({ id: "task" });
    expect(repo.current("task")?.state).toBe("cancelled");
    expect(repo.current("task")?.ordinal).toBe(1);
    expect(daemon.finishQueueSlot).toHaveBeenCalledWith("task");
    expect(daemon.workspaceRepo.findById).not.toHaveBeenCalled();
  });

  it.each(["cancelled", "replaced"])("does not launch a queued child of a %s parent request", async (state) => {
    db.exec("INSERT INTO tasks (id) VALUES ('child')");
    const parent = service.begin("task");
    service.begin("child", "task", false, true);
    if (state === "cancelled") service.cancel("task");
    else {
      repo.transition("task", parent.id, "completed");
      service.begin("task");
    }
    daemon.cancelTaskRecord = vi.fn();
    await daemon.startTaskImmediate({ id: "child", parentTaskId: "task" });
    expect(repo.current("child")?.state).toBe("cancelled");
    expect(daemon.cancelTaskRecord).toHaveBeenCalledWith("child", expect.any(String));
    expect(daemon.workspaceRepo.findById).not.toHaveBeenCalled();
  });

  it("broadcasts the same committed outcome that history and the task reload will read", () => {
    const turn = service.begin("task");
    service.run(turn, () => persist("task_completed"));
    const live = daemon.emitTaskEvent.mock.calls[0][0];
    const replay = daemon.eventRepo.findByTaskId("task")[0];
    expect(live.payload.workTurn).toEqual(replay.payload.workTurn);
    expect(live.payload.workTurn).toEqual(repo.current("task"));
    expect(replay.payload.outputSummary).toMatchObject({ turnId: turn.id, outputCount: 0 });
    expect(db.prepare("SELECT * FROM work_turn_items").all()).toEqual([{ event_id: "event", turn_id: turn.id }]);
  });

  it("does not broadcast or retain half an outcome if the final event write fails", () => {
    service.begin("task");
    vi.spyOn(daemon.eventRepo, "updatePayloadById").mockImplementation(() => { throw new Error("disk full"); });
    expect(() => persist("task_completed")).toThrow("disk full");
    expect(repo.current("task")?.state).toBe("running");
    expect(daemon.eventRepo.findByTaskId("task")).toHaveLength(0);
    expect(daemon.emitTaskEvent).not.toHaveBeenCalled();
  });

  it("blocks stale completion, failure, status, and metadata writes at the daemon boundary", () => {
    const old = service.begin("task");
    repo.transition("task", old.id, "completed");
    service.begin("task");
    service.run(old, () => {
      daemon.completeTask("task", "old completion");
      daemon.failTask("task", "old failure");
      daemon.updateTaskStatus("task", "completed");
      daemon.updateTask("task", { bestKnownOutcome: { resultSummary: "old outcome" } });
      daemon.beginFollowUpRun("task");
      daemon.cancelTaskRecord("task", "old cancellation");
      daemon.logEvent("task", "task_completed", {});
    });
    expect(daemon.taskRepo.findById).not.toHaveBeenCalled();
    expect(daemon.taskRepo.update).not.toHaveBeenCalled();
    expect(repo.current("task")?.state).toBe("running");
  });

  it("blocks completion and reactivation after cancellation without waiting for the runtime to stop", () => {
    service.begin("task");
    service.cancel("task");
    daemon.completeTask("task", "late result");
    daemon.updateTaskStatus("task", "executing");
    daemon.updateTask("task", { status: "completed" });
    daemon.beginFollowUpRun("task");
    daemon.logEvent("task", "task_completed", {});
    expect(daemon.taskRepo.update).not.toHaveBeenCalled();
    expect(repo.current("task")?.state).toBe("cancelled");
  });
});
