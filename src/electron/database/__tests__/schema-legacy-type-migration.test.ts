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
    const now = Date.now();
    db.prepare(
      `INSERT INTO workspaces (id, name, path, created_at, permissions)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("workspace-sanitizer", "Workspace", path.join(tmpDir, "sanitizer-workspace"), now, "{}");
    db.prepare(
      `INSERT INTO tasks (
         id, title, prompt, status, workspace_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "task-1",
      "Payload sanitizer task",
      "Payload sanitizer task",
      "completed",
      "workspace-sanitizer",
      now,
      now,
    );

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

  it("repairs historical output failures caused only by attachment formats", async () => {
    const { DatabaseManager } = await import("../schema");
    const manager = new DatabaseManager();
    const db = manager.getDatabase();
    const now = Date.now();
    const prompt = `基于内容，生成excel文件

Attached files (relative to workspace):
- meeting.docx (.neoworker/uploads/meeting.docx)
  Attachment metadata: mime=application/vnd.openxmlformats-officedocument.wordprocessingml.document
  Extracted content:
  [[ATTACHMENT_EXTRACTED_CONTENT_START]]
  客户还讨论了 PPT 生成需求。
  [[ATTACHMENT_EXTRACTED_CONTENT_END]]`;

    db.prepare(
      `INSERT INTO workspaces (id, name, path, created_at, permissions)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("workspace-1", "Workspace", path.join(tmpDir, "workspace"), now, "{}");
    db.prepare(
      `INSERT INTO tasks (
         id, title, prompt, raw_prompt, user_prompt, status, workspace_id,
         created_at, updated_at, completed_at, error, terminal_status,
         failure_class, result_summary
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "task-false-failure",
      "基于内容，生成excel文件",
      prompt,
      prompt,
      prompt,
      "failed",
      "workspace-1",
      now,
      now,
      now,
      "Completion blocked: requested output was not generated (.docx, .pptx).",
      "failed",
      "contract_unmet_write_required",
      "Excel 校验通过。",
    );
    db.prepare(
      `INSERT INTO artifacts (id, task_id, path, mime_type, sha256, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "artifact-1",
      "task-false-failure",
      ".neoworker/report.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "hash",
      1024,
      now,
    );
    db.prepare(
      `INSERT INTO task_events (
         id, task_id, timestamp, type, payload, schema_version, event_id,
         seq, ts, status, actor, legacy_type
       ) VALUES (?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "event-failure",
      "task-false-failure",
      now,
      "timeline_error",
      JSON.stringify({
        message: "Completion blocked",
        gate: "completion_required_artifact_gate",
        requiredArtifactExtensions: [".docx", ".xlsx", ".pptx"],
        deliveredArtifactPaths: [".neoworker/report.xlsx"],
        missingRequiredArtifactExtensions: [".docx", ".pptx"],
      }),
      "event-failure",
      1,
      now,
      "failed",
      "system",
      "error",
    );

    await manager.runPostStartupMaintenance();

    const repairedTask = db
      .prepare(
        `SELECT status, terminal_status, failure_class, error
         FROM tasks WHERE id = ?`,
      )
      .get("task-false-failure") as {
      status: string;
      terminal_status: string;
      failure_class: string | null;
      error: string | null;
    };
    expect(repairedTask).toEqual({
      status: "completed",
      terminal_status: "ok",
      failure_class: null,
      error: null,
    });

    const repairEvent = db
      .prepare(
        `SELECT type, status, legacy_type, payload
         FROM task_events
         WHERE task_id = ?
         ORDER BY seq DESC LIMIT 1`,
      )
      .get("task-false-failure") as {
      type: string;
      status: string;
      legacy_type: string;
      payload: string;
    };
    expect(repairEvent.type).toBe("timeline_step_finished");
    expect(repairEvent.status).toBe("completed");
    expect(repairEvent.legacy_type).toBe("task_completed");
    expect(JSON.parse(repairEvent.payload)).toEqual(
      expect.objectContaining({
        repairReason: "false_artifact_contract_failure",
        requiredArtifactExtensions: [".xlsx"],
        ignoredInputContextExtensions: [".docx", ".pptx"],
      }),
    );

    manager.close();
  });

  it("does not repair a genuine missing requested output", async () => {
    const { DatabaseManager } = await import("../schema");
    const manager = new DatabaseManager();
    const db = manager.getDatabase();
    const now = Date.now();

    db.prepare(
      `INSERT INTO workspaces (id, name, path, created_at, permissions)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("workspace-2", "Workspace", path.join(tmpDir, "workspace-2"), now, "{}");
    db.prepare(
      `INSERT INTO tasks (
         id, title, prompt, raw_prompt, user_prompt, status, workspace_id,
         created_at, updated_at, completed_at, error, terminal_status,
         failure_class
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "task-genuine-failure",
      "生成 PPT 文件",
      "生成 PPT 文件",
      "生成 PPT 文件",
      "生成 PPT 文件",
      "failed",
      "workspace-2",
      now,
      now,
      now,
      "Completion blocked: requested output was not generated (.pptx).",
      "failed",
      "contract_unmet_write_required",
    );
    db.prepare(
      `INSERT INTO artifacts (id, task_id, path, mime_type, sha256, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "artifact-2",
      "task-genuine-failure",
      "design-system.md",
      "text/markdown",
      "hash",
      1024,
      now,
    );
    db.prepare(
      `INSERT INTO task_events (
         id, task_id, timestamp, type, payload, schema_version, event_id,
         seq, ts, status, actor, legacy_type
       ) VALUES (?, ?, ?, ?, ?, 2, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "event-genuine-failure",
      "task-genuine-failure",
      now,
      "timeline_error",
      JSON.stringify({
        gate: "completion_required_artifact_gate",
        requiredArtifactExtensions: [".pptx"],
        deliveredArtifactPaths: ["design-system.md"],
        missingRequiredArtifactExtensions: [".pptx"],
      }),
      "event-genuine-failure",
      1,
      now,
      "failed",
      "system",
      "error",
    );

    await manager.runPostStartupMaintenance();

    const task = db
      .prepare("SELECT status, terminal_status FROM tasks WHERE id = ?")
      .get("task-genuine-failure") as { status: string; terminal_status: string };
    expect(task).toEqual({ status: "failed", terminal_status: "failed" });

    manager.close();
  });
});
