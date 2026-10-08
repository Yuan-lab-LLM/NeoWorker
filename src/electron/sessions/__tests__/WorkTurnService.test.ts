import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync, writeFileSync, utimesSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { initializeWorkTurnSchema, WorkTurnRepository } from "../../database/WorkTurnRepository";
import { WorkTurnService } from "../WorkTurnService";
import type { TaskEvent, TaskOutputSummary } from "../../../shared/types";

let db: Database.Database;
let root: string;
let repo: WorkTurnRepository;
let service: WorkTurnService;
function record(taskId: string, type: string, payload: Record<string, unknown> = {}) {
  service.stamp(taskId, payload);
  const event = { id: randomUUID(), taskId, type, timestamp: Date.now(), schemaVersion: 2, payload } as TaskEvent;
  return repo.transaction(() => {
    db.prepare("INSERT INTO task_events (id, task_id) VALUES (?, ?)").run(event.id, taskId);
    return service.record(event, root);
  });
}
const summary = (file: string): TaskOutputSummary => ({ created: [file], primaryOutputPath: file, outputCount: 1, folders: ["."] });

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "neoworker-turn-test-"));
  db = new Database(join(root, "turns.db"));
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY); CREATE TABLE task_events (id TEXT PRIMARY KEY, task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE);
    INSERT INTO tasks VALUES ('parent'), ('a'), ('b');`);
  initializeWorkTurnSchema(db);
  repo = new WorkTurnRepository(db);
  service = new WorkTurnService(repo);
});
afterEach(() => { db.close(); rmSync(root, { recursive: true, force: true }); });

describe("durable request lifecycle", () => {
  it("recovers unfinished work as interrupted while preserving pending approval and queued children", () => {
    const first = service.begin("parent");
    service.begin("a", "parent");
    record("a", "approval_requested");
    const queued = service.begin("b", "parent", false, true);
    repo.interruptRunning();
    expect(repo.current("parent")?.state).toBe("interrupted");
    expect(repo.current("a")?.state).toBe("waiting");
    expect(repo.current("b")?.state).toBe("queued");
    expect(service.begin("parent", undefined, true).id).toBe(first.id);
    expect(service.begin("a", "parent", true).state).toBe("waiting");
    expect(service.begin("b", "parent", true)).toMatchObject({ id: queued.id, state: "running" });
  });

  it("survives a database reopen with distinct rounds and immutable earlier outcomes", () => {
    const first = service.begin("parent");
    record("parent", "task_completed");
    const second = service.begin("parent");
    expect(second.ordinal).toBe(2);
    expect(second.outputSummary).toBeUndefined();
    db.close();
    db = new Database(join(root, "turns.db"));
    initializeWorkTurnSchema(db); // Migration is idempotent.
    repo = new WorkTurnRepository(db);
    expect(repo.find(first.id)?.state).toBe("completed");
    expect(repo.current("parent")).toMatchObject({ id: second.id, state: "running" });
    expect(JSON.parse((db.prepare("SELECT current_turn FROM tasks WHERE id = 'parent'").get() as any).current_turn).id).toBe(second.id);
  });

  it("rejects late async work from round one while round two is running", async () => {
    const first = service.begin("parent");
    let release!: () => void;
    const pending = service.run(first, async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      const payload = {};
      return { accepted: service.accepts("parent"), stamped: service.stamp("parent", payload) };
    });
    record("parent", "task_completed");
    service.begin("parent");
    release();
    expect(await pending).toEqual({ accepted: false, stamped: false });
    expect(repo.current("parent")?.state).toBe("running");
  });

  it("does not let an old child finish a new parent round", () => {
    service.begin("parent");
    const child = service.begin("a", "parent");
    record("parent", "task_completed");
    service.begin("parent");
    expect(service.run(child, () => service.accepts("parent"))).toBe(false);
  });

  it("rejects concurrent starts without creating orphan turns", () => {
    service.begin("parent");
    expect(() => service.begin("parent")).toThrow("already active");
    expect(repo.current("parent")?.ordinal).toBe(1);
  });

  it("preserves cancellation across late completion, progress, and approval events", () => {
    service.begin("parent");
    service.cancel("parent");
    record("parent", "task_completed");
    record("parent", "approval_granted");
    record("parent", "task_status", { status: "executing" });
    expect(repo.current("parent")?.state).toBe("cancelled");
    expect(service.accepts("parent", true)).toBe(false);
  });

  it("does not mistake reply generation for passing the completion gate", () => {
    service.begin("parent");
    record("parent", "follow_up_completed");
    expect(repo.current("parent")?.state).toBe("running");
    record("parent", "task_status", { status: "failed", terminalStatus: "failed" });
    expect(repo.current("parent")?.state).toBe("failed");
  });

  it("keeps a failed follow-up failed when the legacy task restores a previous result", () => {
    service.begin("parent");
    record("parent", "follow_up_failed");
    record("parent", "task_status", { status: "completed" });
    expect(repo.current("parent")?.state).toBe("failed");
  });

  it("preserves a wait until an explicit resolution and resumes the same turn", () => {
    const turn = service.begin("parent");
    record("parent", "approval_requested", { autoApproved: true });
    expect(repo.current("parent")?.state).toBe("running");
    record("parent", "approval_requested");
    record("parent", "progress_update");
    expect(repo.current("parent")?.state).toBe("waiting");
    record("parent", "approval_granted");
    expect(repo.current("parent")).toMatchObject({ id: turn.id, state: "running" });
    record("parent", "task_interrupted");
    expect(service.begin("parent", undefined, true).id).toBe(turn.id);
  });

  it("aggregates only the current parent round and the latest attempt per member", () => {
    service.begin("parent");
    service.begin("a", "parent");
    service.begin("b", "parent");
    record("a", "task_failed");
    record("b", "task_failed");
    expect(service.teamOutcome("parent")).toBe("failed");
    service.begin("a", "parent");
    record("a", "task_completed");
    expect(service.teamOutcome("parent")).toBe("partial_success");
    record("parent", "task_completed", { terminalStatus: "partial_success" });
    service.begin("parent");
    expect(service.teamOutcome("parent")).toBeUndefined();
  });

  it("rolls back both an event and its outcome when persistence fails", () => {
    const turn = service.begin("parent");
    expect(() => repo.transaction(() => {
      record("parent", "task_completed");
      throw new Error("disk failure");
    })).toThrow("disk failure");
    expect(repo.find(turn.id)?.state).toBe("running");
    expect(db.prepare("SELECT * FROM work_turn_items").all()).toHaveLength(0);
    expect(db.prepare("SELECT * FROM task_events").all()).toHaveLength(0);
  });
});

describe("delivery revisions", () => {
  it("does not call an unchanged earlier file a new revision even if its mtime was touched", () => {
    service.begin("parent");
    writeFileSync(join(root, "report.pdf"), "unchanged report");
    record("parent", "task_completed", { outputSummary: summary("report.pdf") });
    const next = service.begin("parent");
    utimesSync(join(root, "report.pdf"), new Date(), new Date());
    record("parent", "task_completed", { outputSummary: summary("report.pdf") });
    expect(repo.revisions(next.id)).toHaveLength(0);
    expect(repo.current("parent")?.outputSummary?.outputCount).toBe(0);
  });

  it("records hashes and an append-only chain when the same path changes in another round", () => {
    const first = service.begin("parent");
    writeFileSync(join(root, "report.pdf"), "first report");
    record("parent", "task_completed", { outputSummary: summary("report.pdf") });
    const second = service.begin("parent");
    writeFileSync(join(root, "report.pdf"), "second report");
    record("parent", "task_completed", { outputSummary: summary("report.pdf") });
    const a = repo.revisions(first.id)[0];
    const b = repo.revisions(second.id)[0];
    expect(a.sha256).not.toBe(b.sha256);
    expect(b.previousRevisionId).toBe(a.id);
    expect(repo.current("parent")?.outputSummary?.revisionIds).toEqual([b.id]);
    expect(repo.current("parent")?.outputSummary?.turnId).toBe(second.id);
  });

  it("excludes stale source decks, missing files, and symlinks outside the workspace", () => {
    const turn = service.begin("parent");
    writeFileSync(join(root, "MotusAI.pptx"), "source deck");
    utimesSync(join(root, "MotusAI.pptx"), new Date(1000), new Date(1000));
    symlinkSync("/etc/hosts", join(root, "external.txt"));
    record("parent", "task_completed", { outputSummary: {
      created: ["MotusAI.pptx", "missing.pdf", "external.txt", "../outside.pdf"], outputCount: 4, folders: [],
    } });
    expect(repo.revisions(turn.id)).toHaveLength(0);
    expect(repo.current("parent")?.outputSummary?.outputCount).toBe(0);
  });

  it("does not reuse an earlier file for a text-only follow-up", () => {
    service.begin("parent");
    writeFileSync(join(root, "report.pdf"), "report");
    record("parent", "task_completed", { outputSummary: summary("report.pdf") });
    service.begin("parent");
    record("parent", "task_completed");
    expect(repo.current("parent")?.outputSummary).toMatchObject({ created: [], outputCount: 0 });
  });

  it("is idempotent per turn/path/hash and removes owned records when a task is deleted", () => {
    const turn = service.begin("parent");
    writeFileSync(join(root, "report.pdf"), "report");
    service.captureOutputs(turn, summary("report.pdf"), root);
    service.captureOutputs(turn, summary("report.pdf"), root);
    expect(repo.revisions(turn.id)).toHaveLength(1);
    record("parent", "task_completed", { outputSummary: summary("report.pdf") });
    db.prepare("DELETE FROM tasks WHERE id = 'parent'").run();
    expect(db.prepare("SELECT * FROM work_turns").all()).toHaveLength(0);
    expect(db.prepare("SELECT * FROM work_turn_items").all()).toHaveLength(0);
    expect(db.prepare("SELECT * FROM artifact_revisions").all()).toHaveLength(0);
  });
});
