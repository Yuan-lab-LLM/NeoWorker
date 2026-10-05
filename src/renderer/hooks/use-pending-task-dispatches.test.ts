import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskEvent } from "../../shared/types";
import { usePendingTaskDispatches } from "./use-pending-task-dispatches";

let view: ReactTestRenderer;
let dispatches: ReturnType<typeof usePendingTaskDispatches>;
const task = { id: "team", status: "executing", createdAt: 100, updatedAt: 100 } as Task;
function Probe({ current = task, events = [] }: { current?: Task; events?: TaskEvent[] }) {
  dispatches = usePendingTaskDispatches(current.id, current, events);
  return null;
}
afterEach(async () => {
  if (view) await act(async () => view.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(Date, "now").mockReturnValue(1000);
  await act(async () => { view = create(React.createElement(Probe)); });
}
describe("pending IPC does not own the Stop button", () => {
  it("clears on Stop, and a late IPC completion cannot clear a newer send", async () => {
    await mount();
    let finishOld!: () => void;
    await act(async () => { finishOld = dispatches.begin(); });
    expect(dispatches.count).toBe(1);
    await act(async () => { dispatches.clear(); });
    expect(dispatches.count).toBe(0);
    await act(async () => { dispatches.begin(); });
    await act(async () => { finishOld(); });
    expect(dispatches.count).toBe(1);
  });
  it.each(["completed", "failed", "cancelled"])("clears a hung IPC on canonical %s", async (status) => {
    await mount();
    await act(async () => { dispatches.begin(); });
    const terminal = { id: "end", taskId: task.id, timestamp: 2000,
      type: "timeline_step_updated", payload: { legacyType: "task_status", status } } as TaskEvent;
    await act(async () => { view.update(React.createElement(Probe, { events: [terminal] })); });
    expect(dispatches.count).toBe(0);
  });
  it("ignores an old completion and reconciles a newer durable terminal row", async () => {
    await mount();
    await act(async () => { dispatches.begin(); });
    await act(async () => { view.update(React.createElement(Probe, {
      current: { ...task, status: "completed", completedAt: 500, updatedAt: 500 },
    })); });
    expect(dispatches.count).toBe(1);
    await act(async () => { view.update(React.createElement(Probe, {
      current: { ...task, status: "completed", completedAt: 2000, updatedAt: 2000 },
    })); });
    expect(dispatches.count).toBe(0);
  });
});
