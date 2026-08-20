import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

describeWithSqlite("WorkspaceRepository archive state", () => {
  let tmpDir: string;
  let previousUserDataDir: string | undefined;
  let manager: import("../schema").DatabaseManager;
  let workspaceRepo: import("../repositories").WorkspaceRepository;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "neoworker-workspace-archive-"));
    previousUserDataDir = process.env.NEOWORKER_USER_DATA_DIR;
    process.env.NEOWORKER_USER_DATA_DIR = tmpDir;

    const [{ DatabaseManager }, { WorkspaceRepository }] = await Promise.all([
      import("../schema"),
      import("../repositories"),
    ]);
    manager = new DatabaseManager();
    workspaceRepo = new WorkspaceRepository(manager.getDatabase());
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

  it("archives and restores a workspace without deleting its local folder", () => {
    const workspacePath = path.join(tmpDir, "project");
    fs.mkdirSync(workspacePath, { recursive: true });
    const workspace = workspaceRepo.create("Project", workspacePath, {
      read: true,
      write: true,
      delete: false,
      network: true,
      shell: false,
    });

    const archivedAt = Date.now();
    workspaceRepo.updateArchivedAt(workspace.id, archivedAt);
    expect(workspaceRepo.findById(workspace.id)?.archivedAt).toBe(archivedAt);
    expect(fs.existsSync(workspacePath)).toBe(true);

    workspaceRepo.updateArchivedAt(workspace.id, undefined);
    expect(workspaceRepo.findById(workspace.id)?.archivedAt).toBeUndefined();
    expect(fs.existsSync(workspacePath)).toBe(true);
  });
});
