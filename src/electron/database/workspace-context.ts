import type Database from "better-sqlite3";
import { isTempWorkspaceId, TEMP_WORKSPACE_NAME, type Workspace, type WorkspaceContextDetails } from "../../shared/types";

// Give unnamed temporary folders a stable, readable label without changing their files or records.
export function withWorkspaceConversationName(db: Database.Database, workspace: Workspace): Workspace {
  if ((!workspace.isTemp && !isTempWorkspaceId(workspace.id)) ||
    (workspace.name && workspace.name !== TEMP_WORKSPACE_NAME)) return workspace;
  const first = db.prepare(`SELECT title FROM tasks WHERE workspace_id = ?
    AND COALESCE(agent_type, 'main') NOT IN ('sub', 'parallel') AND parent_task_id IS NULL
    ORDER BY created_at ASC, id ASC LIMIT 1`).get(workspace.id) as { title: string } | undefined;
  return first?.title?.trim() ? { ...workspace, name: first.title.trim() } : workspace;
}

export function readWorkspaceContext(db: Database.Database, workspaceId: string): WorkspaceContextDetails {
  const roots = `workspace_id = ? AND COALESCE(agent_type, 'main') NOT IN ('sub', 'parallel')
    AND parent_task_id IS NULL`;
  const sessionCount = (db.prepare(`SELECT COUNT(DISTINCT COALESCE(NULLIF(session_id, ''), id)) AS count
    FROM tasks WHERE ${roots}`).get(workspaceId) as { count: number }).count;
  const sessions = db.prepare(`SELECT id, title FROM tasks WHERE ${roots}
    ORDER BY created_at ASC LIMIT 100`).all(workspaceId) as WorkspaceContextDetails["sessions"];
  const fileOrigins = db.prepare(`SELECT a.path, a.task_id AS taskId, t.title
    FROM artifacts a JOIN tasks t ON t.id = a.task_id
    WHERE t.workspace_id = ? ORDER BY a.created_at DESC LIMIT 1000`)
    .all(workspaceId) as WorkspaceContextDetails["fileOrigins"];
  return { workspaceId, sessionCount, sessions, fileOrigins };
}
