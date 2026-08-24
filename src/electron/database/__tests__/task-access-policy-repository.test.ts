import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const nativeSqliteAvailable = await import("better-sqlite3")
  .then((module) => {
    try {
      const probe = new module.default(":memory:");
      probe.close();
      return true;
    } catch {
      return false;
    }
  })
  .catch(() => false);

const describeWithSqlite = nativeSqliteAvailable ? describe : describe.skip;

describeWithSqlite("TaskAccessPolicyRepository", () => {
  let tmpDir: string;
  let previousUserDataDir: string | undefined;
  let manager: import("../schema").DatabaseManager;
  let taskRepo: import("../repositories").TaskRepository;
  let accessRepo: import("../repositories").TaskAccessPolicyRepository;
  let workspaceId: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-task-access-"));
    previousUserDataDir = process.env.NEOWORKER_USER_DATA_DIR;
    process.env.NEOWORKER_USER_DATA_DIR = tmpDir;
    const [{ DatabaseManager }, repositories] = await Promise.all([
      import("../schema"),
      import("../repositories"),
    ]);
    manager = new DatabaseManager();
    const db = manager.getDatabase();
    taskRepo = new repositories.TaskRepository(db);
    accessRepo = new repositories.TaskAccessPolicyRepository(db);
    workspaceId = randomUUID();
    db.prepare(
      "INSERT INTO workspaces (id, name, path, created_at, permissions) VALUES (?, ?, ?, ?, ?)",
    ).run(
      workspaceId,
      "Access workspace",
      tmpDir,
      Date.now(),
      JSON.stringify({ read: true, write: true, delete: false, network: true, shell: false }),
    );
  });

  afterEach(() => {
    manager?.close();
    if (previousUserDataDir === undefined) delete process.env.NEOWORKER_USER_DATA_DIR;
    else process.env.NEOWORKER_USER_DATA_DIR = previousUserDataDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const createTask = () =>
    taskRepo.create({ title: "Access", prompt: "Access", status: "pending", workspaceId });

  it("updates with optimistic revisions and rejects a stale writer", async () => {
    const task = createTask();
    const initial = accessRepo.createInitial(task.id, {
      connectorIds: ["github"],
      workspaceScopes: [{ workspaceId, rootPath: tmpDir, access: "read", primary: true }],
      blockedTools: ["delete_file"],
      shellAccess: false,
      updatedAt: 1,
    });
    const updated = accessRepo.update(task.id, initial.revision, {
      connectorIds: ["github", "slack"],
      effectiveFromTurn: 3,
    });

    expect(updated.revision).toBe(2);
    expect(updated.effectiveFromTurn).toBe(3);
    expect(() => accessRepo.update(task.id, initial.revision, { shellAccess: true })).toThrow(
      "revision conflict",
    );
  });

  it("clones with revision one and cascades on task deletion", () => {
    const source = createTask();
    const target = createTask();
    accessRepo.createInitial(source.id, {
      connectorIds: ["github"],
      workspaceScopes: [{ workspaceId, rootPath: tmpDir, access: "read" }],
      shellAccess: false,
      updatedAt: 1,
    });
    const cloned = accessRepo.clone(source.id, target.id);
    expect(cloned?.revision).toBe(1);
    expect(cloned?.connectorIds).toEqual(["github"]);

    taskRepo.delete(target.id);
    expect(accessRepo.get(target.id)).toBeUndefined();
  });

  it("fails closed to empty bounded collections when persisted JSON is malformed", () => {
    const task = createTask();
    accessRepo.createInitial(task.id, {
      connectorIds: ["github"],
      workspaceScopes: [{ workspaceId, rootPath: tmpDir, access: "read" }],
      shellAccess: false,
      updatedAt: 1,
    });
    manager
      .getDatabase()
      .prepare(
        "UPDATE task_access_policies SET connector_ids_json = ?, workspace_scopes_json = ? WHERE task_id = ?",
      )
      .run('{"unexpected":true}', '"not-an-array"', task.id);

    const restored = accessRepo.get(task.id);
    expect(restored?.connectorIds).toEqual([]);
    expect(restored?.workspaceScopes).toEqual([]);
  });
});
