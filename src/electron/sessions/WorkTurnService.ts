import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { TaskEvent, TaskOutputSummary } from "../../shared/types";
import { isWorkTurnTerminal, type WorkTurn, type WorkTurnState } from "../../shared/work-turn";
import { WorkTurnRepository } from "../database/WorkTurnRepository";

type TurnContext = { taskId: string; turnId: string };

/** Shared by native and Hermes execution; a late callback retains its original request identity. */
export class WorkTurnService {
  private readonly scope = new AsyncLocalStorage<TurnContext>();

  constructor(readonly repo: WorkTurnRepository) {}

  begin(taskId: string, parentTaskId?: string, resume = false, queued = false): WorkTurn {
    return this.repo.begin(taskId, parentTaskId ? this.repo.current(parentTaskId)?.id : undefined, resume, queued);
  }

  run<T>(turn: WorkTurn, work: () => T): T {
    return this.scope.run({ taskId: turn.taskId, turnId: turn.id }, work);
  }

  context(taskId: string): TurnContext | undefined {
    const context = this.scope.getStore();
    return context?.taskId === taskId ? context : undefined;
  }

  accepts(taskId: string, requireActive = false): boolean {
    const current = this.repo.current(taskId);
    const context = this.context(taskId);
    if (context && context.turnId !== current?.id) return false;
    // Child completion callbacks also inherit a scope. Never let a child from
    // an earlier parent request finish the parent's newer request.
    if (!context && this.scope.getStore()) {
      let ancestor = this.repo.find(this.scope.getStore()!.turnId);
      while (ancestor?.parentTurnId) {
        ancestor = this.repo.find(ancestor.parentTurnId);
        if (ancestor?.taskId === taskId && ancestor.id !== current?.id) return false;
      }
    }
    return !requireActive || !current || !isWorkTurnTerminal(current.state);
  }

  /** Stamp before timeline normalization so live and replayed events retain the same identity. */
  stamp(taskId: string, payload: Record<string, unknown>): boolean {
    if (!this.accepts(taskId)) return false;
    const turnId = this.context(taskId)?.turnId ?? this.repo.current(taskId)?.id;
    if (turnId) payload.workTurnId = turnId;
    return true;
  }

  cancel(taskId: string): void {
    if (!this.accepts(taskId)) return;
    const turn = this.repo.current(taskId);
    if (turn) this.repo.transition(taskId, turn.id, "cancelled");
  }

  teamOutcome(taskId: string): "failed" | "partial_success" | undefined {
    const parent = this.repo.current(taskId);
    if (!parent) return undefined;
    // Retrying a child replaces only that child's outcome, not other members.
    const latest = new Map<string, WorkTurn>();
    for (const child of this.repo.children(parent.id)) latest.set(child.taskId, child);
    const children = [...latest.values()];
    if (!children.length || children.every((child) => child.state === "completed")) return undefined;
    return children.every((child) => child.state === "failed" || child.state === "cancelled") ? "failed" : "partial_success";
  }

  record(event: TaskEvent, workspacePath?: string): WorkTurn | undefined {
    const turn = this.repo.current(event.taskId);
    if (!turn || event.payload?.workTurnId !== turn.id) return turn;
    this.repo.linkEvent(event.taskId, turn.id, event.id);
    if (isWorkTurnTerminal(turn.state)) return turn;
    const payload = event.payload ?? {};
    const type = event.legacyType || payload.legacyType || event.type;
    let state: WorkTurnState | undefined;
    if (type === "task_queued") state = "queued";
    else if (type === "task_cancelled") state = "cancelled";
    else if (type === "task_failed" || type === "follow_up_failed") state = "failed";
    else if (type === "task_completed") {
      state = payload.terminalStatus === "failed" ? "failed"
        : payload.terminalStatus === "partial_success" || payload.terminalStatus === "needs_user_action" ? "partial" : "completed";
    } else if (type === "task_status") {
      const statuses: Record<string, WorkTurnState> = {
        completed: payload.terminalStatus === "partial_success" ? "partial" : "completed",
        failed: "failed", cancelled: "cancelled", interrupted: "interrupted",
        paused: "waiting", blocked: "waiting", executing: "running", planning: "running",
      };
      state = statuses[String(payload.status)];
    } else if (type === "task_interrupted") state = "interrupted";
    else if (type === "task_paused" || type === "input_request_created" ||
      (type === "approval_requested" && payload.autoApproved !== true)) state = "waiting";
    else if (["input_request_resolved", "approval_granted"].includes(type) ||
      (type === "task_resumed" && turn.state !== "waiting")) state = "running";
    if (!state) return turn;
    const outputs = state === "completed" || state === "partial"
      ? this.captureOutputs(turn, payload.outputSummary, workspacePath) : undefined;
    return this.repo.transition(event.taskId, turn.id, state, outputs);
  }

