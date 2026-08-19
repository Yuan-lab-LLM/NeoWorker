import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const nativeSqliteAvailable = await import("better-sqlite3")
  .then((module) => {
    try {
      const Probe = module.default;
      const probe = new Probe(":memory:");
      probe.close();
      return true;
    } catch {
      return false;
    }
  })
  .catch(() => false);

const describeWithSqlite = nativeSqliteAvailable ? describe : describe.skip;

describeWithSqlite("DatabaseManager legacy_type migration", () => {
  let tmpDir: string;
  let previousUserDataDir: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-schema-legacy-type-"));
    previousUserDataDir = process.env.NEOWORKER_USER_DATA_DIR;
    process.env.NEOWORKER_USER_DATA_DIR = tmpDir;

    const dbPath = path.join(tmpDir, "neoworker.db");
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE task_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL
      );
    `);
    db.close();
  });

  afterEach(() => {
    if (previousUserDataDir === undefined) {
      delete process.env.NEOWORKER_USER_DATA_DIR;
    } else {
      process.env.NEOWORKER_USER_DATA_DIR = previousUserDataDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds legacy_type before creating indexes that depend on it", async () => {
    const { DatabaseManager } = await import("../schema");
    const manager = new DatabaseManager();
    const db = manager.getDatabase();

    const taskEventColumns = db.prepare("PRAGMA table_info(task_events)").all() as Array<{
      name: string;
    }>;
    const taskEventIndexes = db.prepare("PRAGMA index_list(task_events)").all() as Array<{
      name: string;
    }>;

    expect(taskEventColumns.map((column) => column.name)).toContain("legacy_type");
    expect(taskEventIndexes.map((index) => index.name)).toContain(
      "idx_task_events_legacy_type_timestamp_task",
    );
    expect(taskEventIndexes.map((index) => index.name)).toContain(
      "idx_task_events_task_legacy_type_timestamp",
    );
    expect(taskEventIndexes.map((index) => index.name)).toContain(
      "idx_task_events_task_order_expr",
    );
    expect(taskEventIndexes.map((index) => index.name)).toContain(
      "idx_task_events_task_effective_type_order_expr",
    );

    manager.close();
  });

  it("defers oversized task event payload cleanup until post-startup maintenance", async () => {
    const dbPath = path.join(tmpDir, "neoworker.db");
    const oversizedPayload = JSON.stringify({
      message: "x".repeat(300_000),
      nested: { value: "y".repeat(300_000) },
    });
    const seedDb = new Database(dbPath);
    seedDb
      .prepare(
        `
          INSERT INTO task_events (id, task_id, timestamp, type, payload)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run("event-1", "task-1", Date.now(), "tool_result", oversizedPayload);
    seedDb.close();

    const { DatabaseManager } = await import("../schema");
    const manager = new DatabaseManager();
    const db = manager.getDatabase();

    const beforeMaintenance = db
      .prepare("SELECT LENGTH(payload) AS payload_bytes FROM task_events WHERE id = ?")
      .get("event-1") as { payload_bytes: number };
    expect(beforeMaintenance.payload_bytes).toBe(oversizedPayload.length);

    await manager.runPostStartupMaintenance();

    const afterMaintenance = db
      .prepare(
        `
          SELECT LENGTH(payload) AS payload_bytes
          FROM task_events
          WHERE id = ?
        `,
      )
      .get("event-1") as { payload_bytes: number };
    const maintenanceState = db
      .prepare("SELECT value FROM maintenance_state WHERE key = ?")
      .get("task_event_payload_sanitizer_v1_completed") as { value?: string } | undefined;

    expect(afterMaintenance.payload_bytes).toBeLessThanOrEqual(256 * 1024);
    expect(maintenanceState?.value).toBe("1");

    manager.close();
  });
});
