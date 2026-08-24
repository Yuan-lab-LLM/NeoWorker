import { describe, expect, it } from "vitest";

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

describeWithSqlite("AgentTeamRunRepository recent tasks", () => {
  it("lists distinct recent roots across workspaces and ignores archived or child tasks", async () => {
    const [{ default: Database }, { AgentTeamRunRepository }] =
      await Promise.all([
        import("better-sqlite3"),
        import("../AgentTeamRunRepository"),
      ]);
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        parent_task_id TEXT,
        session_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE task_session_metadata (
        session_id TEXT PRIMARY KEY,
        archived_at INTEGER
      );
      CREATE TABLE agent_team_runs (
        id TEXT PRIMARY KEY,
        root_task_id TEXT NOT NULL,
        started_at INTEGER NOT NULL
      );

      INSERT INTO tasks VALUES
        ('root-new', NULL, NULL, 100, 100),
        ('root-old', NULL, NULL, 50, 50),
        ('root-other-workspace', NULL, NULL, 80, 80),
        ('child', 'root-new', NULL, 120, 120),
        ('archived', NULL, 'archived-session', 110, 110);
      INSERT INTO task_session_metadata VALUES ('archived-session', 999);
      INSERT INTO agent_team_runs VALUES
        ('run-old', 'root-old', 50),
        ('run-new-first', 'root-new', 90),
        ('run-new-latest', 'root-new', 100),
        ('run-other-workspace', 'root-other-workspace', 80),
        ('run-child', 'child', 120),
        ('run-archived', 'archived', 110),
        ('run-orphan', 'missing-task', 130);
    `);

    const repo = new AgentTeamRunRepository(db);
    expect(repo.listRecentRootTaskIds(3)).toEqual([
      "root-new",
      "root-other-workspace",
      "root-old",
    ]);
    expect(repo.listRecentRootTaskIds(1)).toEqual(["root-new"]);

    db.close();
  });
});
