import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { readWorkspaceContext, withWorkspaceConversationName } from "../workspace-context";
import { TEMP_WORKSPACE_NAME, type Workspace } from "../../../shared/types";

describe("workspace ownership", () => {
  it("counts conversations without counting continuations/agents, and scopes file origins", () => {
    const db = new Database(":memory:");
    try {
      db.exec(`CREATE TABLE tasks (id TEXT, title TEXT, workspace_id TEXT, session_id TEXT,
        agent_type TEXT, parent_task_id TEXT, created_at INTEGER);
        CREATE TABLE artifacts (path TEXT, task_id TEXT, created_at INTEGER);`);
      const insert = db.prepare("INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?)");
      insert.run("one", "会议纪要", "shared", "session-one", "main", null, 1);
      insert.run("continuation", "继续完善", "shared", "session-one", "main", null, 2);
      insert.run("two", "经营分析", "shared", null, "main", null, 3);
      insert.run("child", "研究", "shared", null, "sub", "one", 4);
      insert.run("other", "另一个会话", "other", null, "main", null, 5);
      db.exec(`INSERT INTO artifacts VALUES ('report.docx', 'one', 1), ('report.pdf', 'two', 2),
        ('private.pdf', 'other', 3);`);
      const context = readWorkspaceContext(db, "shared");
      expect(context.sessionCount).toBe(2);
      expect(context.fileOrigins.map(item => item.title)).toEqual(["经营分析", "会议纪要"]);
      expect(context.sessions.some(item => item.id === "child")).toBe(false);
      expect(readWorkspaceContext(db, "other").sessionCount).toBe(1);
      expect(readWorkspaceContext(db, "new")).toEqual({ workspaceId: "new", sessionCount: 0, sessions: [], fileOrigins: [] });
      const folder = { id: "shared", name: TEMP_WORKSPACE_NAME, path: "/tmp/original", isTemp: true } as Workspace;
      expect(withWorkspaceConversationName(db, folder)).toEqual({ ...folder, name: "会议纪要" });
      expect(folder.name).toBe(TEMP_WORKSPACE_NAME);
      expect(withWorkspaceConversationName(db, { ...folder, name: "年度规划" }).name).toBe("年度规划");
    } finally { db.close(); }
  });
});
