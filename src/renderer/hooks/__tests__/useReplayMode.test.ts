import { describe, expect, it } from "vitest";

import type { TaskEvent } from "../../../shared/types";
import { getReplayStartIndex } from "../useReplayMode";

function makeEvent(id: string): TaskEvent {
  return {
    id,
    taskId: "task-1",
    type: "task_created",
    timestamp: 1,
    schemaVersion: 2,
    payload: {},
  };
}

describe("getReplayStartIndex", () => {
  it("starts an available replay on the first event instead of an empty frame", () => {
    expect(getReplayStartIndex([makeEvent("event-1")])).toBe(1);
    expect(getReplayStartIndex([makeEvent("event-1"), makeEvent("event-2")])).toBe(1);
  });

  it("does not start replay when the session has no events", () => {
    expect(getReplayStartIndex([])).toBe(0);
  });
});