  captureOutputs(turn: WorkTurn, summary: TaskOutputSummary | undefined, workspacePath?: string): TaskOutputSummary {
    return this.collectOutputs(turn, summary, workspacePath, true);
  }

  /** Completion gates inspect the same files without committing a revision before acceptance. */
  validateOutputs(turn: WorkTurn, summary: TaskOutputSummary | undefined, workspacePath?: string): TaskOutputSummary {
    return this.collectOutputs(turn, summary, workspacePath, false);
  }

  private collectOutputs(turn: WorkTurn, summary: TaskOutputSummary | undefined, workspacePath: string | undefined, commit: boolean): TaskOutputSummary {
    const result: TaskOutputSummary = { created: [], outputCount: 0, folders: [], turnId: turn.id, revisionIds: [] };
    if (!workspacePath || !summary) return result;
    let root: string;
    try { root = fs.realpathSync(workspacePath); } catch { return result; }
    const paths = [...(summary.created ?? []), ...(summary.modifiedFallback ?? [])];
    if (summary.primaryOutputPath) paths.push(summary.primaryOutputPath);
    const seen = new Set<string>();
    for (const candidate of paths) {
      if (typeof candidate !== "string") continue;
      let descriptor: number | undefined;
      try {
        const absolute = fs.realpathSync(path.resolve(root, candidate));
        const relative = path.relative(root, absolute);
        if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || seen.has(absolute)) continue;
        seen.add(absolute);
        descriptor = fs.openSync(absolute, "r");
        const before = fs.fstatSync(descriptor);
        // Old input/reference files are not new deliveries. Hashing is bounded and does not load the file into memory.
        if (!before.isFile() || before.size <= 0 || before.size > 256 * 1024 * 1024 || before.mtimeMs < turn.startedAt - 2) continue;
        const hash = createHash("sha256");
        const chunk = Buffer.allocUnsafe(64 * 1024);
        let count: number;
        let total = 0;
        while ((count = fs.readSync(descriptor, chunk, 0, chunk.length, null)) > 0) {
          total += count;
          if (total > before.size) throw new Error("Artifact changed during verification");
          hash.update(chunk.subarray(0, count));
        }
        const after = fs.fstatSync(descriptor);
        const current = fs.statSync(absolute);
        if (total !== before.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs ||
          before.ino !== current.ino || before.mtimeMs !== current.mtimeMs) continue;
        const sha256 = hash.digest("hex");
        const previous = this.repo.latestRevision(turn.taskId, absolute);
        if (previous && previous.turnId !== turn.id && previous.sha256 === sha256) continue;
        result.created.push(candidate);
        if (commit) {
          const revision = this.repo.addRevision({ turnId: turn.id, taskId: turn.taskId, path: absolute, sha256, size: total });
          result.revisionIds!.push(revision.id);
        }
      } catch (error) {
        // Database failures must roll back the event and projection together.
        if (String((error as NodeJS.ErrnoException)?.code || "").startsWith("SQLITE_")) throw error;
        // A missing, replaced, unreadable, or out-of-workspace file is not a committed delivery.
      } finally {
        if (descriptor !== undefined) fs.closeSync(descriptor);
      }
    }
    result.outputCount = result.created.length;
    result.primaryOutputPath = result.created.includes(summary.primaryOutputPath ?? "") ? summary.primaryOutputPath : result.created[0];
    result.folders = [...new Set(result.created.map((file) => path.dirname(file)))];
    return result;
  }
}
