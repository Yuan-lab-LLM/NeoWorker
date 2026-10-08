import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { WorkTurn, WorkTurnState, ArtifactRevision } from "../../shared/work-turn";
import { isWorkTurnTerminal } from "../../shared/work-turn";
import type { TaskOutputSummary } from "../../shared/types";

export function initializeWorkTurnSchema(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(tasks)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "current_turn")) {
    db.exec("ALTER TABLE tasks ADD COLUMN current_turn TEXT");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_turns (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      parent_turn_id TEXT REFERENCES work_turns(id) ON DELETE SET NULL,
      state TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      output_summary TEXT,
      UNIQUE(task_id, ordinal)
    );
    CREATE TABLE IF NOT EXISTS work_turn_items (
      event_id TEXT PRIMARY KEY REFERENCES task_events(id) ON DELETE CASCADE,
      turn_id TEXT NOT NULL REFERENCES work_turns(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_work_turn_items_turn ON work_turn_items(turn_id);
    CREATE TABLE IF NOT EXISTS artifact_revisions (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL REFERENCES work_turns(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size INTEGER NOT NULL,
      previous_revision_id TEXT REFERENCES artifact_revisions(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(turn_id, path, sha256)
    );
    CREATE INDEX IF NOT EXISTS idx_artifact_revisions_path ON artifact_revisions(task_id, path, created_at);
  `);
}

export class WorkTurnRepository {
  constructor(private readonly db: Database.Database) {}

  transaction<T>(work: () => T): T { return this.db.transaction(work)(); }

  find(id: string): WorkTurn | undefined {
    const row = this.db.prepare("SELECT * FROM work_turns WHERE id = ?").get(id);
    return row ? this.map(row) : undefined;
  }

  children(turnId: string): WorkTurn[] {
    return this.db.prepare("SELECT * FROM work_turns WHERE parent_turn_id = ? ORDER BY started_at, ordinal")
      .all(turnId).map((row) => this.map(row));
  }

  interruptRunning(): void {
    this.transaction(() => {
      const running = this.db.prepare("SELECT * FROM work_turns WHERE state = 'running'").all();
      for (const row of running) {
        const turn = this.map(row);
        this.transition(turn.taskId, turn.id, "interrupted");
      }
    });
  }

  current(taskId: string): WorkTurn | undefined {
    const row = this.db.prepare("SELECT * FROM work_turns WHERE task_id = ? ORDER BY ordinal DESC LIMIT 1").get(taskId);
    return row ? this.map(row) : undefined;
  }

  begin(taskId: string, parentTurnId?: string, resume = false, queued = false): WorkTurn {
    return this.db.transaction(() => {
      const previous = this.current(taskId);
      if (resume && previous && ["queued", "running", "waiting", "interrupted"].includes(previous.state)) {
        if (previous.state === "waiting") return previous;
        this.db.prepare("UPDATE work_turns SET state = 'running', finished_at = NULL, revision = revision + 1 WHERE id = ?").run(previous.id);
        return this.project({ ...previous, revision: previous.revision + 1, state: "running", finishedAt: undefined });
      }
      if (previous && !isWorkTurnTerminal(previous.state)) {
        throw new Error("A request is already active in this conversation");
      }
      const turn: WorkTurn = {
        id: randomUUID(), taskId, ordinal: (previous?.ordinal ?? 0) + 1,
        revision: 0, parentTurnId, state: queued ? "queued" : "running", startedAt: Date.now(),
      };
      this.db.prepare(`INSERT INTO work_turns (id, task_id, ordinal, parent_turn_id, state, started_at)
        VALUES (?, ?, ?, ?, ?, ?)`).run(turn.id, taskId, turn.ordinal, parentTurnId ?? null, turn.state, turn.startedAt);
      return this.project(turn);
    })();
  }

  transition(taskId: string, turnId: string, state: WorkTurnState, outputSummary?: TaskOutputSummary): WorkTurn | undefined {
    return this.db.transaction(() => {
      const current = this.current(taskId);
      if (!current || current.id !== turnId || isWorkTurnTerminal(current.state)) return current;
      const next: WorkTurn = {
        ...current, state, revision: current.revision + 1,
        finishedAt: isWorkTurnTerminal(state) ? Date.now() : undefined,
        ...(outputSummary ? { outputSummary } : {}),
      };
      this.db.prepare("UPDATE work_turns SET state = ?, finished_at = ?, output_summary = ?, revision = ? WHERE id = ?")
        .run(state, next.finishedAt ?? null, next.outputSummary ? JSON.stringify(next.outputSummary) : null, next.revision, turnId);
      return this.project(next);
    })();
  }

  linkEvent(taskId: string, turnId: string, eventId: string): void {
    // The task constraint prevents a forged/cross-task turn identifier from acquiring an event.
    this.db.prepare(`INSERT OR IGNORE INTO work_turn_items (event_id, turn_id)
      SELECT e.id, t.id FROM task_events e JOIN work_turns t ON t.id = ?
      WHERE e.id = ? AND e.task_id = ? AND t.task_id = e.task_id`).run(turnId, eventId, taskId);
  }

  addRevision(input: Omit<ArtifactRevision, "id" | "previousRevisionId" | "createdAt">): ArtifactRevision {
    return this.db.transaction(() => {
      const existing = this.db.prepare("SELECT * FROM artifact_revisions WHERE turn_id = ? AND path = ? AND sha256 = ?")
        .get(input.turnId, input.path, input.sha256);
      if (existing) return this.mapRevision(existing);
      const previous = this.db.prepare("SELECT id FROM artifact_revisions WHERE task_id = ? AND path = ? ORDER BY rowid DESC LIMIT 1")
        .get(input.taskId, input.path) as { id: string } | undefined;
      const revision: ArtifactRevision = { ...input, id: randomUUID(), previousRevisionId: previous?.id, createdAt: Date.now() };
      this.db.prepare(`INSERT INTO artifact_revisions
        (id, turn_id, task_id, path, sha256, size, previous_revision_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(revision.id, revision.turnId, revision.taskId, revision.path, revision.sha256, revision.size, previous?.id ?? null, revision.createdAt);
      return revision;
    })();
  }

  revisions(turnId: string): ArtifactRevision[] {
    return this.db.prepare("SELECT * FROM artifact_revisions WHERE turn_id = ? ORDER BY rowid").all(turnId).map((row) => this.mapRevision(row));
  }

  latestRevision(taskId: string, path: string): ArtifactRevision | undefined {
    const row = this.db.prepare("SELECT * FROM artifact_revisions WHERE task_id = ? AND path = ? ORDER BY rowid DESC LIMIT 1").get(taskId, path);
    return row ? this.mapRevision(row) : undefined;
  }

  private project(turn: WorkTurn): WorkTurn {
    const json = JSON.stringify(turn);
    this.db.prepare("UPDATE tasks SET current_turn = ? WHERE id = ?").run(json, turn.taskId);
    return JSON.parse(json) as WorkTurn;
  }

  private map(value: unknown): WorkTurn {
    const row = value as Record<string, any>;
    return { id: row.id, taskId: row.task_id, ordinal: row.ordinal, revision: row.revision,
      state: row.state, startedAt: row.started_at,
      ...(row.parent_turn_id ? { parentTurnId: row.parent_turn_id } : {}),
      ...(row.finished_at != null ? { finishedAt: row.finished_at } : {}),
      ...(row.output_summary ? { outputSummary: JSON.parse(row.output_summary) } : {}) };
  }

  private mapRevision(value: unknown): ArtifactRevision {
    const row = value as Record<string, any>;
    return { id: row.id, turnId: row.turn_id, taskId: row.task_id, path: row.path, sha256: row.sha256,
      size: row.size, previousRevisionId: row.previous_revision_id ?? undefined, createdAt: row.created_at };
  }
}
