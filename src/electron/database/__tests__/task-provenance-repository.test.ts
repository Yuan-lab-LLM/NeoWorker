import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const nativeSqliteAvailable = await import("better-sqlite3")
  .then((module) => {
    try {
      const Database = module.default;
      const probe = new Database(":memory:");
      probe.close();
      return true;
    } catch {
      return false;
    }
  })
  .catch(() => false);

const describeWithSqlite = nativeSqliteAvailable ? describe : describe.skip;

describeWithSqlite("TaskProvenanceRepository", () => {
  let tmpDir: string;
  let previousUserDataDir: string | undefined;
  let manager: import("../schema").DatabaseManager;
  let db: ReturnType<import("../schema").DatabaseManager["getDatabase"]>;
  let taskRepo: import("../repositories").TaskRepository;
  let provenanceRepo: import("../repositories").TaskProvenanceRepository;
  let workspaceId: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-task-provenance-"));
    previousUserDataDir = process.env.NEOWORKER_USER_DATA_DIR;
    process.env.NEOWORKER_USER_DATA_DIR = tmpDir;

    const [{ DatabaseManager }, repositories] = await Promise.all([
      import("../schema"),
      import("../repositories"),
    ]);

    manager = new DatabaseManager();
    db = manager.getDatabase();
    taskRepo = new repositories.TaskRepository(db);
    provenanceRepo = new repositories.TaskProvenanceRepository(db);
    workspaceId = randomUUID();
    const workspacePath = path.join(tmpDir, "workspace");
    fs.mkdirSync(workspacePath, { recursive: true });
    db.prepare(
      `
        INSERT INTO workspaces (id, name, path, created_at, permissions)
        VALUES (?, ?, ?, ?, ?)
      `,
    ).run(
      workspaceId,
      "Provenance workspace",
      workspacePath,
      Date.now(),
      JSON.stringify({ read: true, write: true, delete: true, network: true, shell: true }),
    );
  });

  afterEach(() => {
    manager?.close();
    if (previousUserDataDir === undefined) {
      delete process.env.NEOWORKER_USER_DATA_DIR;
    } else {
      process.env.NEOWORKER_USER_DATA_DIR = previousUserDataDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const createTask = (title: string) =>
    taskRepo.create({
      title,
      prompt: title,
      status: "pending",
      workspaceId,
    });

  it("persists a display-safe source record and removes disallowed metadata", () => {
    const task = createTask("Gateway task");
    const record = provenanceRepo.create({
      taskId: task.id,
      relation: "direct",
      sourceKind: "gateway_message",
      providerKey: "slack",
      providerLabel: "Slack",
      externalId: "message-1",
      actor: { id: "user-1", displayName: "Avery Chen", kind: "user" },
      conversation: { id: "channel-1", label: "launch", isGroup: true },
      excerpt: "Please prepare the launch brief.",
      attachments: [{ name: "brief.pdf", mimeType: "application/pdf", size: 42 }],
      occurredAt: 1_000,
      metadata: {
        replyTo: "message-0",
        requestId: "token=hidden-value",
        authorization: "Bearer secret",
        cookie: "secret",
      },
    });

    expect(provenanceRepo.listByTaskId(task.id)).toEqual([
      expect.objectContaining({
        id: record.id,
        providerKey: "slack",
        excerpt: "Please prepare the launch brief.",
        metadata: { replyTo: "message-0", requestId: "token=[REDACTED]" },
      }),
    ]);
  });

  it("deduplicates repeated external messages at the database boundary", () => {
    const task = createTask("Idempotent gateway task");
    const input = {
      taskId: task.id,
      relation: "direct" as const,
      sourceKind: "gateway_message" as const,
      providerKey: "slack",
      externalId: "message-2",
      excerpt: "Run once",
      occurredAt: 2_000,
    };

    const first = provenanceRepo.createOrGetByExternalId(input);
    const second = provenanceRepo.createOrGetByExternalId({
      ...input,
      excerpt: "Duplicate delivery",
    });

    expect(second.id).toBe(first.id);
    expect(provenanceRepo.listByTaskId(task.id)).toHaveLength(1);
    expect(provenanceRepo.listByTaskId(task.id)[0].excerpt).toBe("Run once");
  });

  it("bounds excerpts and clones references as inherited provenance", () => {
    const sourceTask = createTask("Source task");
    const targetTask = createTask("Forked task");
    provenanceRepo.create({
      taskId: sourceTask.id,
      relation: "direct",
      sourceKind: "gateway_message",
      providerKey: "email",
      externalId: "mail-1",
      excerpt: "x".repeat(5_000),
      occurredAt: 3_000,
    });

    const [cloned] = provenanceRepo.cloneReferences(sourceTask.id, targetTask.id);

    expect(cloned.relation).toBe("inherited");
    expect(cloned.excerpt).toHaveLength(4_096);
    expect(cloned.excerptTruncated).toBe(true);
    expect(provenanceRepo.listByTaskId(targetTask.id)).toHaveLength(1);
  });

  it("pages from the latest sources while preserving chronological card order", () => {
    const task = createTask("Long-running gateway task");
    for (let index = 1; index <= 5; index += 1) {
      provenanceRepo.create({
        taskId: task.id,
        relation: index === 1 ? "direct" : "follow_up",
        sourceKind: "gateway_message",
        providerKey: "slack",
        externalId: `message-${index}`,
        occurredAt: index,
      });
    }

    expect(
      provenanceRepo.listRecentByTaskId(task.id, 3).map((record) => record.externalId),
    ).toEqual(["message-3", "message-4", "message-5"]);
  });

  it("deletes provenance when its task is deleted", () => {
    const task = createTask("Disposable task");
    provenanceRepo.create({
      taskId: task.id,
      relation: "direct",
      sourceKind: "api_request",
      externalId: "request-1",
      occurredAt: Date.now(),
    });

    taskRepo.delete(task.id);

    expect(provenanceRepo.listByTaskId(task.id)).toEqual([]);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("returns safe empty values when persisted JSON has an invalid shape", () => {
    const task = createTask("Malformed provenance");
    const record = provenanceRepo.create({
      taskId: task.id,
      relation: "direct",
      sourceKind: "api_request",
      externalId: "request-malformed",
      occurredAt: Date.now(),
    });
    db.prepare(
      `
        UPDATE task_provenance
        SET actor_json = ?, attachments_json = ?, metadata_json = ?
        WHERE id = ?
      `,
    ).run('"unexpected"', '{"not":"an array"}', '["not", "an", "object"]', record.id);

    const restored = provenanceRepo.listByTaskId(task.id)[0];
    expect(restored.actor).toBeUndefined();
    expect(restored.attachments).toEqual([]);
    expect(restored.metadata).toBeUndefined();
  });
});
