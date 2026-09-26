import { describe, expect, it } from "vitest";
import { collapseSettledExecutionRows, type TaskFeedRow } from "../task-feed-logic";
import type { TaskEvent } from "../../../../shared/types";

const event = (id: string, type: string, timestamp = 1, payload: Record<string, unknown> = {}): TaskEvent =>
  ({ id, type, timestamp, taskId: "test", payload } as TaskEvent);
const row = (entry: TaskEvent): TaskFeedRow => ({
  kind: "timeline", key: entry.id, item: { kind: "event", event: entry }, timelineIndex: 0,
  estimatedHeight: 40, revision: entry.id, visiblePerfEventId: entry.id,
});
const block = (id: string, events: TaskEvent[]): TaskFeedRow => ({
  kind: "timeline", key: id, item: { kind: "action_block", events }, timelineIndex: 1,
  estimatedHeight: 80, revision: id, visiblePerfEventId: null,
});
const settled = { isTaskWorking: false, isReplayMode: false };

describe("settled execution process", () => {
  it("folds every retry and draft into one row and keeps the final answer and file visible", () => {
    const answer = row(event("answer", "assistant_message", 600, { message: "已完成" }));
    const files: TaskFeedRow = { kind: "artifact-stack", key: "files", artifacts: [], estimatedHeight: 80, revision: "1", visiblePerfEventId: null };
    const entries = [row(event("user", "user_message")), row(event("draft", "artifact_created", 2)),
      block("first", [event("tool1", "tool_call", 10)]), block("retry", [event("tool2", "tool_call", 500)]), answer, files];
    const result = collapseSettledExecutionRows(entries, settled);
    expect(result.map((entry) => entry.kind)).toEqual(["timeline", "execution-summary", "timeline", "artifact-stack"]);
    const summary = result[1];
    expect(summary.kind === "execution-summary" && summary.rows.map((entry) => entry.key)).toEqual(["draft", "first", "retry"]);
    expect(result.slice(-2)).toEqual([answer, files]);
  });

  it("collapses the previous turn but keeps the active turn live, then folds it when it ends", () => {
    const entries = [row(event("u1", "user_message")), row(event("t1", "tool_result")),
      row(event("a1", "assistant_message")), row(event("u2", "user_message")), row(event("t2", "tool_result"))];
    const live = collapseSettledExecutionRows(entries, { ...settled, isTaskWorking: true });
    expect(live.filter((entry) => entry.kind === "execution-summary")).toHaveLength(1);
    expect(live.at(-1)?.key).toBe("t2");
    expect(collapseSettledExecutionRows(entries, settled).filter((entry) => entry.kind === "execution-summary")).toHaveLength(2);
  });

  it("leaves the final unresolved failure visible, but hides recovered attempts", () => {
    const result = collapseSettledExecutionRows([
      block("tools", [event("recovered", "error", 1, { recoveredIntermediateFailure: true }), event("terminal", "error", 2)]),
    ], settled);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe("execution-summary");
    expect(result[1].kind === "timeline" && result[1].item.event.id).toBe("terminal");
  });

  it("keeps a pending approval accessible outside the collapsed process", () => {
    const result = collapseSettledExecutionRows([block("tools", [event("approval", "approval_requested")])], settled);
    expect(result[1].kind === "timeline" && result[1].item.event.id).toBe("approval");
  });

  it("does not surface resolved errors after successful completion", () => {
    const result = collapseSettledExecutionRows([block("tools", [event("old", "error", 1), event("done", "task_completed", 2)])], settled);
    expect(result.map((entry) => entry.kind)).toEqual(["execution-summary"]);
  });

  it("extracts the final reply when completion is nested inside an action block", () => {
    const result = collapseSettledExecutionRows([
      block("tools", [event("tool", "tool_result"), event("done", "task_completed", 2, { resultSummary: "最终交付内容" })]),
    ], settled);
    expect(result[0].kind).toBe("execution-summary");
    expect(result[1].kind === "timeline" && result[1].item.event.payload.resultSummary).toBe("最终交付内容");
  });

  it("preserves replay and conversation-only turns", () => {
    const entries = [row(event("user", "user_message")), row(event("answer", "assistant_message"))];
    expect(collapseSettledExecutionRows(entries, settled)).toEqual(entries);
    expect(collapseSettledExecutionRows(entries, { ...settled, isReplayMode: true })).toBe(entries);
  });
});
